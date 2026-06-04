const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { id: 'admin-id', role: 'admin' };
    next();
  },
}));

jest.mock('../services/plantReports/metricPreview', () => ({
  fetchMetricPreview: jest.fn(),
}));

const { fetchMetricPreview } = require('../services/plantReports/metricPreview');
const plantDataRoutes = require('../routes/plantDataRoutes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/plant-data', plantDataRoutes);
  return app;
}

describe('GET /plant-data/metrics/:key/preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns preview payload', async () => {
    fetchMetricPreview.mockResolvedValue({
      metricKey: 'gr1_consumpt',
      displayName: 'GR-1 Consumption',
      unit: 'm³',
      firstDate: '2026-01-01',
      lastDate: '2026-05-31',
      totalPoints: 150,
      sample: [{ date: '2026-05-31', value: 296, unit: 'm³' }],
    });

    const res = await request(makeApp()).get('/plant-data/metrics/gr1_consumpt/preview');
    expect(res.status).toBe(200);
    expect(res.body.data.metricKey).toBe('gr1_consumpt');
    expect(fetchMetricPreview).toHaveBeenCalledWith('gr1_consumpt');
  });

  test('returns 404 when metric not found', async () => {
    fetchMetricPreview.mockResolvedValue(null);
    const res = await request(makeApp()).get('/plant-data/metrics/unknown_key/preview');
    expect(res.status).toBe(404);
  });
});
