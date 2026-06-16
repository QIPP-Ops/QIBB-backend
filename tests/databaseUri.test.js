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

  test('strips leading slashes from MONGODB_DB_NAME', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net';
    process.env.MONGODB_DB_NAME = '/QIPP';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe('mongodb+srv://user:pass@cluster.mongodb.net/QIPP');
  });

  test('handles Atlas URI with slash before query (?appName=QIPP)', () => {
    process.env.MONGODB_URI =
      'mongodb+srv://user:pass@qipp.6ukofbn.mongodb.net/?appName=QIPP';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe(
      'mongodb+srv://user:pass@qipp.6ukofbn.mongodb.net/QIPP?appName=QIPP'
    );
  });

  test('handles trailing slash without query params', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@qipp.6ukofbn.mongodb.net/';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe(
      'mongodb+srv://user:pass@qipp.6ukofbn.mongodb.net/QIPP'
    );
  });

  test('does not double-insert db when path already set', () => {
    process.env.MONGODB_URI =
      'mongodb+srv://user:pass@qipp.6ukofbn.mongodb.net/QIPP?retryWrites=true&w=majority';
    const { getMongoUri } = require('../config/database');
    expect(getMongoUri()).toBe(
      'mongodb+srv://user:pass@qipp.6ukofbn.mongodb.net/QIPP?retryWrites=true&w=majority'
    );
  });
});
