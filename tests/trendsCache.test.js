const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const FIXTURES = path.join(__dirname, 'fixtures', 'trends-blobs');
const BUNDLE_DIR = path.join(__dirname, '..', 'data', 'trends-blobs');

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
const { getTrendsCache, getTrendsBundle } = require('../controllers/plantDataController');
const {
  hasTrendSeriesData,
  buildPlantTrendsCacheFromPoints,
  chemistryWaterHasData,
} = require('../services/plantReports/plantTrendsCache');
const { resetTrendsBundleCache, hasUsableTrendsBundle } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');

function seedFixtures() {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  for (const file of fs.readdirSync(FIXTURES)) {
    fs.copyFileSync(path.join(FIXTURES, file), path.join(BUNDLE_DIR, file));
  }
  resetTrendsBundleCache();
}

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

describe('getTrendsCache (six-blob bundle alias)', () => {
  beforeAll(seedFixtures);
  beforeEach(resetTrendsBundleCache);

  it('returns 200 with bundle payload', async () => {
    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.seriesByKey).toBeDefined();
    expect(res.body.data.blobSource).toBe(true);
    expect(res.body.data.metrics.length).toBeGreaterThan(0);
  });

  it('trends-cache and trends-bundle return same shape', async () => {
    const app = express();
    app.get('/trends-cache', getTrendsCache);
    app.get('/trends-bundle', getTrendsBundle);
    const cacheRes = await request(app).get('/trends-cache');
    resetTrendsBundleCache();
    const bundleRes = await request(app).get('/trends-bundle');
    expect(cacheRes.body.data.metrics.length).toBe(bundleRes.body.data.metrics.length);
  });

  it('returns 503 when bundled blobs are missing', async () => {
    const saved = fs.readdirSync(BUNDLE_DIR).map((f) => ({
      name: f,
      body: fs.readFileSync(path.join(BUNDLE_DIR, f)),
    }));
    for (const f of saved) fs.unlinkSync(path.join(BUNDLE_DIR, f.name));
    resetTrendsBundleCache();

    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);

    for (const f of saved) fs.writeFileSync(path.join(BUNDLE_DIR, f.name), f.body);
    resetTrendsBundleCache();
  });

  it('rejects ?rebuild=1 without admin token', async () => {
    const app = express();
    app.get('/trends-cache', getTrendsCache);
    const res = await request(app).get('/trends-cache?rebuild=1');
    expect(res.status).toBe(403);
  });
});

describe('plantTrendsCache helpers (legacy build still used by ingest scripts)', () => {
  it('hasUsablePlantTrendsCache requires non-empty time series', () => {
    const { hasUsablePlantTrendsCache } = require('../services/plantReports/plantTrendsCache');
    expect(hasUsablePlantTrendsCache(null)).toBe(false);
    expect(hasUsablePlantTrendsCache({ generatedAt: '2026-01-01', metrics: [], seriesByKey: {} })).toBe(
      false
    );
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
  });
});

describe('hasUsableTrendsBundle', () => {
  it('matches bundle usability rules', () => {
    expect(hasUsableTrendsBundle(null)).toBe(false);
    expect(hasUsableTrendsBundle({ generatedAt: '2026-01-01', seriesByKey: {} })).toBe(false);
    expect(
      hasUsableTrendsBundle({
        generatedAt: '2026-01-01',
        seriesByKey: { x: [{ date: '2026-01-01', value: 1 }] },
      })
    ).toBe(true);
  });
});
