const { isValidHtml } = require('../utils/validateHtml');

describe('validateHtml', () => {
  test('accepts minimal HTML document', () => {
    const html = '<!DOCTYPE html><html><body><h1>Quiz</h1></body></html>';
    expect(isValidHtml(html)).toBe(true);
  });

  test('rejects plain text', () => {
    expect(isValidHtml('Hello world')).toBe(false);
  });

  test('rejects empty content', () => {
    expect(isValidHtml('')).toBe(false);
  });
});
