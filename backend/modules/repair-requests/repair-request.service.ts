import sharp from 'sharp';
import { UserModel } from '../users/schemas/user';
import { EmployeeModel } from '../employees/schemas/employee';
import { ROLE_ADMIN, toCanonicalRole } from '../../utils/roles';

export class RepairRequestValidationError extends Error {}

export async function validateRepairRequest(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (!comment || comment.length > 5000) throw new RepairRequestValidationError('Komentar je obvezen in lahko vsebuje največ 5000 znakov.');
  const page = typeof input.page === 'string' ? input.page.trim() : '';
  if (!page || page.length > 2000) throw new RepairRequestValidationError('Podatek o strani ni veljaven.');
  try {
    const url = new URL(page);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch { throw new RepairRequestValidationError('Podatek o strani ni veljaven.'); }
  const moduleName = typeof input.module === 'string' ? input.module.trim().slice(0, 200) : '';
  const capturedAt = typeof input.capturedAt === 'string' ? new Date(input.capturedAt) : new Date(NaN);
  if (!Number.isFinite(capturedAt.getTime())) throw new RepairRequestValidationError('Čas zajema ni veljaven.');
  const screenshot = typeof input.screenshot === 'string' ? input.screenshot : '';
  if (screenshot.length > 4 * 1024 * 1024) throw new RepairRequestValidationError('Slika je prevelika (največ 3 MB).');
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(screenshot);
  if (!match) throw new RepairRequestValidationError('Zahtevku mora biti priložena slika zaslona.');
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > 3 * 1024 * 1024) throw new RepairRequestValidationError('Slika je prevelika (največ 3 MB).');
  try {
    const metadata = await sharp(image, { limitInputPixels: 16_000_000 }).metadata();
    if (!['jpeg', 'png'].includes(metadata.format ?? '') || !metadata.width || !metadata.height) throw new Error();
    // Decode and re-encode to verify the image and strip unrelated metadata.
    const attachment = await sharp(image, { limitInputPixels: 16_000_000 }).rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    return { comment, page, moduleName, capturedAt: capturedAt.toISOString(), attachment };
  } catch { throw new RepairRequestValidationError('Slika zaslona ni veljavna.'); }
}

export function adminRecipientEmails(users: Array<{ email: string; roles?: string[]; employeeId?: unknown }>,
  employees: Array<{ _id: unknown; roles?: string[]; active?: boolean; deletedAt?: unknown }>) {
  const byId = new Map(employees.map((employee) => [String(employee._id), employee]));
  return [...new Set(users.filter((user) => {
    const employee = user.employeeId ? byId.get(String(user.employeeId)) : null;
    if (employee && (employee.active === false || employee.deletedAt)) return false;
    // Match the application's effective roles for accounts linked to employees.
    return (employee?.roles ?? user.roles ?? []).some((role) => toCanonicalRole(role) === ROLE_ADMIN);
  }).map((user) => user.email.trim().toLowerCase()).filter(Boolean))];
}

export async function resolveRepairRequestAdmins(tenantId: string) {
  const users = await UserModel.find({ tenantId, active: true, deletedAt: null, status: { $nin: ['DISABLED', 'INVITED'] } })
    .select({ email: 1, roles: 1, employeeId: 1 }).lean();
  const employeeIds = users.map((user) => user.employeeId).filter(Boolean);
  const employees = await EmployeeModel.find({ tenantId, _id: { $in: employeeIds } })
    .select({ roles: 1, active: 1, deletedAt: 1 }).lean();
  return adminRecipientEmails(users, employees);
}
