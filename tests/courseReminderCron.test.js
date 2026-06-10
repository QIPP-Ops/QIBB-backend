const { CRON_UTC, startCourseReminderCron } = require('../jobs/courseReminderCron');

jest.mock('../services/courseReminderService', () => ({
  sendOverdueCourseReminders: jest.fn().mockResolvedValue({ sent: 2, skipped: 0, checked: 2 }),
}));

describe('courseReminderCron', () => {
  test('exposes 04:00 UTC schedule constant', () => {
    expect(CRON_UTC).toBe('0 4 * * *');
    expect(typeof startCourseReminderCron).toBe('function');
  });
});
