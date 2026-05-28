const jwt = require('jsonwebtoken');
const {
  buildJwtPayload,
  normalizeDecodedUser,
  JWT_EXPIRES_IN,
} = require('../utils/jwtAuth');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';

describe('jwtAuth utils', () => {
  test('buildJwtPayload maps viewer accessRole to user portal role', () => {
    const payload = buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email: 'ops@acwapower.com',
      name: 'Ops User',
      accessRole: 'viewer',
      crew: 'A',
      empId: '100',
    });
    expect(payload.userId).toBe('507f1f77bcf86cd799439011');
    expect(payload.role).toBe('user');
    expect(payload.displayName).toBe('Ops User');
    expect(payload.accessRole).toBe('viewer');
  });

  test('normalizeDecodedUser restores legacy id and name', () => {
    const normalized = normalizeDecodedUser({
      userId: 'abc',
      email: 'x@y.com',
      role: 'admin',
      displayName: 'Admin',
    });
    expect(normalized.id).toBe('abc');
    expect(normalized.name).toBe('Admin');
  });

  test('login-style token expires per JWT_EXPIRES_IN', () => {
    const payload = buildJwtPayload({
      _id: '1',
      email: 'a@b.com',
      name: 'A',
      accessRole: 'admin',
    });
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('1');
    expect(decoded.role).toBe('admin');
  });
});
