const SAFE_DATABASE_PREFIX = 'rxflow_test_';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function isolatedDatabaseUri(baseUri: string, suiteName: string): string {
  const uri = new URL(baseUri);
  const safeSuiteName = suiteName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || !LOCAL_HOSTS.has(uri.hostname)) {
    throw new Error('Integration tests require a local ephemeral MongoDB server');
  }
  uri.pathname = `/${SAFE_DATABASE_PREFIX}${safeSuiteName || 'suite'}`;
  assertIsolatedTestDatabaseUri(uri.toString());
  return uri.toString();
}

export function assertIsolatedTestDatabaseUri(value: string): void {
  const uri = new URL(value);
  const databaseName = uri.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.has(uri.hostname) || !databaseName.startsWith(SAFE_DATABASE_PREFIX)) {
    throw new Error('Refusing to run integration tests against a non-isolated database');
  }
}
