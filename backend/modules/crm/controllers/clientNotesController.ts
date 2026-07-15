import { Request, Response } from 'express';

import {
  ClientNoteError,
  addClientNote,
  addClientNoteFromProject,
  listClientNotes,
  listClientNotesForProject,
  type NoteAuthor,
} from '../services/client-notes.service';

function author(req: Request): NoteAuthor {
  const context = (req as any).context ?? {};
  const employee = (req as any).authEmployee;
  const user = (req as any).authUser;
  return {
    userId: context.actorUserId ?? null,
    name: employee?.name || user?.name || user?.email || '',
  };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ClientNoteError) {
    return res.fail(error.message, error.statusCode);
  }
  (res.req as any)?.log?.error?.({ err: error }, fallback);
  return res.fail(fallback, 500);
}

export async function getClientNotes(req: Request, res: Response) {
  try {
    const notes = await listClientNotes(req.params.clientId);
    return res.success({ notes });
  } catch (error) {
    return handleError(res, error, 'Zapisov o stranki ni bilo mogoče naložiti.');
  }
}

export async function postClientNote(req: Request, res: Response) {
  try {
    const note = await addClientNote({
      clientId: req.params.clientId,
      content: req.body?.content,
      projectId: req.body?.projectId ?? null,
      author: author(req),
    });
    return res.success({ note }, 201);
  } catch (error) {
    return handleError(res, error, 'Zapisa ni bilo mogoče shraniti.');
  }
}

export async function getProjectClientNotes(req: Request, res: Response) {
  try {
    const result = await listClientNotesForProject(req.params.projectId);
    return res.success(result);
  } catch (error) {
    return handleError(res, error, 'Zapisov o stranki ni bilo mogoče naložiti.');
  }
}

export async function postProjectClientNote(req: Request, res: Response) {
  try {
    const note = await addClientNoteFromProject({
      projectId: req.params.projectId,
      content: req.body?.content,
      author: author(req),
    });
    return res.success({ note }, 201);
  } catch (error) {
    return handleError(res, error, 'Zapisa ni bilo mogoče shraniti.');
  }
}
