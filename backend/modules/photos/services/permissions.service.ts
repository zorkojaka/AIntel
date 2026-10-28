import { Types } from 'mongoose';

import { ROLE_ADMIN, ROLE_FINANCE, ROLE_ORGANIZER, ROLE_SALES } from '../../../utils/roles';
import type { PhotoDocument } from '../schemas/photo';

export interface PhotoPermissionUser {
  roles?: string[];
  employeeId?: string | null;
  assignedExecutionProjectIds?: string[];
}

function asString(value: unknown) {
  if (value instanceof Types.ObjectId) return value.toString();
  return value == null ? '' : String(value);
}

export function canDeletePhoto(photo: Pick<PhotoDocument, 'projectId' | 'uploadedBy'>, user: PhotoPermissionUser): boolean {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  // Project photos are shared across phases, so everyone who manages the project can edit or remove them.
  if ([ROLE_ADMIN, ROLE_SALES, ROLE_ORGANIZER, ROLE_FINANCE].some((role) => roles.includes(role))) {
    return true;
  }

  const employeeId = typeof user.employeeId === 'string' ? user.employeeId : '';
  if (!employeeId) {
    return false;
  }

  if (asString(photo.uploadedBy) === employeeId) {
    return true;
  }

  const projectId = asString(photo.projectId);
  const assignedProjectIds = Array.isArray(user.assignedExecutionProjectIds) ? user.assignedExecutionProjectIds : [];
  return assignedProjectIds.includes(projectId);
}

