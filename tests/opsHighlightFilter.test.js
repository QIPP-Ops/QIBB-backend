const {
  isValidOpsHighlight,
  filterOpsHighlights,
} = require('../services/plantReports/opsHighlightFilter');

describe('opsHighlightFilter', () => {
  test('rejects date-only remarks', () => {
    expect(isValidOpsHighlight('10.03.2025')).toBe(false);
    expect(isValidOpsHighlight('2025-03-10')).toBe(false);
    expect(isValidOpsHighlight('10/03/2025')).toBe(false);
  });

  test('rejects label-only remarks ending with colon', () => {
    expect(isValidOpsHighlight('CRBS Status:')).toBe(false);
    expect(isValidOpsHighlight('GT Status :')).toBe(false);
  });

  test('rejects generic non-informative phrases', () => {
    expect(isValidOpsHighlight('All are in service.')).toBe(false);
    expect(isValidOpsHighlight('all in service')).toBe(false);
    expect(isValidOpsHighlight('Normal operation')).toBe(false);
  });

  test('rejects too-short remarks without action words', () => {
    expect(isValidOpsHighlight('OK')).toBe(false);
    expect(isValidOpsHighlight('Status ok')).toBe(false);
  });

  test('accepts substantive operational remarks', () => {
    expect(
      isValidOpsHighlight(
        'GT-1 reported high vibration during startup; maintenance team notified for inspection.'
      )
    ).toBe(true);
    expect(
      isValidOpsHighlight('Replaced RO cartridge filter after alarm tripped on DP limit.')
    ).toBe(true);
  });

  test('accepts shorter remarks with action verbs', () => {
    expect(isValidOpsHighlight('Alarm tripped on GT-2')).toBe(true);
  });

  test('filterOpsHighlights removes invalid entries', () => {
    const input = [
      { text: '10.03.2025', reportDate: '2025-03-10' },
      { text: 'CRBS Status:', reportDate: '2025-03-10' },
      { text: 'All are in service.', reportDate: '2025-03-10' },
      {
        text: 'Completed RO chemical cleaning and restored unit to normal operation.',
        reportDate: '2025-03-10',
      },
    ];
    const out = filterOpsHighlights(input);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('RO chemical cleaning');
  });
});
