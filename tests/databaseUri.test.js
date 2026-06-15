describe('getMongoUri', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MONGODB_URI;
    delete process.env.COSMOS_URI;
    delete process.env.MONGODB_DB_NAME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns empty when no URI set', () => {
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe('');
  });

  test('appends QIPP database when URI has no path', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe('mongodb+srv://user:pass@cluster.mongodb.net/QIPP');
  });

  test('preserves existing database path', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/existing?retryWrites=true';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe('mongodb+srv://user:pass@cluster.mongodb.net/existing?retryWrites=true');
  });

  test('respects MONGODB_DB_NAME override', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net';
    process.env.MONGODB_DB_NAME = 'CustomDb';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe('mongodb+srv://user:pass@cluster.mongodb.net/CustomDb');
  });
});
