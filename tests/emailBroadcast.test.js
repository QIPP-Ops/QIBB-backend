const {
  _internals,
} = require('../controllers/emailBroadcastController');

const { parseRecipientFilters, parseExplicitRecipients } = _internals;

describe('emailBroadcast recipient parsing', () => {
  test('splits email addresses out of empIds array', () => {
    const filters = parseRecipientFilters({
      empIds: ['500440', 'ahmed.mostafa@nomac.com', 'fahad.halawani@nomac.com'],
    });
    expect(filters.empIds).toEqual(['500440']);
    expect(filters.emails).toEqual([
      'ahmed.mostafa@nomac.com',
      'fahad.halawani@nomac.com',
    ]);
  });

  test('parseExplicitRecipients keeps preview rows with valid email', () => {
    const rows = parseExplicitRecipients({
      recipients: [
        { name: 'Ahmed', email: 'ahmed.mostafa@nomac.com', empId: '1234', crew: 'General' },
        { name: 'Bad', email: 'not-an-email', empId: 'x' },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ahmed.mostafa@nomac.com');
  });
});

describe('emailBroadcast resolveRecipients', () => {
  test('matches recipients by email when empIds contains email keys', async () => {
    const { resolveRecipients } = _internals;
    const findMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            name: 'Ahmed',
            email: 'ahmed.mostafa@nomac.com',
            empId: '1234',
            crew: 'General',
            role: 'Admin',
            accessRole: 'admin',
          },
        ]),
      }),
    });

    const originalFind = require('../models/AdminUser').find;
    require('../models/AdminUser').find = findMock;

    try {
      const recipients = await resolveRecipients({
        all: false,
        crews: [],
        roles: [],
        accessRoles: [],
        empIds: [],
        emails: ['ahmed.mostafa@nomac.com'],
      });

      expect(recipients).toHaveLength(1);
      expect(recipients[0].email).toBe('ahmed.mostafa@nomac.com');
      expect(findMock).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            { email: { $in: ['ahmed.mostafa@nomac.com'] } },
          ]),
        })
      );
    } finally {
      require('../models/AdminUser').find = originalFind;
    }
  });
});
