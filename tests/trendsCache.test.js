const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { id: 'admin-id', role: 'admin' };
    next();
  },
}));

jest.mock('../controllers/plantDataController', () => {
  const actual = jest.requireActual('../controllers/plantDataController');
  return {
    ...actual,
    runIngestNow: jest.fn((_req, res) => res.json({ success: true, data: { ok: true } })),
  };
});

const ingestRoutes = require('../routes/ingestRoutes');
const { getTrendsCache } = require('../controllers/plantDataController');
const {
  CACHE_FILE,
  hasUsablePlantTrendsCache,
  hasTrendSeriesData,
  buildPlantTrendsCacheFromPoints,
  chemistryWaterHasData,
  readPlantTrendsCacheFromDisk,
} = require('../services/plantReports/plantTrendsCache');

function makeApp(mountPath, router) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

describe('ingest trigger route', () => {
  it('POST /api/ingest/trigger returns success', async () => {
    const app = makeApp('/api/ingest', ingestRoutes);
    const res = await request(app).post('/api/ingest/trigger').send({ forceAll: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('getTrendsCache (disk-only hot path)', () => {
  const saved = { exists: false, body: null };

  beforeAll(() => {
    if (fs.existsSync(CACHE_FILE)) {
      saved.exists = true;
      saved.body = fs.readFileSync(CACHE_FILE, 'utf8');
    }
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        generatedAt: '2026-06-01T00:00:00.000Z',
        dateRange: { from: '2026-01-01', to: '2026-06-01', minDate: '2026-01-01', maxDate: '2026-06-01' },
        metrics: [{ metricKey: 'plant_generation', label: 'Generation', category: 'energy', unit: 'MWh' }],
        seriesByKey: { plant_generation: [{ date: '2026-05-01', plant_generation: 100 }] },
        chemistryWater: { latest: null, snapshots: [] },
      })
    );
  });

  afterAll(() => {
    if (saved.exists && saved.body != null) {
      fs.writeFileSync(CACHE_FILE, saved.body);
    } else if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  });

  it('returns 200 with disk cache payload', async () => {
    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.seriesByKey).toBeDefined();
    expect(res.body.data.metrics.length).toBeGreaterThan(0);
  });

  it('returns 503 when cache file is missing or empty', async () => {
    const missingPath = path.join(path.dirname(CACHE_FILE), 'plant-trends-cache-missing-test.json');
    const realCache = readPlantTrendsCacheFromDisk();
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ generatedAt: '2026-01-01', metrics: [{ metricKey: 'a' }], seriesByKey: {} })
    );

    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message)).toMatch(/cache/i);

    if (realCache) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(realCache));
    }
    void missingPath;
  });

  it('rejects ?rebuild=1 without admin token', async () => {
    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache?rebuild=1');
    expect(res.status).toBe(403);
  });
});

describe('plantTrendsCache disk reader', () => {
  it('hasUsablePlantTrendsCache requires non-empty time series', () => {
    expect(hasUsablePlantTrendsCache(null)).toBe(false);
    expect(hasUsablePlantTrendsCache({ generatedAt: '2026-01-01', metrics: [], seriesByKey: {} })).toBe(
      false
    );
    expect(
      hasUsablePlantTrendsCache({
        generatedAt: '2026-01-01',
        metrics: [{ metricKey: 'a' }],
        seriesByKey: {},
      })
    ).toBe(false);
    expect(
      hasUsablePlantTrendsCache({
        generatedAt: '2026-01-01',
        metrics: [{ metricKey: 'x' }],
        seriesByKey: {},
      })
    ).toBe(false);
    expect(
      hasUsablePlantTrendsCache({
        generatedAt: '2026-01-01',
        metrics: [],
        seriesByKey: { x: [{ date: '2026-01-01', x: 1 }] },
      })
    ).toBe(true);
    expect(hasTrendSeriesData({ seriesByKey: { x: [] } })).toBe(false);
  });

  it('buildPlantTrendsCacheFromPoints builds series from parsed points', () => {
    const payload = buildPlantTrendsCacheFromPoints([
      {
        metricKey: 'plant_generation',
        label: 'Generation',
        category: 'energy',
        unit: 'MWh',
        reportDate: '2026-05-01',
        value: 100,
        sourceFile: 'test.xlsx',
      },
      {
        metricKey: 'plant_generation',
        label: 'Generation',
        category: 'energy',
        unit: 'MWh',
        reportDate: '2026-05-02',
        value: 110,
        sourceFile: 'test.xlsx',
      },
    ]);
    expect(payload.metrics.length).toBe(1);
    expect(payload.seriesByKey.plant_generation.length).toBe(2);
  });

  it('chemistryWaterHasData detects snapshots and latest', () => {
    expect(chemistryWaterHasData(null)).toBe(false);
    expect(chemistryWaterHasData({ latest: null, snapshots: [] })).toBe(false);
    expect(
      chemistryWaterHasData({
        latest: { chemistry: { ro: { ph: 7 } } },
        snapshots: [],
      })
    ).toBe(true);
    expect(
      chemistryWaterHasData({
        latest: null,
        snapshots: [{ createdAt: '2026-01-01', water: { swProduction: 1 } }],
      })
    ).toBe(true);
  });

  it('readPlantTrendsCacheFromDisk parses sample file', () => {
    const dir = path.dirname(CACHE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const payload = { generatedAt: '2026-01-01', metrics: [{ metricKey: 'a' }], seriesByKey: {} };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
    const data = readPlantTrendsCacheFromDisk();
    expect(data.generatedAt).toBe('2026-01-01');
  });
});
