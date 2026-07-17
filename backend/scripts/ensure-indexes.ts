import mongoose, { type Model } from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import { SchedulerLockModel, SchedulerRunModel } from '../modules/scheduler/scheduler.model';
import { TaskModel } from '../modules/tasks/task.model';
import { TaskTemplateModel } from '../modules/tasks/task-template.model';
import { EmailMessageModel } from '../modules/email/email-message.model';
import { CommunicationEventModel } from '../modules/communication/schemas/event';
import { CommunicationMessageModel } from '../modules/communication/schemas/message';
import { CommunicationTemplateModel } from '../modules/communication/schemas/template';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { EmployeeModel } from '../modules/employees/schemas/employee';
import { FinanceSnapshotModel } from '../modules/finance/schemas/finance-snapshot';
import { MaterialOrderModel } from '../modules/projects/schemas/material-order';
import { OfferVersionModel } from '../modules/projects/schemas/offer-version';
import { EmployeeAvailabilityDayModel, EmployeeWeekLimitModel } from '../modules/availability/availability.model';
import { InvoicePaymentModel } from '../modules/payments/invoice-payment.model';
import { ProjectModel } from '../modules/projects/schemas/project';
import { WorkOrderModel } from '../modules/projects/schemas/work-order';
import { UserModel } from '../modules/users/schemas/user';
import { WebInquiryModel } from '../modules/web-inquiries/web-inquiry.model';
import { ZahtevaModel } from '../modules/zahteve/zahteva.model';

type EnsureIndexesOptions = {
  apply: boolean;
  json: boolean;
  allowSharedDb: boolean;
  confirmedWrites: boolean;
};

type IndexSpec = {
  model: string;
  collection: string;
  name: string;
  keys: Record<string, unknown>;
  options: Record<string, unknown>;
};

const INDEX_MODELS: Model<any>[] = [
  EmployeeAvailabilityDayModel,
  EmployeeWeekLimitModel,
  InvoicePaymentModel,
  ProductModel,
  SchedulerLockModel,
  SchedulerRunModel,
  TaskModel,
  TaskTemplateModel,
  EmailMessageModel,
  CommunicationEventModel,
  CommunicationMessageModel,
  CommunicationTemplateModel,
  CrmClientModel,
  EmployeeModel,
  FinanceSnapshotModel,
  MaterialOrderModel,
  OfferVersionModel,
  ProjectModel,
  WorkOrderModel,
  UserModel,
  WebInquiryModel,
  ZahtevaModel,
];

function defaultIndexName(keys: Record<string, unknown>) {
  return Object.entries(keys)
    .map(([field, direction]) => `${field}_${String(direction)}`)
    .join('_');
}

export function parseEnsureIndexesArgs(argv: string[]): EnsureIndexesOptions {
  const apply = argv.includes('--apply');
  return {
    apply,
    json: argv.includes('--json'),
    allowSharedDb: argv.includes('--allow-shared-db'),
    confirmedWrites: argv.includes('--i-understand-this-writes-indexes'),
  };
}

export function assertApplyAllowed(options: EnsureIndexesOptions, dbName = process.env.MONGO_DB ?? 'inteligent') {
  if (!options.apply) return;
  if (!options.confirmedWrites) {
    throw new Error('Refusing to apply indexes without --i-understand-this-writes-indexes.');
  }
  if (dbName === 'inteligent' && !options.allowSharedDb) {
    throw new Error('Refusing to write indexes to shared db inteligent without --allow-shared-db.');
  }
}

export function declaredIndexSpecs(models = INDEX_MODELS): IndexSpec[] {
  return models.flatMap((model) =>
    model.schema.indexes().map(([keys, rawOptions]) => {
      const options = { ...(rawOptions ?? {}) } as Record<string, unknown>;
      const name = typeof options.name === 'string' ? options.name : defaultIndexName(keys as Record<string, unknown>);
      return {
        model: model.modelName,
        collection: model.collection.name,
        name,
        keys: keys as Record<string, unknown>,
        options,
      };
    }),
  );
}

export async function buildIndexPlan(models = INDEX_MODELS) {
  const declared = declaredIndexSpecs(models);
  const existingByCollection = new Map<string, Set<string>>();

  for (const model of models) {
    const existing = await model.collection.indexes();
    existingByCollection.set(model.collection.name, new Set(existing.map((index) => String(index.name))));
  }

  const missing = declared.filter((spec) => !existingByCollection.get(spec.collection)?.has(spec.name));
  return { declared, missing };
}

export async function applyDeclaredIndexes(models = INDEX_MODELS) {
  for (const model of models) {
    await model.createIndexes();
  }
}

function printPlan(plan: Awaited<ReturnType<typeof buildIndexPlan>>, options: EnsureIndexesOptions) {
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`Declared schema indexes: ${plan.declared.length}`);
  console.log(`Missing indexes: ${plan.missing.length}`);
  for (const spec of plan.missing) {
    console.log(`- ${spec.collection}.${spec.name} ${JSON.stringify(spec.keys)}`);
  }
}

export async function runEnsureIndexes(argv = process.argv.slice(2)) {
  const options = parseEnsureIndexesArgs(argv);
  assertApplyAllowed(options);
  loadEnvironment();
  assertApplyAllowed(options);
  await connectToMongo();
  const plan = await buildIndexPlan();
  printPlan(plan, options);
  if (options.apply) {
    await applyDeclaredIndexes();
    console.log('Index creation requested for all declared schema indexes.');
  } else {
    console.log('Dry-run only. Re-run with --apply --i-understand-this-writes-indexes to create missing indexes.');
  }
}

if (require.main === module) {
  runEnsureIndexes()
    .catch((error) => {
      console.error('ensure-indexes failed:', error);
      process.exitCode = 1;
    })
    .finally(() => {
      mongoose.connection.close();
    });
}
