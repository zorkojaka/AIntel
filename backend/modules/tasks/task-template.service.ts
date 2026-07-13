import mongoose from 'mongoose';

import { ROLE_VALUES } from '../../utils/roles';
import { TASK_PRIORITIES, type TaskPriority } from './task.model';
import { TaskTemplateModel, type TaskTemplateDocument } from './task-template.model';
import { TaskError, type ActorContext } from './task.service';

// Privzete predloge tipičnih procesov (varnostni sistemi: prodaja → ogled →
// ponudba → material → montaža). Vpišejo se ob prvem branju, ko podjetje še
// nima svojih — od tam naprej jih ureja v Nastavitve → Opravila.
const DEFAULT_TEMPLATES: Array<
  Pick<TaskTemplateDocument, 'name' | 'title' | 'description' | 'priority' | 'dueInDays' | 'assigneeRole'>
> = [
  { name: 'Pokliči stranko', title: 'Pokliči stranko', description: 'Prvi kontakt ali dogovor o naslednjem koraku.', priority: 'high', dueInDays: 1, assigneeRole: 'SALES' },
  { name: 'Ogled na lokaciji', title: 'Dogovori in opravi ogled na lokaciji', description: 'Termin s stranko, popis prostorov in zahtev.', priority: 'normal', dueInDays: 2, assigneeRole: 'SALES' },
  { name: 'Pripravi ponudbo', title: 'Pripravi ponudbo', description: 'Postavke iz cenika, popusti, scenarij izvedbe.', priority: 'high', dueInDays: 2, assigneeRole: 'SALES' },
  { name: 'Follow-up ponudbe', title: 'Follow-up poslane ponudbe', description: 'Preveri, ali je stranka pregledala ponudbo; ponudi pomoč.', priority: 'normal', dueInDays: 7, assigneeRole: 'SALES' },
  { name: 'Naroči material', title: 'Naroči material za projekt', description: 'Naročilnice dobaviteljem po potrjeni ponudbi.', priority: 'high', dueInDays: 1, assigneeRole: 'ORGANIZER' },
  { name: 'Termin montaže', title: 'Uskladi termin montaže s stranko', description: 'Termin + ekipa, ko je material pripravljen.', priority: 'normal', dueInDays: 2, assigneeRole: 'ORGANIZER' },
  { name: 'Servisni obisk', title: 'Servisni obisk pri stranki', description: 'Odprava napake ali redni servis.', priority: 'normal', dueInDays: 3, assigneeRole: 'EXECUTION' },
];

function cleanString(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().slice(0, maxLength) : '';
}

function parsePriority(value: unknown, fallback: TaskPriority = 'normal'): TaskPriority {
  const priority = cleanString(value, 20) as TaskPriority;
  return TASK_PRIORITIES.includes(priority) ? priority : fallback;
}

function parseDueInDays(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 365) {
    throw new TaskError('Rok predloge mora biti med 0 in 365 dni.');
  }
  return Math.round(n);
}

function parseAssigneeRole(value: unknown): string | undefined {
  const role = cleanString(value, 30).toUpperCase();
  if (!role) return undefined;
  if (!(ROLE_VALUES as readonly string[]).includes(role)) {
    throw new TaskError(`Neznana vloga "${role}". Dovoljene: ${ROLE_VALUES.join(', ')}`);
  }
  return role;
}

function templateId(value: string) {
  if (!mongoose.isValidObjectId(value)) throw new TaskError('Neveljaven ID predloge.');
  return new mongoose.Types.ObjectId(value);
}

async function ensureDefaultTemplates(tenantId: string) {
  const count = await TaskTemplateModel.countDocuments({ tenantId });
  if (count > 0) return;
  await TaskTemplateModel.insertMany(
    DEFAULT_TEMPLATES.map((template, index) => ({ ...template, tenantId, isActive: true, order: index })),
  );
}

export async function listTaskTemplates(context: ActorContext, options: { activeOnly?: boolean } = {}) {
  await ensureDefaultTemplates(context.tenantId);
  const query: Record<string, unknown> = { tenantId: context.tenantId };
  if (options.activeOnly) query.isActive = true;
  return TaskTemplateModel.find(query).sort({ order: 1, createdAt: 1 }).lean();
}

export type TaskTemplateInput = {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  dueInDays?: unknown;
  assigneeRole?: unknown;
  isActive?: unknown;
  order?: unknown;
};

export async function createTaskTemplate(context: ActorContext, input: TaskTemplateInput) {
  const name = cleanString(input.name, 80);
  const title = cleanString(input.title, 200) || name;
  if (!name) throw new TaskError('Ime predloge je obvezno.');
  const last = await TaskTemplateModel.findOne({ tenantId: context.tenantId }).sort({ order: -1 }).lean();
  const template = await TaskTemplateModel.create({
    tenantId: context.tenantId,
    name,
    title,
    description: cleanString(input.description, 2000),
    priority: parsePriority(input.priority),
    dueInDays: parseDueInDays(input.dueInDays),
    assigneeRole: parseAssigneeRole(input.assigneeRole),
    isActive: input.isActive !== false,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : (last?.order ?? -1) + 1,
  });
  return template.toObject();
}

export async function updateTaskTemplate(context: ActorContext, id: string, input: TaskTemplateInput) {
  const template = await TaskTemplateModel.findOne({ _id: templateId(id), tenantId: context.tenantId });
  if (!template) throw new TaskError('Predloga ne obstaja.', 404);

  if (input.name !== undefined) {
    const name = cleanString(input.name, 80);
    if (!name) throw new TaskError('Ime predloge je obvezno.');
    template.name = name;
  }
  if (input.title !== undefined) {
    const title = cleanString(input.title, 200);
    if (!title) throw new TaskError('Naslov opravila v predlogi je obvezen.');
    template.title = title;
  }
  if (input.description !== undefined) template.description = cleanString(input.description, 2000);
  if (input.priority !== undefined) template.priority = parsePriority(input.priority, template.priority);
  if (input.dueInDays !== undefined) template.dueInDays = parseDueInDays(input.dueInDays);
  if (input.assigneeRole !== undefined) template.assigneeRole = parseAssigneeRole(input.assigneeRole);
  if (input.isActive !== undefined) template.isActive = input.isActive === true;
  if (input.order !== undefined && Number.isFinite(Number(input.order))) template.order = Number(input.order);

  await template.save();
  return template.toObject();
}

export async function deleteTaskTemplate(context: ActorContext, id: string) {
  const result = await TaskTemplateModel.deleteOne({ _id: templateId(id), tenantId: context.tenantId });
  if (result.deletedCount === 0) throw new TaskError('Predloga ne obstaja.', 404);
  return { deleted: true };
}
