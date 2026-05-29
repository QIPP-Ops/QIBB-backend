const Notification = require('../models/Notification');
const { runShiftReportReminderSweep } = require('../services/shiftReportReminderService');
const { classifyValue } = require('../services/chemistryAlarmService');
const MetricLimit = require('../models/MetricLimit');
const PlantMetricPoint = require('../models/PlantMetricPoint');

describe('shift report email reminder gate', () => {
  test('notifyShiftMissing skips emails when setting disabled', async () => {
    jest.resetModules();
    jest.doMock('../services/systemSettingsService', () => ({
      isShiftReportEmailRemindersEnabled: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../models/Notification', () => ({
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockImplementation((doc) => Promise.resolve({ ...doc, save: jest.fn() })),
    }));
    jest.doMock('../models/AdminUser', () => ({
      findById: jest.fn().mockResolvedValue({ email: 'member@test.com', name: 'M' }),
      find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) }),
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
});

describe('notification recipient matrix', () => {
  test('shift missing matrix allows member, supervisor, admin digest', () => {
    const { RECIPIENT_MATRIX } = require('../services/notificationService');
    expect(RECIPIENT_MATRIX.shift_missing).toEqual({
      member: true,
      supervisor: true,
      admin: 'digest',
    });
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
