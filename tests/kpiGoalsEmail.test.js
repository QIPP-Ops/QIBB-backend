const { notifyKpiSubmitted, notifyKpiFinalized } = require('../services/notificationService');

jest.mock('../services/adminEmailService', () => ({
  sendAdminBulkEmail: jest.fn().mockResolvedValue({ sent: 1, recipients: ['admin@acwaops.com'] }),
}));

jest.mock('../services/emailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
  emailTemplate: (subject, body) => `<html>${subject}${body}</html>`,
  isEmailConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock('../utils/placeholderEmail', () => ({
  isPlaceholderEmail: jest.fn().mockReturnValue(false),
}));

jest.mock('../config/frontendUrl', () => ({
  getFrontendBaseUrl: () => 'https://qipp.test',
}));

describe('KPI email notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('notifyKpiSubmitted emails super admin', async () => {
    const { sendAdminBulkEmail } = require('../services/adminEmailService');

    await notifyKpiSubmitted({
      employee: { name: 'Ali Ops', empId: 'E100', kpis: [{ title: 'Safety', weight: 30 }] },
    });

    expect(sendAdminBulkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Ali Ops'),
        superAdminOnly: true,
      })
    );
  });

  test('notifyKpiFinalized emails employee with KPI link', async () => {
    const { sendMail } = require('../services/emailService');

    await notifyKpiFinalized({
      employee: {
        name: 'Ali Ops',
        email: 'ali@acwaops.com',
        empId: 'E100',
        kpis: [{ title: 'Safety', weight: 30, progress: 50 }],
      },
      reviewNotes: 'Looks good.',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ali@acwaops.com',
        subject: expect.stringContaining('finalized'),
      })
    );
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('/settings/kpi');
    expect(html).toContain('Looks good');
  });

  test('notifyKpiFinalized skips when email not configured', async () => {
    const { sendMail } = require('../services/emailService');
    const { isEmailConfigured } = require('../services/emailService');
    isEmailConfigured.mockReturnValueOnce(false);

    const result = await notifyKpiFinalized({
      employee: { name: 'Ali', email: 'ali@acwaops.com', kpis: [] },
    });

    expect(result.sent).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
