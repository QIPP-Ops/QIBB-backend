const {
  getEmailProvider,
  getFromAddress,
  isResendConfigured,
  isEmailConfigured,
} = require('../config/emailProvider');

describe('emailProvider', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  test('prefers resend when RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'secret';
    expect(getEmailProvider()).toBe('resend');
    expect(isEmailConfigured()).toBe(true);
  });

  test('uses RESEND_FROM when configured', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM = 'QIPP <onboarding@resend.dev>';
    expect(getFromAddress()).toBe('QIPP <onboarding@resend.dev>');
  });

  test('falls back to smtp provider when only smtp is configured', () => {
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'secret';
    expect(getEmailProvider()).toBe('smtp');
    expect(isResendConfigured()).toBe(false);
  });
});
