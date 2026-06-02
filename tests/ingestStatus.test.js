jest.mock('../models/IngestLog', () => ({
  findOne: jest.fn(() => ({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    }),
  })),
  find: jest.fn(() => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    }),
  })),
}));

jest.mock('../services/plantReports/plantTrendsCache', () => ({
  getPlantTrendsCachePath: jest.fn(() => '/home/data/plant-trends-cache.json'),
  readPlantTrendsCacheFromDisk: jest.fn(),
}));

const IngestLog = require('../models/IngestLog');
const { readPlantTrendsCacheFromDisk } = require('../services/plantReports/plantTrendsCache');
const { getIngestCronStatus } = require('../jobs/ingestCron');
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

describe('GET ingest-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readPlantTrendsCacheFromDisk.mockReturnValue({
      generatedAt: '2026-06-01',
      metrics: [{ metricKey: 'a' }, { metricKey: 'b' }],
      seriesByKey: {},
    });
  });

  it('returns safe defaults when cache read throws', async () => {
    readPlantTrendsCacheFromDisk.mockImplementation(() => {
      throw new Error('EROFS: read-only file system');
    });

    const res = mockRes();
    await ingestAdmin.getIngestStatus({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metricsInCache).toBe(0);
    expect(res.body.data.cachePath).toMatch(/plant-trends-cache\.json$/);
    expect(res.body.data.unmatchedFiles).toEqual([]);
  });

  it('includes metricsInCache and cachePath from plantTrendsCache helpers', async () => {
    const res = mockRes();
    await ingestAdmin.getIngestStatus({}, res);

    expect(res.body.data.metricsInCache).toBe(2);
    expect(res.body.data.totalMetricsInCache).toBe(2);
    expect(res.body.data.cachePath).toBe('/home/data/plant-trends-cache.json');
    expect(Array.isArray(res.body.data.unmatchedFiles)).toBe(true);
  });

  it('getIngestCronStatus resolves cache path via getPlantTrendsCachePath', async () => {
    const status = await getIngestCronStatus();
    expect(status.cachePath).toBe('/home/data/plant-trends-cache.json');
    expect(status.metricsInCache).toBe(2);
  });
});
