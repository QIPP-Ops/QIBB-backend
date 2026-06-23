jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../data/roster.json', () => [
  {
    name: 'Test User',
    empId: '1001',
    crew: 'A',
    role: 'Supervisor',
    color: 'crew-a',
    leaves: [],
  },
]);

jest.mock('../data/personnel-emails.json', () => []);

const AdminUser = require('../models/AdminUser');
const { seedRosterUsers } = require('../scripts/seed-mongodb');

describe('seedRosterUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates missing roster users from seed file', async () => {
    AdminUser.findOne.mockResolvedValue(null);
    AdminUser.create.mockResolvedValue({});

    const result = await seedRosterUsers('temp-password');

    expect(AdminUser.create).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  test('does not overwrite crew, role, or leaves on existing users', async () => {
    const existing = {
      empId: '1001',
      name: 'Edited Name',
      crew: 'B',
      role: 'CCR Operator',
      leaves: [{ start: '2026-06-01', end: '2026-06-05', type: 'Annual Leave' }],
      isApproved: true,
      isEmailVerified: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    AdminUser.findOne.mockResolvedValue(existing);

    const result = await seedRosterUsers('temp-password');

    expect(AdminUser.create).not.toHaveBeenCalled();
    expect(existing.save).not.toHaveBeenCalled();
    expect(existing.crew).toBe('B');
    expect(existing.role).toBe('CCR Operator');
    expect(existing.name).toBe('Edited Name');
    expect(existing.leaves).toHaveLength(1);
    expect(result.unchanged).toBe(1);
  });

  test('only patches approval flags when missing on existing users', async () => {
    const existing = {
      empId: '1001',
      name: 'Edited Name',
      crew: 'B',
      role: 'CCR Operator',
      leaves: [],
      isApproved: false,
      isEmailVerified: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    AdminUser.findOne.mockResolvedValue(existing);

    const result = await seedRosterUsers('temp-password');

    expect(existing.isApproved).toBe(true);
    expect(existing.isEmailVerified).toBe(true);
    expect(existing.save).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(1);
  });
});
