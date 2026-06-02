const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { id: 'admin-id', role: 'admin' };
    next();
  },
}));

jest.mock('../services/plantReports/metricSeriesQuery', () => ({
  fetchMetricSeriesFromMongo: jest.fn(),
}));

const { fetchMetricSeriesFromMongo } = require('../services/plantReports/metricSeriesQuery');
const plantDataRoutes = require('../routes/plantDataRoutes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/plant-data', plantDataRoutes);
  return app;
}

describe('GET /plant-data/trend-preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMetricSeriesFromMongo.mockResolvedValue({
      series: [{ date: '2026-05-01', plant_generation: 42 }],
      rowCount: 1,
      from: '2026-01-01',
      to: '2026-06-01',
      keys: ['plant_generation'],
    });
  });

  it('returns series from PlantMetricPoint query service', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/plant-data/trend-preview')
      .query({ keys: 'plant_generation', from: '2026-01-01', to: '2026-06-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.series).toHaveLength(1);
    expect(fetchMetricSeriesFromMongo).toHaveBeenCalledWith(
      ['plant_generation'],
      '2026-01-01',
      '2026-06-01'
    );
  });

  it('requires keys query param', async () => {
    const app = makeApp();
    const res = await request(app).get('/plant-data/trend-preview');
    expect(res.status).toBe(400);
  });
});
