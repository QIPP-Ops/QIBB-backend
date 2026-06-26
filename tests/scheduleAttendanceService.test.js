jest.mock('../models/AttendanceRecord', () => ({
  find: jest.fn(),
}));

const AttendanceRecord = require('../models/AttendanceRecord');
const { enrichScheduleWithAttendance } = require('../services/scheduleAttendanceService');

function mockFindChain(rows = []) {
  return { lean: jest.fn().mockResolvedValue(rows) };
}

describe('scheduleAttendanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AttendanceRecord.find.mockImplementation(() => mockFindChain([]));
  });

  test('enriches past-date cells with attendance', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const past = yesterday.toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const future = tomorrow.toISOString().slice(0, 10);

    AttendanceRecord.find.mockImplementation(() =>
      mockFindChain([
        {
          empId: 'E1',
          date: past,
          status: 'present',
          isLate: false,
          isLeftEarly: false,
          derivedFromLeave: false,
        },
      ])
    );

    const schedule = {
      dates: [past, today, future],
      rows: [
        {
          empId: 'E1',
          cells: [
            { date: past, display: 'D', onLeave: false },
            { date: today, display: 'N', onLeave: false },
            { date: future, display: 'O', onLeave: false },
          ],
        },
      ],
    };

    const enriched = await enrichScheduleWithAttendance(schedule);
    expect(enriched.rows[0].cells[0].attendance).toEqual({
      status: 'present',
      isLate: false,
      isLeftEarly: false,
      derivedFromLeave: false,
    });
    expect(enriched.rows[0].cells[1].attendance).toBeUndefined();
    expect(enriched.rows[0].cells[2].attendance).toBeUndefined();
    expect(AttendanceRecord.find).toHaveBeenCalledWith({
      empId: { $in: ['E1'] },
      date: { $gte: past, $lte: past },
    });
  });

  test('does not attach attendance on leave cells', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const past = yesterday.toISOString().slice(0, 10);

    AttendanceRecord.find.mockImplementation(() =>
      mockFindChain([
        {
          empId: 'E1',
          date: past,
          status: 'absent',
          derivedFromLeave: true,
        },
      ])
    );

    const schedule = {
      dates: [past],
      rows: [
        {
          empId: 'E1',
          cells: [{ date: past, display: 'L', onLeave: true }],
        },
      ],
    };

    const enriched = await enrichScheduleWithAttendance(schedule);
    expect(enriched.rows[0].cells[0].attendance).toEqual({
      status: 'absent',
      isLate: false,
      isLeftEarly: false,
      derivedFromLeave: true,
    });
  });

  test('returns schedule unchanged when no past dates', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const future = tomorrow.toISOString().slice(0, 10);

    const schedule = {
      dates: [future],
      rows: [{ empId: 'E1', cells: [{ date: future, display: 'D', onLeave: false }] }],
    };

    const enriched = await enrichScheduleWithAttendance(schedule);
    expect(enriched).toEqual(schedule);
    expect(AttendanceRecord.find).not.toHaveBeenCalled();
  });
});
