import { EmployeeModel } from '../../employees/schemas/employee';
import { UserModel } from '../../users/schemas/user';
import { hashPassword } from './auth.service';
import { ROLE_ADMIN } from '../../../utils/roles';

const DEFAULT_TENANT_ID = 'inteligent';

export async function bootstrapAdminUser() {
  const email = process.env.AINTEL_BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.AINTEL_BOOTSTRAP_ADMIN_PASSWORD;
  const employeeName = process.env.AINTEL_BOOTSTRAP_ADMIN_EMPLOYEE_NAME || 'Admin';

  if (!email || !password) {
    return;
  }

  const existing = await UserModel.countDocuments();
  if (existing > 0) {
    return;
  }

  const tenantId = process.env.AINTEL_BOOTSTRAP_TENANT_ID || DEFAULT_TENANT_ID;
  const employee = await EmployeeModel.create({
    tenantId,
    name: employeeName,
    roles: [ROLE_ADMIN],
  });

  await UserModel.create({
    tenantId,
    email: email.trim().toLowerCase(),
    name: employeeName,
    status: 'ACTIVE',
    active: true,
    employeeId: employee._id,
    passwordHash: await hashPassword(password),
  });

  if (process.env.NODE_ENV !== 'production') {
    console.warn('AIntel bootstrap admin user created.');
  }
}
