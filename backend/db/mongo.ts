import mongoose from 'mongoose';

export async function connectToMongo() {
  // Read env variables at call-time to ensure loadEnvironment() ran before this is invoked
  const envUri = process.env.MONGO_URI?.trim();
  const fallbackUri = 'mongodb://127.0.0.1:27017';
  const uri = envUri && envUri.length > 0 ? envUri : fallbackUri;
  const dbName = process.env.MONGO_DB ?? 'inteligent';

  console.log('[connectToMongo] NODE_ENV =', process.env.NODE_ENV ?? 'undefined');
  console.log('[connectToMongo] MONGO_URI =', process.env.MONGO_URI ?? 'undefined');
  console.log('[connectToMongo] using URI =', uri);

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
