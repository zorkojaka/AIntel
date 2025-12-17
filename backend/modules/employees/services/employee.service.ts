import { EmployeeModel, type EmployeeDocument } from '../schemas/employee';

export function sanitizeEmployee(doc: EmployeeDocument) {
  const plain = (doc as any)?.toObject ? (doc as any).toObject() : (doc as any as EmployeeDocument);
  return {
    id: String((plain as any)._id ?? plain.id),
    name: plain.name,
    company: plain.company ?? '',
    hourRateWithoutVat: plain.hourRateWithoutVat ?? 0,
    active: !!plain.active,
    createdAt: plain.createdAt?.toISOString?.() ?? new Date(plain.createdAt).toISOString(),
    updatedAt: plain.updatedAt?.toISOString?.() ?? new Date(plain.updatedAt).toISOString(),
  };
}

export async function listEmployees() {
  const employees = await EmployeeModel.find().lean();
  return employees.map((employee) => sanitizeEmployee(employee as any));
}

export async function createEmployee(payload: Partial<EmployeeDocument>) {
  const employee = await EmployeeModel.create({
    name: payload.name,
    company: payload.company ?? '',
    hourRateWithoutVat: typeof payload.hourRateWithoutVat === 'number' ? payload.hourRateWithoutVat : 0,
    active: payload.active !== undefined ? !!payload.active : true,
  });
  return sanitizeEmployee(employee as any);
}

export async function updateEmployee(id: string, payload: Partial<EmployeeDocument>) {
  const updated = await EmployeeModel.findByIdAndUpdate(
    id,
    {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.company !== undefined ? { company: payload.company } : {}),
      ...(payload.hourRateWithoutVat !== undefined
        ? { hourRateWithoutVat: payload.hourRateWithoutVat }
        : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
    },
    { new: true }
  );
  return updated ? sanitizeEmployee(updated as any) : null;
}

export async function deleteEmployee(id: string) {
  const deleted = await EmployeeModel.findByIdAndDelete(id);
  return !!deleted;
}
