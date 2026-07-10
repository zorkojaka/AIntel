import { Request, Response } from 'express';

import {
  createTask,
  listMyTasks,
  listTasks,
  listTasksBySubject,
  TaskError,
  updateTask,
  type ActorContext,
} from './task.service';
import { previewOfferFollowUpEmail, sendOfferFollowUpEmail } from './follow-up-email.service';
import {
  createTaskTemplate,
  deleteTaskTemplate,
  listTaskTemplates,
  updateTaskTemplate,
} from './task-template.service';

function actorContext(req: Request): ActorContext {
  const context = (req as any).context ?? {};
  return {
    tenantId: context.tenantId ?? 'inteligent',
    actorUserId: context.actorUserId ?? '',
    actorEmployeeId: context.actorEmployeeId ?? null,
    roles: Array.isArray(context.roles) ? context.roles : [],
  };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof TaskError) {
    return res.fail(error.message, error.statusCode);
  }
  (res.req as any)?.log?.error?.({ err: error }, fallback);
  return res.fail(fallback, 500);
}

export async function getMyTasks(req: Request, res: Response) {
  try {
    const result = await listMyTasks(actorContext(req), {
      status: req.query.status,
      dueBefore: req.query.dueBefore,
      subjectKind: req.query.subjectKind,
    });
    return res.success(result);
  } catch (error) {
    return handleError(res, error, 'Opravil ni mogoče prebrati.');
  }
}

export async function getTasks(req: Request, res: Response) {
  try {
    const tasks = await listTasks(actorContext(req), {
      status: req.query.status,
      assigneeEmployeeId: req.query.assigneeEmployeeId,
      assigneeRole: req.query.assigneeRole,
      type: req.query.type,
      subjectKind: req.query.subjectKind,
    });
    return res.success(tasks);
  } catch (error) {
    return handleError(res, error, 'Opravil ni mogoče prebrati.');
  }
}

export async function getTasksBySubject(req: Request, res: Response) {
  try {
    const tasks = await listTasksBySubject(actorContext(req), String(req.params.kind), String(req.params.id));
    return res.success(tasks);
  } catch (error) {
    return handleError(res, error, 'Opravil subjekta ni mogoče prebrati.');
  }
}

export async function postTask(req: Request, res: Response) {
  try {
    const task = await createTask(actorContext(req), req.body ?? {});
    return res.success(task, 201);
  } catch (error) {
    return handleError(res, error, 'Opravila ni bilo mogoče ustvariti.');
  }
}

export async function patchTask(req: Request, res: Response) {
  try {
    const task = await updateTask(actorContext(req), String(req.params.id), req.body ?? {});
    return res.success(task);
  } catch (error) {
    return handleError(res, error, 'Opravila ni bilo mogoče posodobiti.');
  }
}

export async function previewTaskFollowUpEmail(req: Request, res: Response) {
  try {
    const draft = await previewOfferFollowUpEmail(actorContext(req), String(req.params.id));
    return res.success(draft);
  } catch (error) {
    return handleError(res, error, 'Follow-up e-maila ni mogoče pripraviti.');
  }
}

export async function sendTaskFollowUpEmail(req: Request, res: Response) {
  try {
    const result = await sendOfferFollowUpEmail(actorContext(req), String(req.params.id), req.body ?? {}, req as any);
    return res.success(result);
  } catch (error) {
    return handleError(res, error, 'Follow-up e-maila ni mogoče poslati.');
  }
}

// Predloge opravil (Nastavitve → Opravila): branje za vse prijavljene
// (hitri izbor pri novem opravilu), upravljanje ADMIN-only.
export async function getTaskTemplates(req: Request, res: Response) {
  try {
    const activeOnly = req.query.all !== '1';
    const templates = await listTaskTemplates(actorContext(req), { activeOnly });
    return res.success(templates);
  } catch (error) {
    return handleError(res, error, 'Predlog opravil ni mogoče prebrati.');
  }
}

export async function postTaskTemplate(req: Request, res: Response) {
  try {
    const template = await createTaskTemplate(actorContext(req), req.body ?? {});
    return res.success(template, 201);
  } catch (error) {
    return handleError(res, error, 'Predloge opravila ni bilo mogoče ustvariti.');
  }
}

export async function patchTaskTemplate(req: Request, res: Response) {
  try {
    const template = await updateTaskTemplate(actorContext(req), String(req.params.id), req.body ?? {});
    return res.success(template);
  } catch (error) {
    return handleError(res, error, 'Predloge opravila ni bilo mogoče posodobiti.');
  }
}

export async function removeTaskTemplate(req: Request, res: Response) {
  try {
    return res.success(await deleteTaskTemplate(actorContext(req), String(req.params.id)));
  } catch (error) {
    return handleError(res, error, 'Predloge opravila ni bilo mogoče izbrisati.');
  }
}

// Privzete vrednosti za checkbox »follow-up« v dialogu pošiljanja ponudbe —
// za vse prijavljene (wheel-config je ADMIN-only, tu je le izvleček).
export async function getFollowUpDefaults(req: Request, res: Response) {
  try {
    const { getRuleMode, getWheelConfig: readConfig } = await import('../scheduler/wheel-config');
    const [mode, config] = await Promise.all([getRuleMode('offer.follow_up'), readConfig()]);
    return res.success({ mode, days: config.params.offerFollowUpDays });
  } catch (error) {
    return handleError(res, error, 'Privzetih vrednosti follow-upa ni mogoče prebrati.');
  }
}

// AIN-P1-11: stikala in parametri pravil kolesa (wheel_settings). ADMIN-only.
export async function getWheelConfig(req: Request, res: Response) {
  try {
    const { getWheelConfig: readConfig } = await import('../scheduler/wheel-config');
    return res.success(await readConfig());
  } catch (error) {
    return handleError(res, error, 'Nastavitev kolesa ni mogoče prebrati.');
  }
}

export async function putWheelConfig(req: Request, res: Response) {
  try {
    const { setWheelConfig, getWheelConfig: readConfig } = await import('../scheduler/wheel-config');
    await setWheelConfig(req.body ?? {});
    return res.success(await readConfig());
  } catch (error) {
    if (error instanceof Error && /Nezn|Neveljavna/.test(error.message)) {
      return res.fail(error.message, 400);
    }
    return handleError(res, error, 'Nastavitev kolesa ni bilo mogoče shraniti.');
  }
}
