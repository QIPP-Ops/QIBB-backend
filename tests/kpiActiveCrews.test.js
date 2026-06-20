jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
}));

jest.mock('../models/Notification', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    }),
  }),
}));

const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const { getAllCrewKpis, getCrewKpi } = require('../services/kpiService');

describe('kpiService active crew filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ availableCrews: ['A', 'B'] }),
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: '1', empId: '101', name: 'Alpha', email: 'a@test.com', crew: 'A', role: 'CCR Operator' },
          { _id: '2', empId: '102', name: 'Removed', email: 's@test.com', crew: 'S', role: 'CCR Operator' },
        ]),
      }),
    });
  });

  test('getAllCrewKpis excludes deleted/inactive crews', async () => {
    const result = await getAllCrewKpis();
    expect(result.crews.map((c) => c.crewId)).toEqual(['A']);
    expect(result.crews.find((c) => c.crewId === 'S')).toBeUndefined();
  });

  test('getCrewKpi returns empty for inactive crew', async () => {
    const result = await getCrewKpi('S');
    expect(result.crewKPI).toBe(0);
    expect(result.members).toEqual([]);
  });
});
