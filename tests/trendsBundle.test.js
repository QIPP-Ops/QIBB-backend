const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const FIXTURES = path.join(__dirname, 'fixtures', 'trends-blobs');
const BUNDLE_DIR = path.join(__dirname, '..', 'data', 'trends-blobs');

const {
  buildTrendsBundleFromSixBlobs,
  hasUsableTrendsBundle,
  resetTrendsBundleCache,
} = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
const { normalizeDailyOpsBlob } = require('../services/plantReports/trendBlobNormalize');
const { getTrendsBundle } = require('../controllers/plantDataController');

function seedFixtures() {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  for (const file of fs.readdirSync(FIXTURES)) {
    fs.copyFileSync(path.join(FIXTURES, file), path.join(BUNDLE_DIR, file));
  }
  resetTrendsBundleCache();
}

describe('buildTrendsBundleFromSixBlobs', () => {
  beforeAll(seedFixtures);
  beforeEach(resetTrendsBundleCache);

  it('normalizes daily_ops nested blob rows', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'daily_ops.json'), 'utf8'));
    const rows = normalizeDailyOpsBlob(raw);
    expect(rows.some((r) => r.metric === 'TOTAL PLANT LOAD IN MW')).toBe(true);
    expect(rows.some((r) => r.metric.includes('MFEQH'))).toBe(true);
  });

  it('merges all six blobs into seriesByKey payload', () => {
    const { payload } = buildTrendsBundleFromSixBlobs({ force: true });
    expect(hasUsableTrendsBundle(payload)).toBe(true);
    expect(payload.blobSource).toBe(true);
    expect(payload.blobKinds.length).toBe(6);
    expect(payload.metrics.length).toBeGreaterThan(0);
    expect(Object.keys(payload.seriesByKey).length).toBeGreaterThan(0);
    expect(payload.dateRange.minDate).toBe('2026-05-01');
  });

  it('serves GET /trends-bundle with Cache-Control and ETag', async () => {
    const app = express();
    app.get('/trends-bundle', getTrendsBundle);
    const res = await request(app).get('/trends-bundle');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['cache-control']).toMatch(/max-age=300/);
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.data.seriesByKey).toBeDefined();
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    const app = express();
    app.get('/trends-bundle', getTrendsBundle);
    const first = await request(app).get('/trends-bundle');
    const etag = first.headers.etag;
    const second = await request(app).get('/trends-bundle').set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });

  it('returns 503 when no bundled blobs exist', async () => {
    const saved = fs.existsSync(BUNDLE_DIR)
      ? fs.readdirSync(BUNDLE_DIR).map((f) => ({
          name: f,
          body: fs.readFileSync(path.join(BUNDLE_DIR, f)),
        }))
      : [];
    for (const f of saved) {
      fs.unlinkSync(path.join(BUNDLE_DIR, f.name));
    }
    resetTrendsBundleCache();

    const app = express();
    app.get('/trends-bundle', getTrendsBundle);
    const res = await request(app).get('/trends-bundle');
    expect(res.status).toBe(503);
    expect(String(res.body.message)).toMatch(/six-blob/i);

    fs.mkdirSync(BUNDLE_DIR, { recursive: true });
    for (const f of saved) {
      fs.writeFileSync(path.join(BUNDLE_DIR, f.name), f.body);
    }
    resetTrendsBundleCache();
  });
});
