jest.mock('../services/plantReports/buildTrendsBundleFromSixBlobs', () => ({
  buildTrendsBundleFromSixBlobs: jest.fn(() => ({
    payload: {
      generatedAt: '2026-06-01T12:00:00.000Z',
      metrics: [{ metricKey: 'a' }, { metricKey: 'b' }],
      seriesByKey: { a: [{ date: '2026-06-01', value: 1 }] },
      bundleMeta: { totalPoints: 10 },
      blobSource: true,
    },
  })),
  hasUsableTrendsBundle: jest.fn(() => true),
}));

jest.mock('../services/plantReports/trendsBlobBundle', () => ({
  BUNDLED_DIR: '/data/trends-blobs',
  listBundledKinds: jest.fn(() => ['daily_ops', 'water']),
  hasBundledTrends: jest.fn(() => true),
}));

const ingestAdmin = require('../controllers/ingestAdminController');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('GET ingest-status (bundle-based)', () => {
  it('returns six-blob bundle metrics count', async () => {
    const res = mockRes();
    await ingestAdmin.getIngestStatus({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('six-blob-bundle');
    expect(res.body.data.metricsInCache).toBe(2);
    expect(res.body.data.ingestDeprecated).toBe(true);
    expect(res.body.data.unmatchedFiles).toEqual([]);
  });
});

describe('POST ingest trigger (deprecated)', () => {
  it('returns 410 for legacy ingest', async () => {
    const res = mockRes();
    await ingestAdmin.triggerIngest({ user: { id: 'admin', role: 'admin' } }, res);
    expect(res.statusCode).toBe(410);
    expect(res.body.message).toMatch(/removed/i);
  });
});
