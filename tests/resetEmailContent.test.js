const mockResendSend = jest.fn().mockResolvedValue({ data: { id: '1' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args) => mockResendSend(...args) },
  })),
}));

jest.mock('../config/smtp', () => ({
  isEmailConfigured: () => true,
  getSmtpUser: () => 'user',
  getSmtpPassword: () => 'pass',
}));

jest.mock('../config/emailProvider', () => ({
  isResendConfigured: () => true,
  getResendApiKey: () => 're_test',
  getEmailProvider: () => 'resend',
  getFromAddress: () => 'QIPP <test@test.com>',
}));

const { sendResetEmail } = require('../services/emailService');

describe('sendResetEmail content', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    mockResendSend.mockClear();
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  test('includes acwaops.com portal and reset link in HTML', async () => {
    delete process.env.FRONTEND_URL;
    const resetUrl =
      'https://acwaops.com/qipp/reset-password?token=abc123&email=user%40example.com';
    await sendResetEmail('user@example.com', 'Test User', resetUrl);

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const payload = mockResendSend.mock.calls[0][0];
    expect(payload.subject).toMatch(/password reset/i);
    expect(payload.html).toContain('acwaops.com/qipp');
    expect(payload.html).toContain(resetUrl);
  });
});
