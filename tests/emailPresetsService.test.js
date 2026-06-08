const {
  loadBundledEmailPresets,
  mergeEmailPresets,
  MONTHLY_PRESET_ID,
} = require('../services/emailPresetsService');

describe('emailPresetsService', () => {
  test('bundled presets include monthly-planned-leaves', () => {
    const bundled = loadBundledEmailPresets();
    const monthly = bundled.find((p) => p.id === MONTHLY_PRESET_ID);
    expect(monthly).toBeDefined();
    expect(monthly.name).toMatch(/monthly planned leaves/i);
    expect(monthly.subject).toContain('{{month}}');
  });

  test('mergeEmailPresets adds monthly preset when Mongo list omits it', () => {
    const mongoOnly = [
      {
        id: 'shift-report',
        name: 'Custom shift reminder',
        subject: 'Custom {{date}}',
        body: '<p>Custom</p>',
      },
    ];
    const merged = mergeEmailPresets(mongoOnly);
    const ids = merged.map((p) => p.id);
    expect(ids).toContain(MONTHLY_PRESET_ID);
    expect(ids).toContain('leave-deadline-full');
    expect(ids).toContain('shift-report');
    const shift = merged.find((p) => p.id === 'shift-report');
    expect(shift.subject).toBe('Custom {{date}}');
  });

  test('mergeEmailPresets preserves bundled order with Mongo overrides', () => {
    const merged = mergeEmailPresets([]);
    expect(merged.length).toBeGreaterThanOrEqual(4);
    expect(merged[0].id).toBe('leave-deadline-full');
    expect(merged.some((p) => p.id === MONTHLY_PRESET_ID)).toBe(true);
  });
});
