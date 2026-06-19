const { resolveLoginEmail, normalizeEmail } = require('../utils/resolveLoginEmail');

jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../services/emailDomainPolicy', () => ({
  getEmailDomainPolicy: jest.fn().mockResolvedValue({
    allowed: ['acwapower.com', 'nomac.com'],
    autoApproved: ['acwapower.com', 'nomac.com'],
  }),
}));

const AdminUser = require('../models/AdminUser');

describe('resolveLoginEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes through full email unchanged (normalized)', async () => {
    AdminUser.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    const email = await resolveLoginEmail('User@Nomac.COM');
    expect(email).toBe('user@nomac.com');
    expect(AdminUser.find).not.toHaveBeenCalled();
  });

  test('resolves unique username prefix from DB', async () => {
    AdminUser.find.mockReturnValue({
      select: () => ({
        lean: async () => [{ email: 'm.algarni@nomac.com' }],
      }),
    });
    const email = await resolveLoginEmail('m.algarni');
    expect(email).toBe('m.algarni@nomac.com');
  });

  test('disambiguates multiple prefix matches by preferred domain', async () => {
    AdminUser.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { email: 'admin@nomac.com' },
          { email: 'admin@acwaops.com' },
        ],
      }),
    });
    const email = await resolveLoginEmail('admin');
    expect(email).toBe('admin@acwaops.com');
  });

  test('falls back to constructed domain when no prefix matches', async () => {
    AdminUser.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    AdminUser.findOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ email: 'j.doe@nomac.com' }),
      }),
    });
    const email = await resolveLoginEmail('j.doe');
    expect(email).toBe('j.doe@nomac.com');
  });

  test('returns acwaops fallback when username not found', async () => {
    AdminUser.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    AdminUser.findOne.mockReturnValue({ select: () => ({ lean: async () => null }) });
    const email = await resolveLoginEmail('unknown.user');
    expect(email).toBe('unknown.user@acwaops.com');
  });
});

describe('normalizeEmail', () => {
  test('trims and lowercases', () => {
    expect(normalizeEmail('  Admin@ACWAOPS.com ')).toBe('admin@acwaops.com');
  });
});
