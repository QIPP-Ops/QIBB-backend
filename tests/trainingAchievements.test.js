jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue({ completedCourses: [] }),
    })),
  })),
}));

jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/CourseAssignment', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      populate: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      })),
    })),
  })),
}));

jest.mock('../models/Quiz', () => ({}));

jest.mock('../models/QuizAssignment', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      populate: jest.fn(() => ({
        populate: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([]),
        })),
      })),
    })),
  })),
}));

jest.mock('../models/QuizAttempt', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      populate: jest.fn(() => ({
        populate: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([]),
        })),
      })),
    })),
  })),
}));

const mockSurveyLean = jest.fn();
jest.mock('../models/SurveyAssignment', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      populate: jest.fn(() => ({
        populate: jest.fn(() => ({
          lean: mockSurveyLean,
        })),
      })),
    })),
  })),
}));

const {
  matchesUser,
  getRecentAchievements,
  loadSurveyAuditCompletions,
} = require('../services/trainingAchievementsService');

describe('trainingAchievementsService', () => {
  const user = { _id: 'user1', empId: '2237', name: 'Mark Ramirez' };

  beforeEach(() => {
    mockSurveyLean.mockReset();
    mockSurveyLean.mockResolvedValue([]);
  });

  test('matchesUser by empId', () => {
    expect(matchesUser({ empId: '2237', employeeName: 'Someone Else' }, user)).toBe(true);
  });

  test('matchesUser by normalized name', () => {
    expect(matchesUser({ employeeName: 'mark ramirez' }, user)).toBe(true);
  });

  test('matchesUser by userId', () => {
    expect(matchesUser({ userId: 'user1' }, user)).toBe(true);
  });

  test('matchesUser rejects unrelated records', () => {
    expect(matchesUser({ empId: '9999', employeeName: 'Other Person' }, user)).toBe(false);
  });

  test('loadSurveyAuditCompletions maps completed survey assignments', async () => {
    const completedAt = new Date('2026-06-20T10:00:00.000Z');
    mockSurveyLean.mockResolvedValue([
      {
        _id: 'assign1',
        completedAt,
        userId: { _id: 'user2', empId: '1101', name: 'Jane Supervisor' },
        surveyId: { _id: 'survey1', title: 'Weekly PTW Check', surveyType: 'permit_audit' },
      },
    ]);

    const rows = await loadSurveyAuditCompletions();
    expect(rows).toEqual([
      {
        type: 'audit',
        userId: 'user2',
        empId: '1101',
        employeeName: 'Jane Supervisor',
        title: 'Weekly PTW Check',
        surveyType: 'permit_audit',
        completedAt,
        score: null,
        source: 'survey_assignment',
        assignmentId: 'assign1',
        surveyId: 'survey1',
      },
    ]);
  });

  test('getRecentAchievements includes audit completions sorted by recency', async () => {
    const older = new Date('2026-06-10T10:00:00.000Z');
    const newer = new Date('2026-06-20T10:00:00.000Z');
    mockSurveyLean.mockResolvedValue([
      {
        _id: 'assign1',
        completedAt: newer,
        userId: { _id: 'user2', empId: '1101', name: 'Jane Supervisor' },
        surveyId: { _id: 'survey1', title: 'Weekly PTW Check', surveyType: 'permit_audit' },
      },
      {
        _id: 'assign2',
        completedAt: older,
        userId: { _id: 'user3', empId: '2200', name: 'Alex Operator' },
        surveyId: { _id: 'survey2', title: 'Block 1 leak count', surveyType: 'field_inspection' },
      },
    ]);

    const rows = await getRecentAchievements({ limit: 5 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: 'audit',
      employeeName: 'Jane Supervisor',
      title: 'Weekly PTW Check',
      surveyType: 'permit_audit',
      completedAt: newer.toISOString(),
    });
    expect(rows[1]).toMatchObject({
      type: 'audit',
      employeeName: 'Alex Operator',
      surveyType: 'field_inspection',
    });
  });
});
