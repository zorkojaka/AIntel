import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose, { Types } from 'mongoose';
import multer from 'multer';

import { ROLE_ADMIN, ROLE_EXECUTION, ROLE_FINANCE, ROLE_ORGANIZER, ROLE_SALES } from '../../utils/roles';
import { MaterialOrderModel } from '../projects/schemas/material-order';
import { ProjectModel } from '../projects/schemas/project';
import { WorkOrderModel } from '../projects/schemas/work-order';
import { PhotoModel, PHOTO_PHASES, type PhotoDocument, type PhotoPhase } from './schemas/photo';
import { processImage, sanitizeImageBaseName } from './services/image-processor.service';
import { canDeletePhoto, type PhotoPermissionUser } from './services/permissions.service';

const router = Router();
const UPLOAD_BASE_DIR = '/var/www/aintel/uploads';
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), 'aintel-photo-uploads');
const MAX_UPLOAD_SIZE = 30 * 1024 * 1024;
const PRIVILEGED_PROJECT_ROLES = [ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE, ROLE_ORGANIZER];

const tempStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
      cb(null, TEMP_UPLOAD_DIR);
    } catch (error) {
      cb(error as Error, TEMP_UPLOAD_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const suffix = Math.random().toString(36).slice(2, 10);
    cb(null, `${Date.now()}-${suffix}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  },
});

const upload = multer({
  storage: tempStorage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

function asString(value: unknown) {
  if (value instanceof Types.ObjectId) return value.toString();
  return value == null ? '' : String(value);
}

function getContext(req: Request) {
  const context = (req as any)?.context ?? {};
  return {
    roles: Array.isArray(context.roles) ? context.roles.filter((role: unknown): role is string => typeof role === 'string') : [],
    actorEmployeeId:
      typeof context.actorEmployeeId === 'string' && context.actorEmployeeId.trim().length > 0
        ? context.actorEmployeeId
        : null,
  };
}

function parsePhase(value: unknown): PhotoPhase | null {
  return typeof value === 'string' && PHOTO_PHASES.includes(value as PhotoPhase) ? (value as PhotoPhase) : null;
}

function parseUnitIndex(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function getProjectLookupQuery(projectId: string) {
  const trimmed = projectId.trim();
  if (!trimmed) return null;
  const query: Record<string, unknown>[] = [{ id: trimmed }, { code: trimmed }];
  if (mongoose.isValidObjectId(trimmed)) {
    query.unshift({ _id: new Types.ObjectId(trimmed) });
  }
  return { $or: query };
}

async function resolveProject(projectId: string) {
  const query = getProjectLookupQuery(projectId);
  if (!query) return null;
  return ProjectModel.findOne(query).lean();
}

function hasPrivilegedProjectRole(roles: string[]) {
  return roles.some((role) => PRIVILEGED_PROJECT_ROLES.includes(role));
}

async function getAssignedExecutionProjectIds(projectObjectId: string, projectBusinessId: string, actorEmployeeId: string | null) {
  if (!actorEmployeeId) return [];

  const [projectAssigned, workOrderAssigned, materialOrderAssigned] = await Promise.all([
    ProjectModel.exists({ _id: projectObjectId, assignedEmployeeIds: actorEmployeeId }),
    WorkOrderModel.exists({ projectId: projectBusinessId, assignedEmployeeIds: actorEmployeeId }),
    MaterialOrderModel.exists({ projectId: projectBusinessId, assignedEmployeeIds: actorEmployeeId }),
  ]);

  return projectAssigned || workOrderAssigned || materialOrderAssigned ? [projectObjectId] : [];
}

async function canAccessProject(req: Request, project: any) {
  const { roles, actorEmployeeId } = getContext(req);
  if (hasPrivilegedProjectRole(roles)) {
    return true;
  }
  if (!roles.includes(ROLE_EXECUTION)) {
    return false;
  }
  const assignedProjectIds = await getAssignedExecutionProjectIds(String(project._id), String(project.id), actorEmployeeId);
  return assignedProjectIds.includes(String(project._id));
}

async function buildPermissionUser(req: Request, photo: PhotoDocument): Promise<PhotoPermissionUser> {
  const { roles, actorEmployeeId } = getContext(req);
  const project = await ProjectModel.findById(photo.projectId).lean();
  const assignedExecutionProjectIds = project
    ? await getAssignedExecutionProjectIds(String(project._id), String(project.id), actorEmployeeId)
    : [];
  return {
    roles,
    employeeId: actorEmployeeId,
    assignedExecutionProjectIds,
  };
}

function serializePhoto(photo: PhotoDocument | any) {
  return {
    _id: asString(photo._id),
    id: asString(photo._id),
    projectId: asString(photo.projectId),
    phase: photo.phase,
    itemId: typeof photo.itemId === 'string' ? photo.itemId : undefined,
    unitIndex: typeof photo.unitIndex === 'number' ? photo.unitIndex : undefined,
    tag: typeof photo.tag === 'string' ? photo.tag : undefined,
    url: photo.url,
    thumbnailUrl: photo.thumbnailUrl,
    originalName: photo.originalName,
    filename: photo.filename,
    size: photo.size,
    mimeType: photo.mimeType,
    width: photo.width,
    height: photo.height,
    uploadedBy: asString(photo.uploadedBy),
    uploadedAt: photo.uploadedAt ? new Date(photo.uploadedAt).toISOString() : null,
    deletedAt: photo.deletedAt ? new Date(photo.deletedAt).toISOString() : undefined,
  };
}

async function removeFileIfExists(filePath: string | undefined) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('[photos] Failed to delete file', filePath, error);
    }
  }
}

function absolutePathFromUploadUrl(url: string | undefined) {
  if (!url || !url.startsWith('/uploads/')) return undefined;
  return path.join(UPLOAD_BASE_DIR, url.replace(/^\/uploads\//, ''));
}

router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  let processedMainPath: string | undefined;
  let processedThumbnailPath: string | undefined;

  try {
    if (!req.file) {
      return res.fail('file is required', 400);
    }

    const projectIdInput = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    if (!projectIdInput) {
      return res.fail('projectId is required', 400);
    }

    const phase = parsePhase(req.body?.phase);
    if (!phase) {
      return res.fail(`phase must be one of: ${PHOTO_PHASES.join(', ')}`, 400);
    }

    const project = await resolveProject(projectIdInput);
    if (!project) {
      return res.fail('Projekt ni najden.', 404);
    }
    if (!(await canAccessProject(req, project))) {
      return res.fail('Ni dostopa do projekta.', 403);
    }

    const { actorEmployeeId } = getContext(req);
    if (!actorEmployeeId || !mongoose.isValidObjectId(actorEmployeeId)) {
      return res.fail('Uporabnik ni povezan z zaposlenim.', 403);
    }

    const unitIndex = parseUnitIndex(req.body?.unitIndex);
    if (unitIndex === null) {
      return res.fail('unitIndex must be a non-negative integer', 400);
    }

    const itemId =
      typeof req.body?.itemId === 'string' && req.body.itemId.trim().length > 0 ? req.body.itemId.trim() : undefined;
    const tag = typeof req.body?.tag === 'string' && req.body.tag.trim().length > 0 ? req.body.tag.trim() : undefined;
    const projectObjectId = new Types.ObjectId(String(project._id));
    const timestamp = Date.now();
    const safeName = sanitizeImageBaseName(req.file.originalname);
    const filenameBase = `${timestamp}-${safeName}`;
    const relativeDir = path.join('projects', projectObjectId.toString(), phase);
    const outputDir = path.join(UPLOAD_BASE_DIR, relativeDir);

    const processed = await processImage(req.file.path, outputDir, filenameBase);
    processedMainPath = processed.mainPath;
    processedThumbnailPath = processed.thumbnailPath;

    const url = `/uploads/projects/${projectObjectId.toString()}/${phase}/${processed.filename}`;
    const thumbnailUrl = `/uploads/projects/${projectObjectId.toString()}/${phase}/${processed.thumbnailFilename}`;

    const photo = await PhotoModel.create({
      projectId: projectObjectId,
      phase,
      itemId,
      unitIndex,
      tag,
      url,
      thumbnailUrl,
      originalName: req.file.originalname,
      filename: processed.filename,
      size: processed.size,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      uploadedBy: new Types.ObjectId(actorEmployeeId),
      uploadedAt: new Date(),
    });

    return res.success({ photo: serializePhoto(photo) });
  } catch (error) {
    await Promise.all([removeFileIfExists(processedMainPath), removeFileIfExists(processedThumbnailPath)]);
    next(error);
  } finally {
    await removeFileIfExists(req.file?.path);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectIdInput = typeof req.query?.projectId === 'string' ? req.query.projectId.trim() : '';
    if (!projectIdInput) {
      return res.fail('projectId is required', 400);
    }

    const project = await resolveProject(projectIdInput);
    if (!project) {
      return res.fail('Projekt ni najden.', 404);
    }
    if (!(await canAccessProject(req, project))) {
      return res.fail('Ni dostopa do projekta.', 403);
    }

    const phase = req.query.phase === undefined ? undefined : parsePhase(req.query.phase);
    if (req.query.phase !== undefined && !phase) {
      return res.fail(`phase must be one of: ${PHOTO_PHASES.join(', ')}`, 400);
    }

    const unitIndex = parseUnitIndex(req.query.unitIndex);
    if (unitIndex === null) {
      return res.fail('unitIndex must be a non-negative integer', 400);
    }

    const filter: Record<string, unknown> = {
      projectId: new Types.ObjectId(String(project._id)),
      deletedAt: { $exists: false },
    };

    if (phase) filter.phase = phase;
    if (typeof req.query.itemId === 'string' && req.query.itemId.trim().length > 0) {
      filter.itemId = req.query.itemId.trim();
    }
    if (unitIndex !== undefined) filter.unitIndex = unitIndex;
    if (typeof req.query.tag === 'string' && req.query.tag.trim().length > 0) {
      filter.tag = req.query.tag.trim();
    }

    const photos = await PhotoModel.find(filter).sort({ uploadedAt: -1 }).lean();
    return res.success({ photos: photos.map(serializePhoto) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:photoId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.photoId)) {
      return res.fail('Neveljaven ID fotografije.', 400);
    }

    const photo = await PhotoModel.findById(req.params.photoId);
    if (!photo) {
      return res.fail('Fotografija ni najdena.', 404);
    }

    const permissionUser = await buildPermissionUser(req, photo);
    if (!canDeletePhoto(photo, permissionUser)) {
      return res.fail('Ni dovoljenja za brisanje fotografije.', 403);
    }

    await Promise.all([
      removeFileIfExists(absolutePathFromUploadUrl(photo.url)),
      removeFileIfExists(absolutePathFromUploadUrl(photo.thumbnailUrl)),
    ]);
    await PhotoModel.deleteOne({ _id: photo._id });

    return res.success({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
