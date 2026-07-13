import mongoose from 'mongoose';

import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_SUBJECT_KINDS,
  TaskModel,
  type TaskDocument,
  type TaskPriority,
  type TaskStatus,
  type TaskSubjectKind,
} from './task.model';

// AIN-P1-09 (AINTEL_WHEEL_SPEC.md §2): manual task lifecycle.
// Transition rules: open ↔ in_progress/blocked, both may end done/cancelled;
// done and cancelled are terminal. 'done' requires a resolution outcome;
// 'blocked' requires blockedReason.
const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ['in_progress', 'done', 'cancelled', 'blocked'],
  in_progress: ['done', 'cancelled', 'blocked', 'open'],
  blocked: ['open', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

export class TaskError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type ActorContext = {
  tenantId: string;
  actorUserId: string;
  actorEmployeeId: string | null;
  roles: string[];
};

function cleanString(value: unknown, maxLength = 300): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().slice(0, maxLength) : '';
}

function parseObjectId(value: unknown, field: string): mongoose.Types.ObjectId | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!mongoose.isValidObjectId(String(value))) {
    throw new TaskError(`Neveljaven ID (${field}).`);
  }
  return new mongoose.Types.ObjectId(String(value));
}

function parseDueAt(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new TaskError('Neveljaven rok (dueAt).');
  }
  return date;
}

export type CreateTaskInput = {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  subject?: { kind?: unknown; id?: unknown; label?: unknown };
  assigneeEmployeeId?: unknown;
  assigneeRole?: unknown;
  priority?: unknown;
  dueAt?: unknown;
  dedupeKey?: unknown;
};

export async function createTask(context: ActorContext, input: CreateTaskInput): Promise<TaskDocument> {
  const title = cleanString(input.title, 200);
  if (!title) throw new TaskError('Naslov opravila (title) je obvezen.');

  const subjectKind = (cleanString(input.subject?.kind, 30) || 'none') as TaskSubjectKind;
  if (!TASK_SUBJECT_KINDS.includes(subjectKind)) {
    throw new TaskError(`Neveljaven subjekt (subject.kind). Dovoljeno: ${TASK_SUBJECT_KINDS.join(', ')}.`);
  }
  const subjectId = parseObjectId(input.subject?.id, 'subject.id');
  if (subjectKind !== 'none' && !subjectId) {
    throw new TaskError('Subjekt potrebuje ID (subject.id), razen pri kind="none".');
  }

  let assigneeEmployeeId = parseObjectId(input.assigneeEmployeeId, 'assigneeEmployeeId');
  const assigneeRole = cleanString(input.assigneeRole, 30).toUpperCase() || undefined;
  if (!assigneeEmployeeId && !assigneeRole) {
    // Owner semantics (§2): a task always has an owner. Without an explicit
    // assignee, default to the creator's employee record when there is one.
    if (context.actorEmployeeId) {
      assigneeEmployeeId = new mongoose.Types.ObjectId(context.actorEmployeeId);
    } else {
      throw new TaskError('Opravilo mora imeti lastnika: assigneeEmployeeId ali assigneeRole.');
    }
  }

  const priority = (cleanString(input.priority, 20) || 'normal') as TaskPriority;
  if (!TASK_PRIORITIES.includes(priority)) {
    throw new TaskError(`Neveljavna prioriteta. Dovoljeno: ${TASK_PRIORITIES.join(', ')}.`);
  }

  const dedupeKey = cleanString(input.dedupeKey, 200) || undefined;
  if (dedupeKey) {
    const existing = await TaskModel.findOne({ dedupeKey }).lean();
    if (existing) throw new TaskError('Opravilo s tem dedupeKey že obstaja.', 409);
  }

  return TaskModel.create({
    tenantId: context.tenantId || 'inteligent',
    type: cleanString(input.type, 60) || 'manual',
    title,
    description: cleanString(input.description, 2000),
    subject: { kind: subjectKind, id: subjectId, label: cleanString(input.subject?.label, 160) },
    assigneeEmployeeId,
    assigneeRole,
    priority,
    dueAt: parseDueAt(input.dueAt),
    source: { kind: 'user', userId: parseObjectId(context.actorUserId, 'actorUserId') },
    dedupeKey,
    history: [{ at: new Date(), byUserId: parseObjectId(context.actorUserId, 'actorUserId'), action: 'created' }],
  });
}

export type MyTasksFilters = { status?: unknown; dueBefore?: unknown; subjectKind?: unknown };

export async function listMyTasks(context: ActorContext, filters: MyTasksFilters) {
  const or: Record<string, unknown>[] = [];
  if (context.actorEmployeeId) {
    or.push({ assigneeEmployeeId: new mongoose.Types.ObjectId(context.actorEmployeeId) });
  }
  if (context.roles.length) {
    // Role-pool tasks: assigned to one of my roles and not yet claimed by a person.
    or.push({ assigneeRole: { $in: context.roles }, assigneeEmployeeId: { $in: [null, undefined] } });
  }
  if (!or.length) return { tasks: [], counts: { open: 0, overdue: 0 } };

  const query: Record<string, unknown> = { tenantId: context.tenantId, $or: or };
  const status = cleanString(filters.status, 20);
  if (status) {
    if (!TASK_STATUSES.includes(status as TaskStatus)) throw new TaskError('Neveljaven status filter.');
    query.status = status;
  } else {
    query.status = { $in: ['open', 'in_progress', 'blocked'] };
  }
  const subjectKind = cleanString(filters.subjectKind, 30);
  if (subjectKind) query['subject.kind'] = subjectKind;
  const dueBefore = filters.dueBefore ? parseDueAt(filters.dueBefore) : undefined;
  if (dueBefore) query.dueAt = { $lte: dueBefore };

  const tasks = await TaskModel.find(query).sort({ dueAt: 1, priority: -1, createdAt: 1 }).limit(500).lean();
  const now = Date.now();
  const openStatuses = new Set(['open', 'in_progress']);
  const counts = {
    open: tasks.filter((t) => openStatuses.has(t.status)).length,
    overdue: tasks.filter((t) => openStatuses.has(t.status) && t.dueAt && new Date(t.dueAt).getTime() < now).length,
  };
  return { tasks, counts };
}

export type AdminTasksFilters = {
  status?: unknown;
  assigneeEmployeeId?: unknown;
  assigneeRole?: unknown;
  type?: unknown;
  subjectKind?: unknown;
};

export async function listTasks(context: ActorContext, filters: AdminTasksFilters) {
  const query: Record<string, unknown> = { tenantId: context.tenantId };
  const status = cleanString(filters.status, 20);
  if (status) query.status = status;
  const assignee = parseObjectId(filters.assigneeEmployeeId, 'assigneeEmployeeId');
  if (assignee) query.assigneeEmployeeId = assignee;
  const role = cleanString(filters.assigneeRole, 30).toUpperCase();
  if (role) query.assigneeRole = role;
  const type = cleanString(filters.type, 60);
  if (type) query.type = type;
  const subjectKind = cleanString(filters.subjectKind, 30);
  if (subjectKind) query['subject.kind'] = subjectKind;

  const tasks = await TaskModel.find(query).sort({ status: 1, dueAt: 1, createdAt: 1 }).limit(1000).lean();
  const now = Date.now();
  return tasks.map((task) => ({
    ...task,
    ageDays: Math.floor((now - new Date(task.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
    overdue: Boolean(task.dueAt && ['open', 'in_progress'].includes(task.status) && new Date(task.dueAt).getTime() < now),
  }));
}

export async function listTasksBySubject(context: ActorContext, kindRaw: string, idRaw: string) {
  const kind = cleanString(kindRaw, 30) as TaskSubjectKind;
  if (!TASK_SUBJECT_KINDS.includes(kind) || kind === 'none') {
    throw new TaskError('Neveljaven subjekt (kind).');
  }
  const id = parseObjectId(idRaw, 'id');
  if (!id) throw new TaskError('Neveljaven ID subjekta.');
  return TaskModel.find({ tenantId: context.tenantId, 'subject.kind': kind, 'subject.id': id })
    .sort({ status: 1, dueAt: 1 })
    .limit(200)
    .lean();
}

export type UpdateTaskInput = {
  action?: unknown; // claim | complete | block | unblock | cancel | reassign | reschedule | reopen
  resolution?: { outcome?: unknown; note?: unknown };
  blockedReason?: unknown;
  assigneeEmployeeId?: unknown;
  assigneeRole?: unknown;
  dueAt?: unknown;
  priority?: unknown;
  note?: unknown;
};

function assertTransition(task: TaskDocument, to: TaskStatus) {
  if (!STATUS_TRANSITIONS[task.status].includes(to)) {
    throw new TaskError(`Prehod ${task.status} → ${to} ni dovoljen.`);
  }
}

export async function updateTask(context: ActorContext, taskId: string, input: UpdateTaskInput): Promise<TaskDocument> {
  const id = parseObjectId(taskId, 'taskId');
  if (!id) throw new TaskError('Neveljaven ID opravila.');
  const task = await TaskModel.findOne({ _id: id, tenantId: context.tenantId });
  if (!task) throw new TaskError('Opravilo ne obstaja.', 404);

  const actorUserId = parseObjectId(context.actorUserId, 'actorUserId');
  const action = cleanString(input.action, 30);
  const note = cleanString(input.note, 500) || undefined;
  const record = (entry: string, extra?: string) => {
    task.history.push({ at: new Date(), byUserId: actorUserId, action: entry, note: extra ?? note });
  };

  switch (action) {
    case 'claim': {
      if (!context.actorEmployeeId) throw new TaskError('Prevzem zahteva zaposlenega (employee).', 403);
      assertTransition(task, 'in_progress');
      task.assigneeEmployeeId = new mongoose.Types.ObjectId(context.actorEmployeeId);
      task.status = 'in_progress';
      record('claimed');
      break;
    }
    case 'complete': {
      assertTransition(task, 'done');
      const outcome = cleanString(input.resolution?.outcome, 120);
      if (!outcome) throw new TaskError('Zaključek zahteva izid (resolution.outcome).');
      if (!actorUserId) throw new TaskError('Manjka uporabnik.', 401);
      task.status = 'done';
      task.resolution = {
        outcome,
        note: cleanString(input.resolution?.note, 1000),
        resolvedBy: actorUserId,
        resolvedAt: new Date(),
      };
      record('completed', outcome);
      break;
    }
    case 'block': {
      assertTransition(task, 'blocked');
      const reason = cleanString(input.blockedReason, 300);
      if (!reason) throw new TaskError('Blokada zahteva razlog (blockedReason).');
      task.status = 'blocked';
      task.blockedReason = reason;
      record('blocked', reason);
      break;
    }
    case 'unblock': {
      assertTransition(task, task.assigneeEmployeeId ? 'in_progress' : 'open');
      task.status = task.assigneeEmployeeId ? 'in_progress' : 'open';
      task.blockedReason = undefined;
      record('unblocked');
      break;
    }
    case 'cancel': {
      assertTransition(task, 'cancelled');
      task.status = 'cancelled';
      record('cancelled');
      break;
    }
    case 'reopen': {
      // Give back to the pool (or keep the person) without losing history.
      assertTransition(task, 'open');
      task.status = 'open';
      record('reopened');
      break;
    }
    case 'reassign': {
      const assigneeEmployeeId = parseObjectId(input.assigneeEmployeeId, 'assigneeEmployeeId');
      const assigneeRole = cleanString(input.assigneeRole, 30).toUpperCase() || undefined;
      if (!assigneeEmployeeId && !assigneeRole) {
        throw new TaskError('Prerazporeditev zahteva assigneeEmployeeId ali assigneeRole.');
      }
      task.assigneeEmployeeId = assigneeEmployeeId;
      task.assigneeRole = assigneeRole ?? task.assigneeRole;
      if (!assigneeEmployeeId && task.status === 'in_progress') task.status = 'open';
      record('reassigned');
      break;
    }
    case 'reschedule': {
      task.dueAt = parseDueAt(input.dueAt);
      task.slaBreachedAt = undefined;
      record('rescheduled');
      break;
    }
    default:
      throw new TaskError('Neveljavna akcija. Dovoljeno: claim, complete, block, unblock, cancel, reopen, reassign, reschedule.');
  }

  const priority = cleanString(input.priority, 20);
  if (priority) {
    if (!TASK_PRIORITIES.includes(priority as TaskPriority)) throw new TaskError('Neveljavna prioriteta.');
    task.priority = priority as TaskPriority;
  }

  await task.save();
  return task;
}
