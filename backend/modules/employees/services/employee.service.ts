import { FilterQuery } from 'mongoose';
import { EmployeeModel, type EmployeeDocument } from '../schemas/employee';
import { UserModel } from '../../users/schemas/user';

function normalizeEmail(value?: string | null) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function hasEmployeeAppAccess(employee: Partial<EmployeeDocument>) {
  const email = normalizeEmail(employee.email);
  return Boolean(employee.appAccess) && Boolean(employee.active) && !employee.deletedAt && email.length > 0;
}

async function syncEmployeeUser(employee: Partial<EmployeeDocument> & { _id: any; tenantId: string }) {
  const employeeId = String(employee._id);
  const tenantId = employee.tenantId;
  const email = normalizeEmail(employee.email);
  const shouldEnable = hasEmployeeAppAccess(employee);
  const name = (employee.name ?? '').trim();
  const roles = Array.isArray(employee.roles) ? employee.roles : [];

  const linkedUser = await UserModel.findOne({ tenantId, employeeId, deletedAt: null });
  if (!shouldEnable) {
    if (linkedUser) {
      linkedUser.active = false;
      linkedUser.status = 'DISABLED';
      linkedUser.employeeId = employee._id as any;
      await linkedUser.save();
    }
    return;
  }

  const sameEmailUser = await UserModel.findOne({ tenantId, email, deletedAt: null });
  const linkedUserId = linkedUser ? String(linkedUser._id) : '';
  const sameEmailUserId = sameEmailUser ? String(sameEmailUser._id) : '';
  const sameEmailEmployeeId = sameEmailUser ? String(sameEmailUser.employeeId ?? '') : '';
  const isSameLinkedUser = Boolean(linkedUserId) && linkedUserId === sameEmailUserId;
  const canAdoptSameEmailUser = !linkedUser && sameEmailUser && sameEmailEmployeeId.length === 0;

  if (
    sameEmailUser &&
    !isSameLinkedUser &&
    !canAdoptSameEmailUser &&
    sameEmailEmployeeId !== employeeId
  ) {
    throw new Error('EMAIL_IN_USE_BY_OTHER_USER');
  }

  const user = linkedUser ?? sameEmailUser;
  if (!user) {
    await UserModel.create({
      tenantId,
      email,
      name: name || email,
      roles,
      status: 'ACTIVE',
      active: true,
      employeeId: employee._id,
      passwordHash: null,
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      deletedAt: null,
      deletedBy: null,
    });
    return;
  }

  user.email = email;
  user.name = name || email;
  user.roles = roles;
  user.employeeId = employee._id as any;
  user.active = true;
  user.status = 'ACTIVE';
  user.deletedAt = null;
  user.deletedBy = null;
  await user.save();
}

export function sanitizeEmployee(doc: EmployeeDocument) {
  const plain = (doc as any)?.toObject ? (doc as any).toObject() : (doc as any as EmployeeDocument);
  return {
    id: String((plain as any)._id ?? (plain as any).id),
    tenantId: plain.tenantId,
    name: plain.name,
    company: plain.company ?? '',
    phone: plain.phone ?? '',
    email: plain.email ?? '',
    roles: Array.isArray(plain.roles) ? plain.roles : [],
    address: plain.address ?? '',
    employmentStartDate: plain.employmentStartDate ? new Date(plain.employmentStartDate).toISOString() : null,
    contractType: plain.contractType ?? null,
    shirtSize: plain.shirtSize ?? null,
    shoeSize: plain.shoeSize ?? null,
    notes: plain.notes ?? '',
    hourRateWithoutVat: plain.hourRateWithoutVat ?? 0,
    active: !!plain.active,
    appAccess: plain.appAccess !== false,
    deletedAt: plain.deletedAt ? new Date(plain.deletedAt).toISOString() : null,
    deletedBy: plain.deletedBy ?? null,
    createdAt: plain.createdAt?.toISOString?.() ?? new Date(plain.createdAt).toISOString(),
    updatedAt: plain.updatedAt?.toISOString?.() ?? new Date(plain.updatedAt).toISOString(),
  };
}

function toEmployeeUpdate(payload: Partial<EmployeeDocument>) {
  const update: Partial<EmployeeDocument> = {};

  if (payload.name !== undefined) update.name = payload.name;
  if (payload.company !== undefined) update.company = payload.company;
  if (payload.phone !== undefined) update.phone = payload.phone;
  if (payload.email !== undefined) update.email = payload.email;
  if (payload.roles !== undefined) {
    update.roles = Array.isArray(payload.roles) ? payload.roles : [];
  }
  if (payload.address !== undefined) update.address = payload.address;
  if (payload.employmentStartDate !== undefined) update.employmentStartDate = payload.employmentStartDate;
  if (payload.contractType !== undefined) update.contractType = payload.contractType;
  if (payload.shirtSize !== undefined) update.shirtSize = payload.shirtSize;
  if (payload.shoeSize !== undefined) update.shoeSize = payload.shoeSize as any;
  if (payload.notes !== undefined) update.notes = payload.notes;
  if (payload.hourRateWithoutVat !== undefined) {
    const parsedRate = Number(payload.hourRateWithoutVat);
    update.hourRateWithoutVat = parsedRate;
  }
  if (payload.active !== undefined) update.active = payload.active;
  if (payload.appAccess !== undefined) update.appAccess = payload.appAccess;

  return update;
}

export async function listEmployees(tenantId: string, includeDeleted = false) {
  const filter: FilterQuery<EmployeeDocument> = { tenantId } as FilterQuery<EmployeeDocument>;
  if (!includeDeleted) {
    filter.deletedAt = null;
  }

  const employees = await EmployeeModel.find(filter).sort({ name: 1 }).lean();
  return employees.map((employee) => sanitizeEmployee(employee as any));
}

export async function createEmployee(tenantId: string, payload: Partial<EmployeeDocument>) {
  const parsedRate = Number(payload.hourRateWithoutVat);
  const safeRate = Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : 0;

  const employee = await EmployeeModel.create({
    tenantId,
    name: payload.name,
    company: payload.company ?? '',
    phone: payload.phone ?? '',
    email: payload.email ?? '',
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    address: payload.address ?? '',
    employmentStartDate: payload.employmentStartDate ?? null,
    contractType: payload.contractType ?? null,
    shirtSize: payload.shirtSize ?? null,
    shoeSize: payload.shoeSize ?? null,
    notes: payload.notes ?? '',
    hourRateWithoutVat: safeRate,
    active: payload.active !== undefined ? !!payload.active : true,
    appAccess: payload.appAccess !== undefined ? !!payload.appAccess : true,
  });
  await syncEmployeeUser(employee);
  return sanitizeEmployee(employee as any);
}

export async function updateEmployee(id: string, tenantId: string, payload: Partial<EmployeeDocument>) {
  const existing = await EmployeeModel.findOne({ _id: id, tenantId, deletedAt: null });
  if (!existing) {
    return null;
  }
  const update = toEmployeeUpdate(payload);
  if (update.hourRateWithoutVat !== undefined) {
    const rate = Number(update.hourRateWithoutVat);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('NEGATIVE_RATE');
    }
    update.hourRateWithoutVat = rate;
  }

  const existingEmail = normalizeEmail(existing.email);
  const requestedEmail =
    payload.email !== undefined ? normalizeEmail(payload.email as any) : existingEmail;
  const emailChanged = requestedEmail !== existingEmail;

  const updated = await EmployeeModel.findOneAndUpdate(
    { _id: id, tenantId, deletedAt: null },
    update,
    { new: true }
  );
  if (updated) {
    try {
      await syncEmployeeUser(updated as any);
    } catch (error: any) {
      // Role/name changes should not be blocked by a legacy email conflict if the email itself
      // was not edited in this request. Preserve the employee update and keep any linked user
      // in sync as much as possible.
      if (error?.message === 'EMAIL_IN_USE_BY_OTHER_USER' && !emailChanged) {
        const linkedUser = await UserModel.findOne({ tenantId, employeeId: updated._id, deletedAt: null });
        if (linkedUser) {
          const email = normalizeEmail(linkedUser.email);
          linkedUser.name = (updated.name ?? '').trim() || email;
          linkedUser.roles = Array.isArray(updated.roles) ? updated.roles : [];
          linkedUser.active = hasEmployeeAppAccess({
            ...updated.toObject(),
            email: linkedUser.email,
          } as any);
          linkedUser.status = linkedUser.active ? 'ACTIVE' : 'DISABLED';
          await linkedUser.save();
        }
      } else {
        throw error;
      }
    }
  }
  return updated ? sanitizeEmployee(updated as any) : null;
}

export async function softDeleteEmployee(id: string, tenantId: string, deletedBy?: string | null) {
  const deleted = await EmployeeModel.findOneAndUpdate(
    { _id: id, tenantId },
    { deletedAt: new Date(), deletedBy: deletedBy ?? null, active: false },
    { new: true }
  );
  if (deleted) {
    await syncEmployeeUser(deleted as any);
  }
  return !!deleted;
}

export async function hardDeleteEmployee(id: string, tenantId: string) {
  const deleted = await EmployeeModel.findOneAndDelete({ _id: id, tenantId });
  if (deleted) {
    await UserModel.findOneAndDelete({ tenantId, employeeId: deleted._id });
  }
  return !!deleted;
}
