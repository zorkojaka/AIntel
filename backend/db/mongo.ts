import mongoose from 'mongoose';

const PRODUCTION_DB_NAME = 'inteligent';

function normalizedEnv(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function getMongoDbName() {
  const configured = process.env.MONGO_DB?.trim();
  return configured && configured.length > 0 ? configured : PRODUCTION_DB_NAME;
}

export function isStagingRuntime() {
  return [process.env.AINTEL_ENV, process.env.AINTEL_DEPLOY_ENV, process.env.APP_ENV]
    .map(normalizedEnv)
    .some((value) => value === 'staging');
}

export function assertStagingDatabaseIsolation(dbName = getMongoDbName()) {
  if (!isStagingRuntime()) return;

  if (dbName.trim().toLowerCase() === PRODUCTION_DB_NAME) {
    throw new Error('Staging runtime must not use production Mongo database "inteligent". Set MONGO_DB to the staging database.');
  }
}

export async function connectToMongo() {
  // Read env variables at call-time to ensure loadEnvironment() ran before this is invoked
  const envUri = process.env.MONGO_URI?.trim();
  const fallbackUri = 'mongodb://127.0.0.1:27017';
  const uri = envUri && envUri.length > 0 ? envUri : fallbackUri;
  const dbName = getMongoDbName();

  assertStagingDatabaseIsolation(dbName);

  console.log('[connectToMongo] NODE_ENV =', process.env.NODE_ENV ?? 'undefined');
  console.log('[connectToMongo] AINTEL_ENV =', process.env.AINTEL_ENV ?? process.env.AINTEL_DEPLOY_ENV ?? process.env.APP_ENV ?? 'undefined');
  console.log('[connectToMongo] Mongo URI configured =', envUri ? 'yes' : 'no');
  console.log('[connectToMongo] database =', dbName);

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  return mongoose.connect(uri, {
    dbName,
    autoIndex: false
  });
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}
