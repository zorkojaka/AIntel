import { isValidObjectId, Types } from 'mongoose';

import { CrmNoteModel } from '../schemas/note';
import { CrmClientModel } from '../schemas/client';
import { ProjectModel } from '../../projects/schemas/project';

export class ClientNoteError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface NoteAuthor {
  userId?: string | null;
  name?: string | null;
}

export interface ClientNoteView {
  _id: string;
  content: string;
  projectId: string | null;
  /** Naslov projekta, na katerem je zapis nastal — da je v dosjeju vidno, od kod je. */
  projectTitle: string | null;
  createdByName: string;
  createdAt: string;
}

const MAX_LENGTH = 5000;

function normalizeContent(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new ClientNoteError('Zapis je prazen.');
  }
  if (text.length > MAX_LENGTH) {
    throw new ClientNoteError(`Zapis je predolg (največ ${MAX_LENGTH} znakov).`);
  }
  return text;
}

function requireClientId(clientId: string) {
  if (!clientId || !isValidObjectId(clientId)) {
    throw new ClientNoteError('Neveljaven ID stranke.');
  }
  return new Types.ObjectId(clientId);
}

async function decorateWithProjects(notes: Array<Record<string, any>>): Promise<ClientNoteView[]> {
  const projectIds = Array.from(
    new Set(notes.map((note) => note.projectId).filter((id): id is string => typeof id === 'string' && !!id)),
  );
  const projects = projectIds.length
    ? await ProjectModel.find({ id: { $in: projectIds } }).select({ id: 1, title: 1 }).lean()
    : [];
  const titleById = new Map<string, string>(projects.map((project) => [String(project.id), String(project.title ?? '')]));

  return notes.map((note) => ({
    _id: String(note._id),
    content: note.content,
    projectId: note.projectId ?? null,
    projectTitle: note.projectId ? titleById.get(note.projectId) ?? null : null,
    createdByName: note.created_by_name || 'Neznan avtor',
    createdAt: new Date(note.created_at ?? note.createdAt ?? Date.now()).toISOString(),
  }));
}

/** Vsi interni zapisi o stranki, ne glede na to, na katerem projektu so nastali. */
export async function listClientNotes(clientId: string): Promise<ClientNoteView[]> {
  const entityId = requireClientId(clientId);
  const notes = await CrmNoteModel.find({ entity_type: 'client', entity_id: entityId })
    .sort({ created_at: -1 })
    .lean();
  return decorateWithProjects(notes);
}

export async function addClientNote(params: {
  clientId: string;
  content: unknown;
  projectId?: string | null;
  author: NoteAuthor;
}): Promise<ClientNoteView> {
  const entityId = requireClientId(params.clientId);
  const content = normalizeContent(params.content);

  const client = await CrmClientModel.findById(entityId).select({ _id: 1 }).lean();
  if (!client) {
    throw new ClientNoteError('Stranka ni najdena.', 404);
  }

  const created = await CrmNoteModel.create({
    content,
    entity_type: 'client',
    entity_id: entityId,
    projectId: params.projectId?.trim() || null,
    created_by: params.author.userId && isValidObjectId(params.author.userId)
      ? new Types.ObjectId(params.author.userId)
      : undefined,
    created_by_name: params.author.name?.trim() || '',
    created_at: new Date(),
  });

  const [view] = await decorateWithProjects([created.toObject()]);
  return view;
}

/** Stranka projekta — delovni nalog pozna samo projekt, zapisi pa živijo na stranki. */
export async function resolveProjectClientId(projectId: string) {
  const project = await ProjectModel.findOne({ id: projectId }).select({ clientId: 1 }).lean();
  if (!project) {
    throw new ClientNoteError('Projekt ni najden.', 404);
  }
  if (!project.clientId) {
    throw new ClientNoteError('Projekt nima povezane stranke, zato zapisov ni mogoče voditi.', 409);
  }
  return String(project.clientId);
}

export async function listClientNotesForProject(projectId: string) {
  const clientId = await resolveProjectClientId(projectId);
  const notes = await listClientNotes(clientId);
  return { clientId, notes };
}

export async function addClientNoteFromProject(params: {
  projectId: string;
  content: unknown;
  author: NoteAuthor;
}) {
  const clientId = await resolveProjectClientId(params.projectId);
  return addClientNote({
    clientId,
    content: params.content,
    projectId: params.projectId,
    author: params.author,
  });
}
