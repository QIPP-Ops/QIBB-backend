const {
  resolveCourseLink,
  isExternalUrl,
  listCoursesForReminder,
} = require('../services/trainingCourseListService');

jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(),
}));

const AdminConfig = require('../models/AdminConfig');

describe('trainingCourseListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URL;
  });

  test('resolveCourseLink uses external Mishkaty URL when set', () => {
    const mishkaty = 'https://mishkaty.sabacloud.com/Saba/Web_spf/EU2PRD0191/app/dashboard';
    expect(resolveCourseLink(mishkaty)).toBe(mishkaty);
    expect(isExternalUrl(mishkaty)).toBe(true);
  });

  test('resolveCourseLink falls back to Training Hub URL', () => {
    expect(resolveCourseLink('')).toBe('https://acwaops.com/qipp/trainings');
    expect(resolveCourseLink('  ')).toBe('https://acwaops.com/qipp/trainings');
  });

  test('listCoursesForReminder merges curriculum and catalog without duplicates', async () => {
    AdminConfig.findOne.mockResolvedValue({
      curriculum: [
        {
          _id: 'cur-1',
          category: 'Safety',
          title: 'Lockout Tagout (LOTO)',
          description: 'Curriculum copy',
          link: 'https://mishkaty.example/course',
          duration: '1h',
        },
      ],
    });

    const courses = await listCoursesForReminder();
    expect(courses).toHaveLength(6);
    const loto = courses.find((c) => c.title === 'Lockout Tagout (LOTO)');
    expect(loto.id).toBe('cur-1');
    expect(loto.link).toBe('https://mishkaty.example/course');
    expect(loto.source).toBe('curriculum');

    const qhse = courses.find((c) => c.title === 'QHSE Fundamentals');
    expect(qhse.id).toBe('catalog:qhs-001');
    expect(qhse.link).toBe('https://acwaops.com/qipp/trainings');
    expect(qhse.source).toBe('catalog');
  });
});
