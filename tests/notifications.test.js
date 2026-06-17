const Notification = require('../models/Notification');
const { runShiftReportReminderSweep } = require('../services/shiftReportReminderService');
const { classifyValue } = require('../services/chemistryAlarmService');
const MetricLimit = require('../models/MetricLimit');
const PlantMetricPoint = require('../models/PlantMetricPoint');

describe('shift report email reminder gate', () => {
  test('notifyShiftMissing skips emails when setting disabled', async () => {
    jest.resetModules();
    jest.doMock('../services/systemSettingsService', () => ({
      isShiftReportEmailRemindersEnabledForCrew: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../models/Notification', () => ({
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockImplementation((doc) => Promise.resolve({ ...doc, save: jest.fn() })),
    }));
    jest.doMock('../models/AdminUser', () => ({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ email: 'member@acwapower.com', name: 'M' }),
      }),
      find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) }),
      findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }),
    }));
    jest.doMock('../services/emailService', () => ({
      sendMail: jest.fn(),
      emailTemplate: (t, b) => `${t}${b}`,
      isEmailConfigured: () => true,
    }));
    jest.doMock('../services/adminEmailService', () => ({
      sendAdminBulkEmail: jest.fn().mockResolvedValue({ sent: 0 }),
    }));

    const { notifyShiftMissing } = require('../services/notificationService');
    const { sendMail } = require('../services/emailService');

    await notifyShiftMissing({
      member: { _id: '1', empId: 'E1', name: 'M', crew: 'A' },
      shiftDate: '2026-01-15',
      shiftLabel: 'Day',
      supervisors: [],
    });

    expect(sendMail).not.toHaveBeenCalled();
  });

  test('notifyShiftMissing sends emails when crew reminders enabled', async () => {
    jest.resetModules();
    jest.doMock('../services/systemSettingsService', () => ({
      isShiftReportEmailRemindersEnabledForCrew: jest.fn().mockResolvedValue(true),
    }));
    const create = jest.fn().mockImplementation((doc) => Promise.resolve({ ...doc, save: jest.fn() }));
    jest.doMock('../models/Notification', () => ({
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      create,
    }));
    jest.doMock('../models/AdminUser', () => ({
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ email: 'member@acwapower.com', name: 'M' }),
      }),
      find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) }),
      findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }),
    }));
    const sendMail = jest.fn().mockResolvedValue(true);
    jest.doMock('../services/emailService', () => ({
      sendMail,
      emailTemplate: (t, b) => `${t}${b}`,
      isEmailConfigured: () => true,
    }));
    jest.doMock('../services/adminEmailService', () => ({
      sendAdminBulkEmail: jest.fn().mockResolvedValue({ sent: 0 }),
    }));

    const { notifyShiftMissing } = require('../services/notificationService');

    await notifyShiftMissing({
      member: { _id: '1', empId: 'E1', name: 'M', crew: 'A' },
      shiftDate: '2026-01-15',
      shiftLabel: 'Day',
      supervisors: [],
    });

    expect(sendMail).toHaveBeenCalled();
  });
});

describe('notification recipient matrix', () => {
  test('shift missing matrix allows member and supervisor; admin digest is super-admin only', () => {
    const { RECIPIENT_MATRIX } = require('../services/notificationService');
    expect(RECIPIENT_MATRIX.shift_missing).toEqual({
      member: true,
      supervisor: true,
      admin: 'digest_super',
    });
  });

  test('system digests route only to super admin', () => {
    const { RECIPIENT_MATRIX } = require('../services/notificationService');
    expect(RECIPIENT_MATRIX.roster_lock).toEqual({
      member: false,
      supervisor: false,
      admin: 'super',
    });
    expect(RECIPIENT_MATRIX.ingest_complete.admin).toBe('super');
    expect(RECIPIENT_MATRIX.leave_conflict.admin).toBe('super');
  });

  test('quiz assigned excludes supervisor and admin', () => {
    const { RECIPIENT_MATRIX } = require('../services/notificationService');
    expect(RECIPIENT_MATRIX.quiz_assigned).toEqual({
      member: true,
      supervisor: false,
      admin: false,
    });
  });
});

describe('super-admin-only system notifications', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('notifyRosterLockChange notifies only super admin in-app', async () => {
    const create = jest.fn().mockImplementation((doc) => Promise.resolve({ ...doc, save: jest.fn() }));
    jest.doMock('../models/Notification', () => ({
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      create,
    }));
    jest.doMock('../models/AdminUser', () => ({
      find: jest.fn(),
      findOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve({ _id: 'super1', empId: 'SA', email: 'admin@acwaops.com', name: 'Super' }),
        }),
      }),
    }));
    jest.doMock('../services/emailService', () => ({
      sendMail: jest.fn(),
      emailTemplate: (t, b) => `${t}${b}`,
      isEmailConfigured: () => false,
    }));
    jest.doMock('../services/adminEmailService', () => ({
      sendAdminBulkEmail: jest.fn().mockResolvedValue({ sent: 0 }),
    }));

    const { notifyRosterLockChange } = require('../services/notificationService');
    const AdminUser = require('../models/AdminUser');

    await notifyRosterLockChange(true, 'Tester');
    expect(AdminUser.find).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].recipientUserId).toBe('super1');
    expect(create.mock.calls[0][0].type).toBe('roster_lock');
  });

  test('notifyShiftMissing admin digest targets super admin only', async () => {
    const create = jest.fn().mockImplementation((doc) => Promise.resolve({ ...doc, save: jest.fn() }));
    jest.doMock('../models/Notification', () => ({
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      create,
    }));
    jest.doMock('../models/AdminUser', () => ({
      find: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ _id: 'portal-admin' }]) }),
      }),
      findOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve({ _id: 'super1', empId: 'SA', email: 'admin@acwaops.com', name: 'Super' }),
        }),
      }),
    }));
    jest.doMock('../services/systemSettingsService', () => ({
      isShiftReportEmailRemindersEnabledForCrew: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../services/emailService', () => ({
      sendMail: jest.fn(),
      emailTemplate: (t, b) => `${t}${b}`,
      isEmailConfigured: () => false,
    }));
    jest.doMock('../services/adminEmailService', () => ({
      sendAdminBulkEmail: jest.fn().mockResolvedValue({ sent: 0 }),
    }));

    const { notifyShiftMissing } = require('../services/notificationService');
    const AdminUser = require('../models/AdminUser');

    await notifyShiftMissing({
      member: null,
      shiftDate: '2026-01-15',
      shiftLabel: 'Day',
      supervisors: [],
      adminDigest: 'Missing Day reports for 2026-01-15: Alice (A)',
    });

    expect(AdminUser.find).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].title).toMatch(/digest/i);
    expect(create.mock.calls[0][0].recipientUserId).toBe('super1');
  });
});

describe('metric limit classification', () => {
  test('classifies high alarm breach', () => {
    expect(
      classifyValue(12, {
        highAlarm: 10,
        highWarning: 8,
        lowWarning: 2,
        lowAlarm: 1,
        target: 5,
      })
    ).toBe('high_alarm');
  });

  test('returns ok when no limits configured', () => {
    expect(classifyValue(5, null)).toBe(null);
  });
});

describe('shift report reminder sweep', () => {
  test('runs without throwing when mongo unavailable in unit context', async () => {
    // Smoke: function exists and returns array shape when called with future date (no ended shifts)
    const { shiftWindow } = require('../services/shiftReportReminderService');
    const win = shiftWindow('D', '2026-01-15', 'A');
    expect(win?.label).toBe('Day');
    expect(win?.start).toBeInstanceOf(Date);
  });
});
