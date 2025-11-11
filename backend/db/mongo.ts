import mongoose from 'mongoose';

const uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGO_DB ?? 'aintel';

export async function connectToMongo() {
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
