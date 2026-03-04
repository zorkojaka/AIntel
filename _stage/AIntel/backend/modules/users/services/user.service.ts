import mongoose, { FilterQuery } from 'mongoose';
import { UserModel, type UserDocument } from '../schemas/user';

export function sanitizeUser(doc: UserDocument) {
  const plain = (doc as any)?.toObject ? (doc as any).toObject() : (doc as any as UserDocument);
  return {
    id: String((plain as any)._id ?? (plain as any).id),
    tenantId: plain.tenantId,
    email: plain.email,
    name: plain.name,
    roles: Array.isArray(plain.roles) ? plain.roles : [],
    active: !!plain.active,
    employeeId: plain.employeeId ? String(plain.employeeId) : null,
    deletedAt: plain.deletedAt ? new Date(plain.deletedAt).toISOString() : null,
    deletedBy: plain.deletedBy ?? null,
    createdAt: plain.createdAt?.toISOString?.() ?? new Date(plain.createdAt).toISOString(),
    updatedAt: plain.updatedAt?.toISOString?.() ?? new Date(plain.updatedAt).toISOString(),
  };
}

function toUserUpdate(payload: Partial<UserDocument>) {
  const update: Partial<UserDocument> = {};

  if (payload.email !== undefined) update.email = payload.email;
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.roles !== undefined) update.roles = payload.roles;
  if (payload.active !== undefined) update.active = payload.active;
  if (payload.employeeId !== undefined) update.employeeId = payload.employeeId;

  return update;
}

export async function listUsers(tenantId: string, includeDeleted = false, search?: string) {
  const filter: FilterQuery<UserDocument> = { tenantId } as FilterQuery<UserDocument>;
  if (!includeDeleted) {
    filter.deletedAt = null;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(escaped, 'i');
    filter.$or = [{ name: matcher }, { email: matcher }];
  }

  const users = await UserModel.find(filter).sort({ name: 1 }).lean();
  return users.map((user) => sanitizeUser(user as any));
}

export async function createUser(tenantId: string, payload: Partial<UserDocument>) {
  const user = await UserModel.create({
    tenantId,
    email: payload.email,
    name: payload.name,
    roles: payload.roles,
    active: payload.active !== undefined ? !!payload.active : true,
    employeeId: payload.employeeId ?? null,
  });
  return sanitizeUser(user as any);
}

export async function updateUser(id: string, tenantId: string, payload: Partial<UserDocument>) {
  const update = toUserUpdate(payload);
  const updated = await UserModel.findOneAndUpdate(
    { _id: id, tenantId, deletedAt: null },
    update,
    { new: true }
  );
  return updated ? sanitizeUser(updated as any) : null;
}

export async function softDeleteUser(id: string, tenantId: string, deletedBy?: string | null) {
  const deleted = await UserModel.findOneAndUpdate(
    { _id: id, tenantId },
    { deletedAt: new Date(), deletedBy: deletedBy ?? null, active: false },
    { new: true }
  );
  return !!deleted;
}

export async function hardDeleteUser(id: string, tenantId: string) {
  const deleted = await UserModel.findOneAndDelete({ _id: id, tenantId });
  return !!deleted;
}

export async function getUserByEmployeeId(tenantId: string, employeeId: string) {
  if (!mongoose.isValidObjectId(employeeId)) {
    return null;
  }
  const user = await UserModel.findOne({ tenantId, employeeId, deletedAt: null }).lean();
  return user ? sanitizeUser(user as any) : null;
}
