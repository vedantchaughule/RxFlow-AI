import mongoose from 'mongoose';
import { env } from './env.js';

let memoryReplSet: any = null;

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    console.log('[Database] Connected to configured MongoDB');
  } catch (error: any) {
    console.warn(`[Database] Could not connect to configured MONGODB_URI: ${error?.message || error}`);
    console.warn('[Database] Starting embedded MongoDB replica set (MongoMemoryReplSet)...');

    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    memoryReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    const uri = memoryReplSet.getUri('rxflow_dev');
    await mongoose.connect(uri);
    console.log(`[Database] Connected to embedded MongoDB replica set at ${uri}`);

    const { seedDevelopmentData } = await import('./seed-dev.js');
    await seedDevelopmentData();
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (memoryReplSet) {
    await memoryReplSet.stop();
  }
}
