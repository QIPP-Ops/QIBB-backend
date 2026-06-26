jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/ShiftOverride', () => ({
  find: jest.fn(),
}));

jest.mock('../models/AttendanceRecord', () => ({
  find: jest.fn(),
}));

jest.mock('../utils/rosterEmployeeLoad', () => ({
  loadStaffingRosterEmployees: jest.fn(),
  visibleRosterEmployees: jest.fn((rows) => rows),
}));

const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const AttendanceRecord = require('../models/AttendanceRecord');
const { loadStaffingRosterEmployees } = require('../utils/rosterEmployeeLoad');
const {
  isWorkingDayForCrew,
  getAttendanceReminderStatus,
} = require('../services/attendanceReminderService');

describe('attendanceReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ shiftCycleBaseDate: '2026-01-01' }),
    });
    ShiftOverride.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    AttendanceRecord.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  describe('isWorkingDayForCrew', () => {
    it('treats General crew Mon-Thu as working days', () => {
      expect(isWorkingDayForCrew('General', '2026-06-22')).toBe(true); // Mon
      expect(isWorkingDayForCrew('General', '2026-06-25')).toBe(true); // Thu
    });

    it('treats General crew Fri-Sun as non-working', () => {
      expect(isWorkingDayForCrew('General', '2026-06-26')).toBe(false); // Fri
      expect(isWorkingDayForCrew('General', '2026-06-27')).toBe(false); // Sat
      expect(isWorkingDayForCrew('General', '2026-06-28')).toBe(false); // Sun
    });

    it('treats ops crews as working every day', () => {
      expect(isWorkingDayForCrew('A', '2026-06-26')).toBe(true);
      expect(isWorkingDayForCrew('B', '2026-06-27')).toBe(true);
    });
  });

  describe('getAttendanceReminderStatus', () => {
    it('returns show=false when all on-duty members have records', async () => {
      loadStaffingRosterEmployees.mockResolvedValue([
        {
          empId: 'EMP-1',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [],
        },
      ]);
      AttendanceRecord.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ empId: 'EMP-1' }]),
        }),
      });

      const result = await getAttendanceReminderStatus({
        crew: 'A',
        date: '2026-06-23',
      });

      expect(result.show).toBe(false);
      expect(result.missingCount).toBe(0);
    });

    it('returns show=true when on-duty members lack records', async () => {
      loadStaffingRosterEmployees.mockResolvedValue([
        {
          empId: 'EMP-1',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [],
        },
        {
          empId: 'EMP-2',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [],
        },
      ]);
      AttendanceRecord.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ empId: 'EMP-1' }]),
        }),
      });

      const result = await getAttendanceReminderStatus({
        crew: 'A',
        date: '2026-06-23',
      });

      expect(result.show).toBe(true);
      expect(result.missingCount).toBeGreaterThanOrEqual(1);
    });
  });
});
