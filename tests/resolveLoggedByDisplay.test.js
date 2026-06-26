jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
}));

const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');
const {
  buildLoggedByLookup,
  resolveLoggedByDisplay,
  isObjectIdString,
} = require('../utils/resolveLoggedByDisplay');

const loggerId = new mongoose.Types.ObjectId().toString();

function mockFindChain(rows = []) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
}

describe('resolveLoggedByDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('isObjectIdString detects 24-char hex ids', () => {
    expect(isObjectIdString(loggerId)).toBe(true);
    expect(isObjectIdString('EMP-100')).toBe(false);
    expect(isObjectIdString('Supervisor')).toBe(false);
  });

  test('resolveLoggedByDisplay maps ObjectId to user name', async () => {
    AdminUser.find.mockImplementation((query) => {
      if (query._id) {
        return mockFindChain([{ _id: loggerId, name: 'Mohammad Algarni', email: 'm.algarni@acwapower.com' }]);
      }
      return mockFindChain([]);
    });

    const lookup = await buildLoggedByLookup([
      { loggedBy: loggerId, loggedByEmail: 'm.algarni@acwapower.com' },
    ]);

    expect(
      resolveLoggedByDisplay(
        { loggedBy: loggerId, loggedByEmail: 'm.algarni@acwapower.com' },
        lookup
      )
    ).toBe('Mohammad Algarni');
  });

  test('resolveLoggedByDisplay falls back to email for missing user', async () => {
    AdminUser.find.mockImplementation(() => mockFindChain([]));

    const lookup = await buildLoggedByLookup([
      { loggedBy: loggerId, loggedByEmail: 'deleted@acwapower.com' },
    ]);

    expect(
      resolveLoggedByDisplay(
        { loggedBy: loggerId, loggedByEmail: 'deleted@acwapower.com' },
        lookup
      )
    ).toBe('deleted@acwapower.com');
  });

  test('resolveLoggedByDisplay keeps readable loggedBy values', async () => {
    AdminUser.find.mockImplementation(() => mockFindChain([]));

    const lookup = await buildLoggedByLookup([{ loggedBy: 'Supervisor', loggedByEmail: '' }]);

    expect(resolveLoggedByDisplay({ loggedBy: 'Supervisor', loggedByEmail: '' }, lookup)).toBe(
      'Supervisor'
    );
  });

  test('resolveLoggedByDisplay resolves email-only records', async () => {
    AdminUser.find.mockImplementation((query) => {
      if (query.email) {
        return mockFindChain([{ _id: loggerId, name: 'System User', email: 'system@acwapower.com' }]);
      }
      return mockFindChain([]);
    });

    const lookup = await buildLoggedByLookup([{ loggedBy: '', loggedByEmail: 'system@acwapower.com' }]);

    expect(
      resolveLoggedByDisplay({ loggedBy: '', loggedByEmail: 'system@acwapower.com' }, lookup)
    ).toBe('System User');
  });
});
