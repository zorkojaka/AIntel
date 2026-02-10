import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { auditProducts } from '../modules/cenik/audit/auditProducts';

async function runAudit() {
  loadEnvironment();
  await connectToMongo();

  const report = await auditProducts();
  console.log(JSON.stringify(report, null, 2));
}

runAudit()
  .catch((error) => {
    console.error('Product audit failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
