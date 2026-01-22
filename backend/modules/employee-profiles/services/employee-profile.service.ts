import { EmployeeProfileModel, type EmployeeProfileDocument } from '../schemas/employee-profile';

export function sanitizeProfile(doc: EmployeeProfileDocument) {
  const plain = (doc as any)?.toObject ? (doc as any).toObject() : (doc as any as EmployeeProfileDocument);
  return {
    id: String((plain as any)._id ?? (plain as any).id),
    tenantId: plain.tenantId,
    employeeId: plain.employeeId ? String(plain.employeeId) : null,
    primaryRole: plain.primaryRole,
    profitSharePercent: plain.profitSharePercent,
    hourlyRate: plain.hourlyRate ?? null,
    exceptions: plain.exceptions ?? {},
    createdAt: plain.createdAt?.toISOString?.() ?? new Date(plain.createdAt).toISOString(),
    updatedAt: plain.updatedAt?.toISOString?.() ?? new Date(plain.updatedAt).toISOString(),
  };
}

export async function getProfileByEmployeeId(tenantId: string, employeeId: string) {
  const profile = await EmployeeProfileModel.findOne({ tenantId, employeeId }).lean();
  return profile ? sanitizeProfile(profile as any) : null;
}

export async function createProfile(tenantId: string, payload: Partial<EmployeeProfileDocument>) {
  const profile = await EmployeeProfileModel.create({
    tenantId,
    employeeId: payload.employeeId,
    primaryRole: payload.primaryRole,
    profitSharePercent: payload.profitSharePercent,
    hourlyRate: payload.hourlyRate ?? null,
    exceptions: payload.exceptions ?? {},
  });
  return sanitizeProfile(profile as any);
}

export async function updateProfile(id: string, tenantId: string, payload: Partial<EmployeeProfileDocument>) {
  const updated = await EmployeeProfileModel.findOneAndUpdate(
    { _id: id, tenantId },
    {
      primaryRole: payload.primaryRole,
      profitSharePercent: payload.profitSharePercent,
      hourlyRate: payload.hourlyRate ?? null,
      exceptions: payload.exceptions ?? {},
    },
    { new: true }
  );
  return updated ? sanitizeProfile(updated as any) : null;
}
