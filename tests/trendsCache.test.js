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

jest.mock('../controllers/plantDataController', () => ({
  runIngestNow: jest.fn((_req, res) => res.json({ success: true, data: { ok: true } })),
  getTrendsCache: jest.fn((_req, res) => {
    res.json({
      success: true,
      data: {
        generatedAt: '2026-01-01T00:00:00.000Z',
        dateRange: { minDate: '2025-01-01', maxDate: '2026-01-01', pointCount: 10 },
        metrics: [{ metricKey: 'plant_generation', label: 'Generation', category: 'energy' }],
        seriesByKey: { plant_generation: [{ date: '2025-06-01', plant_generation: 100 }] },
      },
    });
  }),
}));

const ingestRoutes = require('../routes/ingestRoutes');
const { getTrendsCache } = require('../controllers/plantDataController');

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

describe('trends cache handler', () => {
  it('getTrendsCache returns JSON payload', async () => {
    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache');
    expect(res.status).toBe(200);
    expect(res.body.data.seriesByKey).toBeDefined();
  });
});

describe('plantTrendsCache disk reader', () => {
  it('hasUsablePlantTrendsCache detects metrics or series', () => {
    const { hasUsablePlantTrendsCache } = require('../services/plantReports/plantTrendsCache');
    expect(hasUsablePlantTrendsCache(null)).toBe(false);
    expect(hasUsablePlantTrendsCache({ generatedAt: '2026-01-01', metrics: [], seriesByKey: {} })).toBe(
      false
    );
    expect(
      hasUsablePlantTrendsCache({
        generatedAt: '2026-01-01',
        metrics: [{ metricKey: 'x' }],
        seriesByKey: {},
      })
    ).toBe(true);
    expect(
      hasUsablePlantTrendsCache({
        generatedAt: '2026-01-01',
        metrics: [],
        seriesByKey: { x: [{ date: '2026-01-01', x: 1 }] },
      })
    ).toBe(true);
  });

  it('buildPlantTrendsCacheFromPoints builds series from parsed points', () => {
    const { buildPlantTrendsCacheFromPoints } = require('../services/plantReports/plantTrendsCache');
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
    const { chemistryWaterHasData } = require('../services/plantReports/plantTrendsCache');
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
    const { readPlantTrendsCacheFromDisk, CACHE_FILE } = require('../services/plantReports/plantTrendsCache');
    const dir = path.dirname(CACHE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const payload = { generatedAt: '2026-01-01', metrics: [], seriesByKey: {} };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
    const data = readPlantTrendsCacheFromDisk();
    expect(data.generatedAt).toBe('2026-01-01');
  });
});
