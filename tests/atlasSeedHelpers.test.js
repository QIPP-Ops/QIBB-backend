const {
  buildPersonnelEmailIndex,
  resolvePersonEmail,
  rosterEmpId,
  parseEmailFromSmtpFrom,
  resolveSuperAdminCredentials,
} = require('../scripts/lib/atlasSeedHelpers');

describe('atlasSeedHelpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUPER_ADMIN_EMAIL;
    delete process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('resolvePersonEmail uses personnel-emails by empId', () => {
    const index = buildPersonnelEmailIndex([
      { name: 'Test User', email: 'test@nomac.com', empId: '2202' },
    ]);
    const email = resolvePersonEmail(
      { name: 'Abdulwahab', empId: '2202' },
      index
    );
    expect(email).toBe('test@nomac.com');
  });

  test('resolvePersonEmail prefers inline roster email', () => {
    const index = buildPersonnelEmailIndex([]);
    const email = resolvePersonEmail(
      { name: 'X', email: 'inline@nomac.com', empId: '1' },
      index
    );
    expect(email).toBe('inline@nomac.com');
  });

  test('rosterEmpId falls back to ROSTER-id', () => {
    expect(rosterEmpId({ id: 42, name: 'A' })).toBe('ROSTER-42');
    expect(rosterEmpId({ empId: '500', name: 'A' })).toBe('500');
  });

  test('parseEmailFromSmtpFrom extracts angle-bracket address', () => {
    expect(parseEmailFromSmtpFrom('QIPP Ops <admin@acwaops.com>')).toBe('admin@acwaops.com');
  });

  test('resolveSuperAdminCredentials prefers SUPER_ADMIN_EMAIL override', () => {
    process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
    process.env.SMTP_USER = 'smtp@example.com';
    process.env.SMTP_PASS = 'smtp-secret';
    const creds = resolveSuperAdminCredentials();
    expect(creds.email).toBe('admin@example.com');
    expect(creds.emailSource).toBe('SUPER_ADMIN_EMAIL');
    expect(creds.passwordSource).toBe('SMTP_PASS');
  });

  test('resolveSuperAdminCredentials uses SMTP_USER and SMTP_PASS by default', () => {
    process.env.SMTP_USER = 'mailbox@acwaops.com';
    process.env.SMTP_PASS = 'mailbox-secret';
    const creds = resolveSuperAdminCredentials();
    expect(creds.email).toBe('mailbox@acwaops.com');
    expect(creds.password).toBe('mailbox-secret');
    expect(creds.emailSource).toBe('SMTP_USER');
    expect(creds.passwordSource).toBe('SMTP_PASS');
  });

  test('resolveSuperAdminCredentials falls back to SMTP_FROM email', () => {
    process.env.SMTP_FROM = 'QIPP <ops@acwaops.com>';
    process.env.SMTP_PASS = 'mailbox-secret';
    const creds = resolveSuperAdminCredentials();
    expect(creds.email).toBe('ops@acwaops.com');
    expect(creds.emailSource).toBe('SMTP_FROM');
  });
});
