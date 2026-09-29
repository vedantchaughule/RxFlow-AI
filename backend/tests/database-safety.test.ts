import { describe, expect, it } from 'vitest';
import { assertIsolatedTestDatabaseUri, isolatedDatabaseUri } from './support/database.js';

describe('integration database safety guard', () => {
  it('builds only local test-prefixed database names', () => {
    const uri = isolatedDatabaseUri('mongodb://127.0.0.1:27017/?replicaSet=testset', 'Patient Workflow');
    expect(new URL(uri).pathname).toBe('/rxflow_test_patient_workflow');
    expect(() => assertIsolatedTestDatabaseUri(uri)).not.toThrow();
  });

  it('refuses development, production, and remote database targets', () => {
    expect(() => assertIsolatedTestDatabaseUri('mongodb://127.0.0.1:27017/rxflow_dev')).toThrow(/non-isolated/);
    expect(() => assertIsolatedTestDatabaseUri('mongodb://127.0.0.1:27017/rxflow')).toThrow(/non-isolated/);
    expect(() => isolatedDatabaseUri('mongodb+srv://cluster.example.test/rxflow', 'suite')).toThrow(/local ephemeral/);
  });
});
