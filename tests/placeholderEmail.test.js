const { isPlaceholderEmail, isValidEmailFormat } = require('../utils/placeholderEmail');

describe('placeholderEmail', () => {
  test('detects roster.local placeholder addresses', () => {
    expect(isPlaceholderEmail('user@roster.acwaops.local')).toBe(true);
    expect(isPlaceholderEmail('user@roster.other')).toBe(true);
    expect(isPlaceholderEmail('real.user@company.com')).toBe(false);
  });

  test('validates email format', () => {
    expect(isValidEmailFormat('a@b.co')).toBe(true);
    expect(isValidEmailFormat('bad')).toBe(false);
    expect(isValidEmailFormat('a@b')).toBe(false);
  });
});
