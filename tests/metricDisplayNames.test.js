const mongooseState = { readyState: 1 };

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    get connection() {
      return { readyState: mongooseState.readyState };
    },
  };
});

jest.mock('../models/FileMapping', () => ({
  find: jest.fn(),
}));
jest.mock('../models/PlantMetricPoint', () => ({
  aggregate: jest.fn(),
}));
jest.mock('../models/PlantMetric', () => ({
  PlantMetric: { find: jest.fn() },
}));
jest.mock('../models/TrendDisplayConfig', () => ({
  findOne: jest.fn(),
}));

const FileMapping = require('../models/FileMapping');
const PlantMetricPoint = require('../models/PlantMetricPoint');
const { PlantMetric } = require('../models/PlantMetric');
const TrendDisplayConfig = require('../models/TrendDisplayConfig');
const { buildMetricDisplayNameMap } = require('../services/plantReports/metricDisplayNames');

describe('buildMetricDisplayNameMap', () => {
  beforeEach(() => {
    mongooseState.readyState = 1;
    jest.clearAllMocks();
    FileMapping.find.mockReturnValue({ lean: () => Promise.resolve([]) });
    PlantMetric.find.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            {
              metricKey: 'plant_generation',
              label: 'Gen',
              displayName: 'GT-12 Generation MW',
            },
          ]),
      }),
    });
    TrendDisplayConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  it('merges display names with per-metric dateRange from aggregate', async () => {
    PlantMetricPoint.aggregate.mockResolvedValue([
      {
        _id: 'plant_generation',
        earliest: '2025-10-01',
        latest: '2026-06-30',
      },
    ]);

    const data = await buildMetricDisplayNameMap();

    expect(PlantMetricPoint.aggregate).toHaveBeenCalledWith([
      {
        $group: {
          _id: '$metricKey',
          earliest: { $min: '$reportDate' },
          latest: { $max: '$reportDate' },
        },
      },
    ]);
    expect(data.plant_generation).toEqual({
      displayName: 'GT-12 Generation MW',
      dateRange: { earliest: '2025-10-01', latest: '2026-06-30' },
    });
  });

  it('returns null dateRange when aggregate fails', async () => {
    PlantMetricPoint.aggregate.mockRejectedValue(new Error('cosmos down'));

    const data = await buildMetricDisplayNameMap();

    expect(data.plant_generation.displayName).toBe('GT-12 Generation MW');
    expect(data.plant_generation.dateRange).toBeNull();
  });

  it('skips aggregate when mongoose is disconnected', async () => {
    mongooseState.readyState = 0;

    const data = await buildMetricDisplayNameMap();

    expect(PlantMetricPoint.aggregate).not.toHaveBeenCalled();
    expect(data.plant_generation.dateRange).toBeNull();
  });
});
