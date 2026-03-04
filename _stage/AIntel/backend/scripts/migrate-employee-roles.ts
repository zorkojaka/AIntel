import mongoose from 'mongoose';

import { loadEnvironment } from '../loadEnv';
import { connectToMongo } from '../db/mongo';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { UserModel } from '../modules/users/schemas/user';

const ROLE_VALUES = ['admin', 'manager', 'sales', 'technician', 'ops', 'finance'] as const;
const ROLE_SET = new Set<string>(ROLE_VALUES as readonly string[]);

type MigrationStats = {
  scanned: number;
  updated: number;
  skippedHasRoles: number;
  skippedNoUser: number;
  skippedNoRolesInUser: number;
  errors: number;
};

async function migrateEmployeeRoles() {
  loadEnvironment();
  await connectToMongo();

  const stats: MigrationStats = {
    scanned: 0,
    updated: 0,
    skippedHasRoles: 0,
    skippedNoUser: 0,
    skippedNoRolesInUser: 0,
    errors: 0,
  };

  const employees = await EmployeeModel.find({
    $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }],
  })
    .select('_id roles tenantId')
    .lean();

  for (const employee of employees) {
    stats.scanned += 1;
    try {
      if (Array.isArray(employee.roles) && employee.roles.length > 0) {
        stats.skippedHasRoles += 1;
        continue;
      }

      const user = await UserModel.findOne({
        employeeId: employee._id,
        tenantId: employee.tenantId,
        deletedAt: null,
      })
        .select('roles')
        .lean();

      if (!user) {
        stats.skippedNoUser += 1;
        continue;
      }

      const roles = Array.isArray(user.roles)
        ? user.roles.map((role) => String(role)).filter((role) => ROLE_SET.has(role))
        : [];

      if (roles.length === 0) {
        stats.skippedNoRolesInUser += 1;
        continue;
      }

      await EmployeeModel.updateOne({ _id: employee._id }, { $set: { roles } });
      stats.updated += 1;
    } catch (error) {
      stats.errors += 1;
      console.error('Napaka pri migraciji zaposlenega:', String(employee._id), error);
    }
  }

  console.log('Migration summary:', stats);
  return stats;
}

migrateEmployeeRoles()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
