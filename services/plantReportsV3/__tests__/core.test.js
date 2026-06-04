const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function kindFilePath(kind) {
  return path.join(OUTPUT_DIR, `${kind}.json`);
}

function installFsMock(fileStore) {
  jest.spyOn(fs, 'existsSync').mockImplementation((p) => fileStore.has(String(p)));
  jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
    const key = String(p);
    if (!fileStore.has(key)) {
      const err = new Error(`ENOENT: ${key}`);
      err.code = 'ENOENT';
      throw err;
    }
    return fileStore.get(key);
  });
  jest.spyOn(fs, 'writeFileSync').mockImplementation((p, data) => {
    fileStore.set(String(p), data);
  });
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
}

describe('schema.js', () => {
  const { validatePoint, validatePayload } = require('../schema');

  test('validatePoint returns true for valid numeric value', () => {
    expect(validatePoint({ date: '2026-02-01', metric: 'heat_rate', value: 500 })).toBe(true);
  });

  test('validatePoint returns true when value is null', () => {
    expect(validatePoint({ date: '2026-02-01', metric: 'heat_rate', value: null })).toBe(true);
  });

  test('validatePoint returns false when date is missing', () => {
    expect(validatePoint({ metric: 'heat_rate', value: 500 })).toBe(false);
  });

  test('validatePoint returns false when metric is empty string', () => {
    expect(validatePoint({ date: '2026-02-01', metric: '', value: 500 })).toBe(false);
  });

  test('validatePoint returns false when value is NaN', () => {
    expect(validatePoint({ date: '2026-02-01', metric: 'heat_rate', value: NaN })).toBe(false);
  });

  test('validatePayload returns { valid: true } for a correct payload', () => {
    expect(
      validatePayload({
        kind: 'water',
        data: [{ date: '2026-02-01', metric: 'heat_rate', value: 500 }],
      }),
    ).toEqual({ valid: true });
  });

  test('validatePayload returns { valid: false, errors: [...] } for unknown kind', () => {
    const result = validatePayload({
      kind: 'unknown_kind',
      data: [],
    });
    expect(result.valid).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('validatePayload returns { valid: false, errors: [...] } when a point is invalid', () => {
    const result = validatePayload({
      kind: 'water',
      data: [{ date: 'not-a-date', metric: 'heat_rate', value: 500 }],
    });
    expect(result.valid).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.some((e) => e.includes('data[0]'))).toBe(true);
  });
});

describe('jsonStore.js', () => {
  const fileStore = new Map();

  beforeEach(() => {
    fileStore.clear();
    jest.restoreAllMocks();
    installFsMock(fileStore);
    jest.resetModules();
  });

  function requireJsonStore() {
    return require('../jsonStore');
  }

  test('loadKind returns { kind, data: [] } when file does not exist', () => {
    const { loadKind } = requireJsonStore();
    expect(loadKind('energy')).toEqual({ kind: 'energy', data: [] });
  });

  test('saveKind writes a valid payload and loadKind reads it back correctly', () => {
    const { saveKind, loadKind } = requireJsonStore();
    const payload = {
      kind: 'shift',
      data: [{ date: '2026-01-15', metric: 'load', value: 100 }],
    };
    saveKind('shift', payload);
    expect(loadKind('shift')).toEqual({
      kind: 'shift',
      data: [{ date: '2026-01-15', metric: 'load', value: 100 }],
    });
    expect(fileStore.has(kindFilePath('shift'))).toBe(true);
  });

  test('saveKind throws when payload is invalid', () => {
    const { saveKind } = requireJsonStore();
    expect(() =>
      saveKind('shift', {
        kind: 'shift',
        data: [{ date: 'bad', metric: 'load', value: 100 }],
      }),
    ).toThrow();
  });

  test('mergeKind overwrites same date + metric with new value', () => {
    const { saveKind, mergeKind } = requireJsonStore();
    saveKind('water', {
      kind: 'water',
      data: [{ date: '2026-01-01', metric: 'flow', value: 10 }],
    });
    const merged = mergeKind('water', [{ date: '2026-01-01', metric: 'flow', value: 99 }]);
    expect(merged.data).toEqual([{ date: '2026-01-01', metric: 'flow', value: 99 }]);
  });

  test('mergeKind keeps both records when date or metric differs', () => {
    const { saveKind, mergeKind } = requireJsonStore();
    saveKind('water', {
      kind: 'water',
      data: [{ date: '2026-01-01', metric: 'flow', value: 10 }],
    });
    const merged = mergeKind('water', [
      { date: '2026-01-02', metric: 'flow', value: 20 },
      { date: '2026-01-01', metric: 'pressure', value: 30 },
    ]);
    expect(merged.data).toHaveLength(3);
    expect(merged.data).toEqual(
      expect.arrayContaining([
        { date: '2026-01-01', metric: 'flow', value: 10 },
        { date: '2026-01-02', metric: 'flow', value: 20 },
        { date: '2026-01-01', metric: 'pressure', value: 30 },
      ]),
    );
  });

  test('mergeKind output is sorted by date then metric ascending', () => {
    const { mergeKind } = requireJsonStore();
    const merged = mergeKind('timers', [
      { date: '2026-03-01', metric: 'z_metric', value: 1 },
      { date: '2026-01-01', metric: 'b_metric', value: 2 },
      { date: '2026-01-01', metric: 'a_metric', value: 3 },
      { date: '2026-02-01', metric: 'm_metric', value: 4 },
    ]);
    expect(merged.data.map((p) => `${p.date}:${p.metric}`)).toEqual([
      '2026-01-01:a_metric',
      '2026-01-01:b_metric',
      '2026-02-01:m_metric',
      '2026-03-01:z_metric',
    ]);
  });
});

describe('trendSync.js', () => {
  const fileStore = new Map();

  beforeEach(() => {
    fileStore.clear();
    jest.restoreAllMocks();
    installFsMock(fileStore);
    jest.resetModules();
    const { saveKind } = require('../jsonStore');
    saveKind('energy', {
      kind: 'energy',
      data: [
        { date: '2026-01-01', metric: 'zeta', value: 1, row: 9 },
        { date: '2026-01-01', metric: 'alpha', value: 2 },
        { date: '2026-02-15', metric: 'alpha', value: 3 },
        { date: '2026-03-01', metric: 'beta', value: 4 },
        { date: '2026-04-01', metric: 'alpha', value: 5 },
      ],
    });
    jest.resetModules();
    installFsMock(fileStore);
  });

  function requireTrendSync() {
    return require('../trendSync');
  }

  test('listAvailableMetrics returns sorted unique metric names', () => {
    const { listAvailableMetrics } = requireTrendSync();
    expect(listAvailableMetrics('energy')).toEqual(['alpha', 'beta', 'zeta']);
  });

  test('previewKindData filters by metric correctly', () => {
    const { previewKindData } = requireTrendSync();
    const rows = previewKindData('energy', { metric: 'alpha' });
    expect(rows).toHaveLength(3);
    expect(rows.every((p) => p.metric === 'alpha')).toBe(true);
    expect(rows).toEqual([
      { date: '2026-01-01', metric: 'alpha', value: 2 },
      { date: '2026-02-15', metric: 'alpha', value: 3 },
      { date: '2026-04-01', metric: 'alpha', value: 5 },
    ]);
  });

  test('previewKindData filters by dateFrom and dateTo correctly', () => {
    const { previewKindData } = requireTrendSync();
    const rows = previewKindData('energy', {
      dateFrom: '2026-02-01',
      dateTo: '2026-03-31',
    });
    expect(rows).toEqual([
      { date: '2026-02-15', metric: 'alpha', value: 3 },
      { date: '2026-03-01', metric: 'beta', value: 4 },
    ]);
  });

  test('previewKindData respects limit', () => {
    const { previewKindData } = requireTrendSync();
    const rows = previewKindData('energy', { limit: 2 });
    expect(rows).toEqual([
      { date: '2026-03-01', metric: 'beta', value: 4 },
      { date: '2026-04-01', metric: 'alpha', value: 5 },
    ]);
  });

  test('syncKindToTrends calls writeFn once per point with only { date, metric, value }', () => {
    const { syncKindToTrends } = requireTrendSync();
    const written = [];
    const result = syncKindToTrends('energy', (point) => written.push(point));
    expect(result).toEqual({ kind: 'energy', synced: 5 });
    expect(written).toHaveLength(5);
    for (const point of written) {
      expect(Object.keys(point).sort()).toEqual(['date', 'metric', 'value']);
      expect(point).not.toHaveProperty('row');
    }
  });
});
