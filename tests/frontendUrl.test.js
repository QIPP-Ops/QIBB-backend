const { getFrontendBaseUrl } = require('../config/frontendUrl');

describe('frontendUrl reset links', () => {
  const original = process.env.FRONTEND_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  test('defaults to acwaops.com/qipp base path', () => {
    delete process.env.FRONTEND_URL;
    expect(getFrontendBaseUrl()).toBe('https://acwaops.com/qipp');
  });

  test('reset password URL includes /qipp path prefix', () => {
    process.env.FRONTEND_URL = 'https://acwaops.com/qipp';
    const token = 'abc123';
    const email = 'user@example.com';
    const url = `${getFrontendBaseUrl()}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    expect(url).toBe('https://acwaops.com/qipp/reset-password?token=abc123&email=user%40example.com');
  });
});
