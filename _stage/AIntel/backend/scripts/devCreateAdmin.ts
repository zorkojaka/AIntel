import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { UserModel } from '../modules/users/schemas/user';
import { hashPassword } from '../modules/auth/services/auth.service';
import { ROLE_ADMIN } from '../utils/roles';

function requireEnv(value: string | undefined, name: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

async function run() {
  loadEnvironment();

  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run devCreateAdmin in production.');
    process.exit(1);
  }

  const email = requireEnv(process.env.AINTEL_BOOTSTRAP_ADMIN_EMAIL, 'AINTEL_BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = requireEnv(process.env.AINTEL_BOOTSTRAP_ADMIN_PASSWORD, 'AINTEL_BOOTSTRAP_ADMIN_PASSWORD');
  const employeeName = (process.env.AINTEL_BOOTSTRAP_ADMIN_EMPLOYEE_NAME || 'Admin').trim() || 'Admin';
  const tenantId =
    (process.env.AINTEL_TENANT_ID || process.env.AINTEL_BOOTSTRAP_TENANT_ID || 'inteligent').trim() || 'inteligent';

  await connectToMongo();

  const existingEmployee = await EmployeeModel.findOne({ tenantId, name: employeeName });
  let employee = existingEmployee;
  if (!employee) {
    employee = await EmployeeModel.create({
      tenantId,
      name: employeeName,
      roles: [ROLE_ADMIN],
      deletedAt: null,
      deletedBy: null,
      active: true,
    });
    console.log(`Created employee ${employee._id}`);
  } else {
    const roles = Array.isArray(employee.roles) ? employee.roles : [];
    if (!roles.includes(ROLE_ADMIN)) {
      employee.roles = [...roles, ROLE_ADMIN];
    }
    employee.deletedAt = null;
    employee.deletedBy = null;
    employee.active = true;
    await employee.save();
    console.log(`Updated employee ${employee._id}`);
  }

  const passwordHash = await hashPassword(password);
  const existingUser = await UserModel.findOne({ tenantId, email });
  if (!existingUser) {
    const user = await UserModel.create({
      tenantId,
      email,
      name: employeeName,
      roles: [ROLE_ADMIN],
      status: 'ACTIVE',
      active: true,
      employeeId: employee?._id ?? null,
      passwordHash,
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      deletedAt: null,
      deletedBy: null,
    });
    console.log(`Created user ${user._id}`);
  } else {
    existingUser.name = employeeName;
    existingUser.roles = [ROLE_ADMIN];
    existingUser.status = 'ACTIVE';
    existingUser.active = true;
    existingUser.employeeId = employee?._id ?? null;
    existingUser.passwordHash = passwordHash;
    existingUser.inviteTokenHash = null;
    existingUser.inviteTokenExpiresAt = null;
    existingUser.resetTokenHash = null;
    existingUser.resetTokenExpiresAt = null;
    existingUser.deletedAt = null;
    existingUser.deletedBy = null;
    await existingUser.save();
    console.log(`Updated user ${existingUser._id}`);
  }

  console.log(`Admin ready: ${email}`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
