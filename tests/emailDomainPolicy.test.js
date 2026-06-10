const {
  normalizeDomainList,
  DEFAULT_ALLOWED_DOMAINS,
} = require('../services/emailDomainPolicy');

describe('emailDomainPolicy', () => {
  test('normalizeDomainList trims and dedupes', () => {
    expect(normalizeDomainList([' Acwapower.COM ', 'nomac.com', 'nomac.com'])).toEqual([
      'acwapower.com',
      'nomac.com',
    ]);
  });

  test('defaults include acwapower and nomac', () => {
    expect(DEFAULT_ALLOWED_DOMAINS).toEqual(expect.arrayContaining(['acwapower.com', 'nomac.com']));
  });
});
