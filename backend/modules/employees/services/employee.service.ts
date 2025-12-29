import { FilterQuery } from 'mongoose';
import { EmployeeModel, type EmployeeDocument } from '../schemas/employee';

export function sanitizeEmployee(doc: EmployeeDocument) {
  const plain = (doc as any)?.toObject ? (doc as any).toObject() : (doc as any as EmployeeDocument);
  return {
    id: String((plain as any)._id ?? (plain as any).id),
    tenantId: plain.tenantId,
    name: plain.name,
    company: plain.company ?? '',
    phone: plain.phone ?? '',
    email: plain.email ?? '',
    address: plain.address ?? '',
    employmentStartDate: plain.employmentStartDate ? new Date(plain.employmentStartDate).toISOString() : null,
    contractType: plain.contractType ?? null,
    shirtSize: plain.shirtSize ?? null,
    shoeSize: plain.shoeSize ?? null,
    notes: plain.notes ?? '',
    hourRateWithoutVat: plain.hourRateWithoutVat ?? 0,
    active: !!plain.active,
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
    address: payload.address ?? '',
    employmentStartDate: payload.employmentStartDate ?? null,
    contractType: payload.contractType ?? null,
    shirtSize: payload.shirtSize ?? null,
    shoeSize: payload.shoeSize ?? null,
    notes: payload.notes ?? '',
    hourRateWithoutVat: safeRate,
    active: payload.active !== undefined ? !!payload.active : true,
  });
  return sanitizeEmployee(employee as any);
}

export async function updateEmployee(id: string, tenantId: string, payload: Partial<EmployeeDocument>) {
  const update = toEmployeeUpdate(payload);
  if (update.hourRateWithoutVat !== undefined) {
    const rate = Number(update.hourRateWithoutVat);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('NEGATIVE_RATE');
    }
    update.hourRateWithoutVat = rate;
  }

  const updated = await EmployeeModel.findOneAndUpdate(
    { _id: id, tenantId, deletedAt: null },
    update,
    { new: true }
  );
  return updated ? sanitizeEmployee(updated as any) : null;
}

export async function softDeleteEmployee(id: string, tenantId: string, deletedBy?: string | null) {
  const deleted = await EmployeeModel.findOneAndUpdate(
    { _id: id, tenantId },
    { deletedAt: new Date(), deletedBy: deletedBy ?? null, active: false },
    { new: true }
  );
  return !!deleted;
}

export async function hardDeleteEmployee(id: string, tenantId: string) {
  const deleted = await EmployeeModel.findOneAndDelete({ _id: id, tenantId });
  return !!deleted;
}
