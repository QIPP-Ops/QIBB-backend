const {
  parseValidUntil,
  formatExpiryDate,
  deliverExpiryEmails,
  sendMemberExpiryEmail,
  sendCrewAdminExpiryEmail,
  runPtwExpiryReminderSweep,
  REMINDER_DAYS,
} = require('../jobs/ptwExpiryReminderJob');

jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('../services/emailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
  emailTemplate: (subject, body) => `<html>${subject}${body}</html>`,
  isEmailConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock('../utils/placeholderEmail', () => ({
  isPlaceholderEmail: jest.fn().mockReturnValue(false),
  isValidEmailFormat: jest.fn((email) => {
    const e = String(email || '').trim();
    return e.includes('@') && e.split('@')[1]?.includes('.');
  }),
}));

describe('ptwExpiryReminderJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { isPlaceholderEmail } = require('../utils/placeholderEmail');
    isPlaceholderEmail.mockReturnValue(false);
  });

  test('parseValidUntil accepts ISO and DMY', () => {
    expect(parseValidUntil('2026-06-15')?.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(parseValidUntil('15.06.2026')?.toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  test('formatExpiryDate uses DD MMM YYYY', () => {
    expect(formatExpiryDate(new Date('2026-06-15T12:00:00.000Z'))).toBe('15 Jun 2026');
  });

  test('sendMemberExpiryEmail uses required subject and body', async () => {
    const { sendMail } = require('../services/emailService');

    await sendMemberExpiryEmail(
      { name: 'Ali Ops', email: 'ali@acwaops.com' },
      'Permit Issuer',
      '15 Jun 2026',
      30,
      { name: 'Ali Ops', validUntil: '2026-06-15' }
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ali@acwaops.com',
        subject: 'PTW Authorization Expiry Reminder — Permit Issuer',
      })
    );
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('Ali Ops');
    expect(html).toContain('Dear');
    expect(html).toContain('15 Jun 2026');
    expect(html).toContain('30 days');
    expect(html).toContain('Acwa Operations, QIPP');
  });

  test('sendMemberExpiryEmail skips placeholder addresses', async () => {
    const { sendMail } = require('../services/emailService');
    const { isPlaceholderEmail } = require('../utils/placeholderEmail');
    isPlaceholderEmail.mockReturnValue(true);

    const sent = await sendMemberExpiryEmail(
      { name: 'Roster User', email: 'user@roster.acwaops.local' },
      'Permit Issuer',
      '15 Jun 2026',
      14,
      { name: 'Roster User' }
    );

    expect(sent).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('sendCrewAdminExpiryEmail uses required subject and body', async () => {
    const { sendMail } = require('../services/emailService');

    await sendCrewAdminExpiryEmail(
      { name: 'Crew Admin', email: 'admin.crew@acwaops.com' },
      'Ali Ops',
      'Permit Issuer',
      '15 Jun 2026',
      7
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin.crew@acwaops.com',
        subject: 'PTW Expiry Alert — Ali Ops',
      })
    );
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain("Ali Ops");
    expect(html).toContain('PTW authorization');
    expect(html).toContain('15 Jun 2026');
  });

  test('deliverExpiryEmails still sends in-app when member email is placeholder', async () => {
    const { sendMail } = require('../services/emailService');
    const { isPlaceholderEmail } = require('../utils/placeholderEmail');
    isPlaceholderEmail.mockImplementation((email) => email.includes('roster'));

    await deliverExpiryEmails({
      member: { name: 'ZZZ NoMatch Person', email: 'ali@roster.acwaops.local' },
      crewAdmins: [{ name: 'Admin', email: 'real.admin@acwaops.com' }],
      memberName: 'Ali Ops',
      roleName: 'Permit Issuer',
      expiryFormatted: '15 Jun 2026',
      daysLeft: 14,
      person: { name: 'Ali Ops', notifyEmail: 'ali@roster.acwaops.local' },
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('real.admin@acwaops.com');
  });

  test('runPtwExpiryReminderSweep sends notifications and emails on reminder day', async () => {
    const AdminConfig = require('../models/AdminConfig');
    const AdminUser = require('../models/AdminUser');
    const { createNotification } = require('../services/notificationService');
    const { sendMail } = require('../services/emailService');

    const expiry = new Date();
    expiry.setUTCDate(expiry.getUTCDate() + REMINDER_DAYS[0]);
    const validUntil = expiry.toISOString().slice(0, 10);

    AdminConfig.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          ptwPersonnel: [
            {
              name: 'Ali Ops',
              empId: 'E100',
              authorizations: ['permitIssuer'],
              validUntil,
              crew: 'A',
            },
          ],
        }),
    });

    const member = {
      _id: 'member1',
      name: 'Ali Ops',
      empId: 'E100',
      email: 'ali@acwaops.com',
      crew: 'A',
    };
    const crewAdmin = {
      _id: 'admin1',
      name: 'Crew Admin',
      empId: 'E9',
      email: 'crew.admin@acwaops.com',
      crew: 'A',
      accessRole: 'admin',
    };

    AdminUser.find.mockImplementation((query) => ({
      select: () => ({
        lean: () => {
          if (query?.accessRole === 'admin') {
            return Promise.resolve([crewAdmin]);
          }
          return Promise.resolve([member, crewAdmin]);
        },
      }),
    }));

    const now = new Date();
    const result = await runPtwExpiryReminderSweep(now);

    expect(result.reminded).toBe(1);
    expect(createNotification).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalled();
    const subjects = sendMail.mock.calls.map((c) => c[0].subject);
    expect(subjects.some((s) => s.includes('PTW Authorization Expiry Reminder'))).toBe(true);
    expect(subjects.some((s) => s.includes('PTW Expiry Alert'))).toBe(true);
  });
});
