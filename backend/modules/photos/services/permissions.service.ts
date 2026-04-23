import { Types } from 'mongoose';

import { ROLE_ADMIN } from '../../../utils/roles';
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
  if (roles.includes(ROLE_ADMIN)) {
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

