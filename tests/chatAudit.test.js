jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../models/ChatMessage', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../models/ChatRoom', () => ({
  find: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildJwtPayload } = require('../utils/jwtAuth');
const AuditLog = require('../models/AuditLog');
const ChatMessage = require('../models/ChatMessage');
const ChatRoom = require('../models/ChatRoom');
const AdminUser = require('../models/AdminUser');
const app = require('../app');
const { logChatMessageAction, CHAT_AUDIT_ACTIONS } = require('../services/chatAuditService');
const AUDIT_ACTIONS = require('../constants/auditActions');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

function tokenFor(overrides = {}) {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email: 'admin@acwaops.com',
      name: 'Audit Tester',
      accessRole: 'admin',
      crew: 'A',
      empId: '100001',
      ...overrides,
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockAuditQuery(rows = [{ action: 'CHAT_MESSAGE_SENT' }], total = 1) {
  const lean = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn(() => ({ lean }));
  const skip = jest.fn(() => ({ limit }));
  const sort = jest.fn(() => ({ skip }));
  AuditLog.find.mockReturnValue({ sort });
  AuditLog.countDocuments.mockResolvedValue(total);
}

function mockChatMessageSearch(rows = [], total = 0) {
  const lean = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn(() => ({ lean }));
  const skip = jest.fn(() => ({ limit }));
  const sort = jest.fn(() => ({ skip }));
  ChatMessage.find.mockReturnValue({ sort });
  ChatMessage.countDocuments.mockResolvedValue(total);
  ChatRoom.find.mockReturnValue({
    select: () => ({
      lean: async () => [{ _id: 'room1', type: 'dm', crew: 'DM', name: 'Recipient', participants: [] }],
    }),
  });
  AdminUser.find.mockReturnValue({
    select: () => ({ lean: async () => [] }),
  });
}

describe('chatAuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logs chat message actions to audit log', async () => {
    AuditLog.create.mockResolvedValueOnce({ _id: '1' });
    await logChatMessageAction({
      req: { ip: '127.0.0.1', headers: {} },
      action: AUDIT_ACTIONS.CHAT_MESSAGE_SENT,
      message: { id: 'm1', text: 'Hello there' },
      room: { _id: 'r1', type: 'dm', name: 'Recipient', crew: 'DM', participants: ['u1', 'u2'] },
      author: { email: 'sender@acwapower.com', name: 'Sender' },
    });
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
    const payload = AuditLog.create.mock.calls[0][0];
    expect(payload.action).toBe('CHAT_MESSAGE_SENT');
    expect(payload.targetType).toBe('chat_message');
    expect(payload.after.roomType).toBe('dm');
  });

  test('exports chat audit action constants', () => {
    expect(CHAT_AUDIT_ACTIONS).toEqual(
      expect.arrayContaining([
        'CHAT_MESSAGE_SENT',
        'CHAT_MESSAGE_EDITED',
        'CHAT_MESSAGE_DELETED',
      ])
    );
  });
});

describe('GET /api/admin/chat-audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns chat audit for super admin', async () => {
    mockAuditQuery();

    const res = await request(app)
      .get('/api/admin/chat-audit?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFor({ email: 'admin@acwaops.com' })}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const filter = AuditLog.find.mock.calls[0][0];
    expect(filter.action.$in).toEqual(CHAT_AUDIT_ACTIONS);
  });

  test('returns 403 for crew admin', async () => {
    const res = await request(app)
      .get('/api/admin/chat-audit')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'crew.admin@acwapower.com', crew: 'A' })}`
      );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/chat-audit/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns searchable messages for super admin', async () => {
    mockChatMessageSearch(
      [
        {
          _id: 'm1',
          roomId: 'room1',
          authorId: 'u1',
          text: 'Hello',
          createdAt: new Date().toISOString(),
        },
      ],
      1
    );

    const res = await request(app)
      .get('/api/admin/chat-audit/messages?roomType=dm')
      .set('Authorization', `Bearer ${tokenFor({ email: 'admin@acwaops.com' })}`);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].text).toBe('Hello');
  });

  test('returns 403 for crew admin', async () => {
    const res = await request(app)
      .get('/api/admin/chat-audit/messages')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'crew.admin@acwapower.com', crew: 'A' })}`
      );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/audit-log chat exclusion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminUser.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { email: 'crew.admin@acwapower.com', crew: 'A' },
          { email: 'member@acwapower.com', crew: 'A' },
        ],
      }),
    });
  });

  test('crew admin audit log excludes chat actions', async () => {
    mockAuditQuery([{ action: 'EMPLOYEE_UPDATED' }]);

    const res = await request(app)
      .get('/api/admin/audit-log?page=1&limit=10')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'crew.admin@acwapower.com', crew: 'A' })}`
      );

    expect(res.status).toBe(200);
    const filter = AuditLog.find.mock.calls[0][0];
    const clauses = filter.$and || [filter];
    const chatExclusion = clauses.find((c) => c.action?.$nin);
    expect(chatExclusion.action.$nin).toEqual(CHAT_AUDIT_ACTIONS);
  });
});
