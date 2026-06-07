jest.mock('../services/plantReports/buildTrendsBundleFromSixBlobs', () => ({
  buildTrendsBundleFromSixBlobs: jest.fn(() => ({
    payload: {
      generatedAt: '2026-06-01T12:00:00.000Z',
      metrics: [{ metricKey: 'a' }, { metricKey: 'b' }],
      seriesByKey: { a: [{ date: '2026-06-01', value: 1 }] },
      bundleMeta: { totalPoints: 10, totalMetrics: 2, kindsLoaded: ['daily_ops', 'water'] },
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

jest.mock('../services/plantReports/syncTrendsBlobsService', () => ({
  syncTrendsBlobsFromAzure: jest.fn(),
  getSyncState: jest.fn(() => ({
    running: false,
    current: 0,
    total: 6,
    percent: 0,
    label: '',
    errors: [],
    lastResult: null,
  })),
  BLOB_KINDS: ['daily_ops', 'water', 'hrsg', 'fg_filter', 'air_intake', 'environment'],
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn(),
}));

const ingestAdmin = require('../controllers/ingestAdminController');
const { syncTrendsBlobsFromAzure } = require('../services/plantReports/syncTrendsBlobsService');

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
    expect(res.body.data.filesProcessed).toBe(2);
    expect(res.body.data.metricsWritten).toBe(2);
    expect(res.body.data.ingestDeprecated).toBe(true);
  });
});

describe('POST ingest trigger (blob sync)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    syncTrendsBlobsFromAzure.mockResolvedValue({
      success: true,
      filesProcessed: 6,
      filesTotal: 6,
      metricsWritten: 544,
      totalMetricsInCache: 544,
      errors: [],
    });
  });

  it('runs Azure blob sync and returns result', async () => {
    const res = mockRes();
    await ingestAdmin.triggerIngest({ user: { id: 'admin', role: 'admin' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.filesProcessed).toBe(6);
    expect(syncTrendsBlobsFromAzure).toHaveBeenCalled();
  });
});
