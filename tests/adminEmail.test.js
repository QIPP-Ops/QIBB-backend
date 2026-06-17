const { emailTemplate } = require('../services/emailService');
const { CRON_UTC, startDailyDigestCron } = require('../jobs/dailyDigestCron');

jest.mock('../services/dailyDigestService', () => ({
  sendDailyDigest: jest.fn().mockResolvedValue({ sent: 1, recipients: ['admin@acwaops.com'] }),
}));

describe('admin email template', () => {
  test('emailTemplate header uses path-based ACWA logo and dimmed hero background', () => {
    const html = emailTemplate('Test', '<p>body</p>');
    expect(html).toContain('hero-image.jpeg');
    expect(html).toContain('linear-gradient(rgba(0,0,0,0.75)');
    expect(html).toContain('<svg');
    expect(html).not.toContain('<text');
    expect(html).toContain('operations</td>');
    expect(html).toContain('M12.0233 49.9211');
    expect(html).toContain('automated message');
  });
});

describe('dailyDigestCron', () => {
  test('registers 03:30 UTC schedule', () => {
    expect(CRON_UTC).toBe('30 3 * * *');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
    startDailyDigestCron();
    startDailyDigestCron();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('30 3 * * *'));
    log.mockRestore();
    intervalSpy.mockRestore();
  });
});

describe('systemSettingsService defaults', () => {
  test('shift report reminders default true when unset', async () => {
    jest.resetModules();
    jest.mock('../models/SystemSettings', () => ({
      findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) }),
      findOneAndUpdate: jest.fn(),
    }));
    const { isShiftReportEmailRemindersEnabled } = require('../services/systemSettingsService');
    await expect(isShiftReportEmailRemindersEnabled()).resolves.toBe(true);
  });
});
