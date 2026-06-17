const { assignableUserFilter } = require('../services/quizAssignmentService');

describe('quiz assignment user filter', () => {
  test('uses isApproved (not legacy approved field)', () => {
    const filter = assignableUserFilter({ _id: { $in: ['abc'] } });
    expect(filter.isApproved).toBe(true);
    expect(filter.approved).toBeUndefined();
    expect(filter.isActive).toEqual({ $ne: false });
    expect(filter._id).toEqual({ $in: ['abc'] });
  });

  test('crew filter inherits approval constraints', () => {
    const filter = assignableUserFilter({ crew: 'A' });
    expect(filter.crew).toBe('A');
    expect(filter.isApproved).toBe(true);
  });
});
