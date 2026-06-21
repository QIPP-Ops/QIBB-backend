jest.mock('../models/PlantMetricPoint');
jest.mock('../models/PlantMetric', () => ({
  PlantMetric: {
    find: jest.fn(),
  },
}));
jest.mock('../models/PlantIngestionState');
jest.mock('../models/TrendsSnapshot');
jest.mock('../services/plantReports/historicalDashboard', () => ({
  getDateBounds: jest.fn().mockResolvedValue({
    minDate: '2026-01-01',
    maxDate: '2026-06-01',
    pointCount: 2,
  }),
}));

const PlantMetricPoint = require('../models/PlantMetricPoint');
const { PlantMetric } = require('../models/PlantMetric');
const PlantIngestionState = require('../models/PlantIngestionState');
const TrendsSnapshot = require('../models/TrendsSnapshot');
const {
  buildPlantTrendsCachePayload,
  buildPlantTrendsCacheFromPoints,
} = require('../services/plantReports/plantTrendsCache');

describe('buildPlantTrendsCachePayload (PlantMetricPoint)', () => {
  beforeEach(() => {
    PlantMetric.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          metricKey: 'plant_generation',
          label: 'Generation',
          category: 'energy',
          unit: 'MWh',
        },
      ]),
    });
    PlantMetricPoint.aggregate = jest.fn().mockResolvedValue([
      { _id: 'plant_generation', count: 2 },
    ]);
    PlantMetricPoint.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            metricKey: 'plant_generation',
            reportDate: '2026-05-01',
            value: 100,
          },
          {
            metricKey: 'plant_generation',
            reportDate: '2026-05-02',
            value: 110,
          },
        ]),
      }),
    });
    TrendsSnapshot.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    TrendsSnapshot.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
    PlantIngestionState.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        lastSuccessAt: '2026-06-01T00:00:00.000Z',
        filesProcessed: 1,
        pointsUpserted: 2,
      }),
    });
  });

  it('builds metrics and seriesByKey from PlantMetricPoint rows', async () => {
    const payload = await buildPlantTrendsCachePayload();
    expect(payload.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricKey: 'plant_generation', label: 'Generation' }),
      ])
    );
    expect(payload.seriesByKey.plant_generation).toHaveLength(2);
    expect(payload.dateRange.from).toBe('2026-01-01');
    expect(PlantMetricPoint.find).toHaveBeenCalledWith(
      expect.objectContaining({
        reportDate: { $gte: '2026-01-01', $lte: '2026-06-01' },
        $or: expect.arrayContaining([{ metricKey: 'plant_generation' }]),
      })
    );
  });

  it('buildPlantTrendsCacheFromPoints matches ingest script shape', () => {
    const payload = buildPlantTrendsCacheFromPoints([
      {
        metricKey: 'plant_load',
        label: 'Load',
        category: 'energy',
        reportDate: '2026-05-01',
        value: 50,
      },
    ]);
    expect(payload.metrics[0].metricKey).toBe('plant_load');
    expect(payload.seriesByKey.plant_load.length).toBe(1);
  });
});
