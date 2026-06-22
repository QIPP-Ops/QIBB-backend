const {
  ACWA_EMAIL_LOGO_SVG,
  EMAIL_LOGO_HTML,
  BRAND_MOTTO_HTML,
  getEmailHeroImageUrl,
} = require('../services/emailBrandAssets');
const { emailTemplate } = require('../services/emailService');

describe('emailBrandAssets', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  test('ACWA logo SVG uses path geometry from ptw/acwa-logo.svg (no text elements)', () => {
    expect(ACWA_EMAIL_LOGO_SVG).toContain('<svg');
    expect(ACWA_EMAIL_LOGO_SVG).toContain('viewBox="0 0 65 90"');
    expect(ACWA_EMAIL_LOGO_SVG).toContain('M12.0233 49.9211');
    expect(ACWA_EMAIL_LOGO_SVG).toContain('#9273DA');
    expect(ACWA_EMAIL_LOGO_SVG).not.toContain('<text');
    expect(ACWA_EMAIL_LOGO_SVG).toContain('aria-label="Acwa Operations"');
  });

  test('EMAIL_LOGO_HTML shows Acwa Operations | QIPP wordmark beside logo', () => {
    expect(EMAIL_LOGO_HTML).toContain(ACWA_EMAIL_LOGO_SVG);
    expect(EMAIL_LOGO_HTML).toContain('Acwa Operations');
    expect(EMAIL_LOGO_HTML).toContain('QIPP');
    expect(EMAIL_LOGO_HTML).not.toContain('<text');
  });

  test('BRAND_MOTTO_HTML includes company motto', () => {
    expect(BRAND_MOTTO_HTML).toContain('Driving progress');
    expect(BRAND_MOTTO_HTML).toContain('people and the planet');
  });

  test('getEmailHeroImageUrl points at hosted frontend hero asset', () => {
    process.env.FRONTEND_URL = 'https://acwaops.com/qipp';
    expect(getEmailHeroImageUrl()).toBe('https://acwaops.com/qipp/hero-image.jpeg');
  });

  test('getEmailLogoUrl points at hosted ptw/acwa-logo.svg', () => {
    const { getEmailLogoUrl } = require('../services/emailBrandAssets');
    process.env.FRONTEND_URL = 'https://acwaops.com/qipp';
    expect(getEmailLogoUrl()).toBe('https://acwaops.com/qipp/ptw/acwa-logo.svg');
  });
});

describe('emailTemplate branding wrapper', () => {
  test('wraps body with ACWA header logo, hero background, and footer motto', () => {
    const html = emailTemplate('Test subject', '<p>Hello</p>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(EMAIL_LOGO_HTML);
    expect(html).toContain(BRAND_MOTTO_HTML);
    expect(html).toContain('hero-image.jpeg');
    expect(html).toContain('linear-gradient(rgba(0,0,0,0.75)');
    expect(html).toContain('<h2>Test subject</h2>');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('automated message');
    expect(html).not.toContain('<text');
  });
});
