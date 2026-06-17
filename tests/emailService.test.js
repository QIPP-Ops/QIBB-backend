const {
  smtpFailureHint,
  isLikelyRenderSmtpBlock,
} = require('../services/emailService');

describe('emailService SMTP hints', () => {
  const originalRender = process.env.RENDER;

  afterEach(() => {
    if (originalRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = originalRender;
  });

  test('detects likely Render SMTP block on timeout', () => {
    process.env.RENDER = 'true';
    const err = new Error('Connection timeout');
    expect(isLikelyRenderSmtpBlock(err)).toBe(true);
    expect(smtpFailureHint(err)).toMatch(/block outbound ports/i);
  });

  test('suggests GoDaddy settings for generic timeout off Render', () => {
    delete process.env.RENDER;
    const err = new Error('Connection timeout');
    expect(isLikelyRenderSmtpBlock(err)).toBe(false);
    expect(smtpFailureHint(err)).toMatch(/smtpout.secureserver.net/i);
  });
});
