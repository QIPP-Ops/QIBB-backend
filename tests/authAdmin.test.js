jest.mock('../services/emailService', () => ({
  sendOtpEmail: jest.fn(),
  sendResetEmail: jest.fn(),
  sendTempPasswordEmail: jest.fn().mockResolvedValue(undefined),
  isEmailConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
}));

const AdminUser = require('../models/AdminUser');
const { isEmailConfigured, sendTempPasswordEmail } = require('../services/emailService');
const { adminResetPassword, adminRevokeAccess } = require('../controllers/authController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('adminResetPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isEmailConfigured.mockReturnValue(true);
  });

  test('rejects placeholder roster emails', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    AdminUser.findOne.mockResolvedValue({
      _id: 'u1',
      email: 'john@roster.acwaops.local',
      name: 'John',
      save,
    });

    const req = { params: { userId: 'u1' } };
    const res = mockRes();

    await adminResetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PLACEHOLDER_EMAIL' })
    );
    expect(save).not.toHaveBeenCalled();
  });

  test('sends temp password email for real addresses', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    AdminUser.findOne.mockResolvedValue({
      _id: 'u2',
      email: 'real.user@company.com',
      name: 'Real User',
      resetToken: 'abc',
      resetTokenExpires: new Date(),
      save,
    });

    const req = { params: { userId: 'u2' } };
    const res = mockRes();

    await adminResetPassword(req, res);

    expect(save).toHaveBeenCalled();
    expect(sendTempPasswordEmail).toHaveBeenCalledWith(
      'real.user@company.com',
      'Real User',
      expect.any(String)
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        emailSent: true,
        email: 'real.user@company.com',
        message: expect.stringContaining('real.user@company.com'),
      })
    );
  });
});

describe('adminRevokeAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks revoking the super admin account', async () => {
    AdminUser.findOne.mockResolvedValue({
      _id: 'super',
      email: 'admin@acwaops.com',
      isActive: true,
      save: jest.fn(),
    });

    const req = { params: { userId: 'super' } };
    const res = mockRes();

    await adminRevokeAccess(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('toggles isActive for regular users', async () => {
    const user = {
      _id: 'u3',
      email: 'member@nomac.com',
      isActive: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    AdminUser.findOne.mockResolvedValue(user);

    const req = { params: { userId: 'u3' } };
    const res = mockRes();

    await adminRevokeAccess(req, res);

    expect(user.isActive).toBe(false);
    expect(user.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, message: 'Access revoked.' })
    );
  });

  test('restores access when already revoked', async () => {
    const user = {
      _id: 'u4',
      email: 'member@nomac.com',
      isActive: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    AdminUser.findOne.mockResolvedValue(user);

    const req = { params: { userId: 'u4' } };
    const res = mockRes();

    await adminRevokeAccess(req, res);

    expect(user.isActive).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, message: 'Access restored.' })
    );
  });
});
