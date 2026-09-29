import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  project.provide('mongoTestUri', replicaSet.getUri('rxflow_test_root'));
  return async () => {
    await replicaSet.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoTestUri: string;
  }
}
