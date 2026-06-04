jest.mock('../models/PlantMetricPoint', () => ({
  updateOne: jest.fn().mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 }),
}));

jest.mock('../models/PlantMetric', () => ({
  PlantMetric: { updateOne: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../services/chemistryAlarmService', () => ({
  evaluateMetricReading: jest.fn(),
}));

const PlantMetricPoint = require('../models/PlantMetricPoint');
const { upsertPoints } = require('../services/plantReports/ingestProcessResult');

describe('ingest future-date guard', () => {
  beforeEach(() => {
    PlantMetricPoint.updateOne.mockClear();
  });

  it('does not upsert points with reportDate after today', async () => {
    const now = new Date('2026-06-02T12:00:00Z');
    const n = await upsertPoints(
      [
        {
          metricKey: 'water_gr1',
          reportDate: '2026-06-01',
          value: 10,
          sourceFile: 'w.xlsx',
          label: 'GR-1',
          category: 'water',
        },
        {
          metricKey: 'water_gr1',
          reportDate: '2026-06-06',
          value: 11,
          sourceFile: 'w.xlsx',
          label: 'GR-1',
          category: 'water',
        },
      ],
      { now, log: false }
    );

    expect(n).toBe(0);
    expect(PlantMetricPoint.updateOne).toHaveBeenCalledTimes(1);
    expect(PlantMetricPoint.updateOne.mock.calls[0][0].reportDate).toBe('2026-06-01');
  });
});
