const path = require('path');
const fs = require('fs');

describe('crew calendar seed', () => {
  const seedPath = path.join(__dirname, '../data/qipp-crew-calendar.json');

  it('exists with Qurayyah plant members', () => {
    expect(fs.existsSync(seedPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    expect(data.memberCount).toBeGreaterThanOrEqual(50);
    expect(data.workScheduleDefault).toBe('12QY3');
    expect(data.companyCode).toBe('NOMC-NOQY');
  });

  it('includes sample staff with leave blocks', () => {
    const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const moustafa = data.members.find((m) => m.name.includes('Moustafa Elansary'));
    expect(moustafa).toBeTruthy();
    expect(moustafa.jobTitle).toMatch(/Supervisor/i);
    expect(moustafa.workSchedule).toBe('12QY3');
    expect(moustafa.upcomingTimeOff.length).toBeGreaterThan(0);

    const juma = data.members.find((m) => m.name === 'Juma Khan');
    expect(juma).toBeTruthy();
    expect(juma.jobTitle).toBe('CCR Operator');
  });
});

describe('crew calendar controller filters', () => {
  const { getCrew } = require('../controllers/crewCalendarController');

  function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  it('loads static seed when DB roster is empty', async () => {
    const AdminUser = require('../models/AdminUser');
    jest.spyOn(AdminUser, 'find').mockReturnValue({
      select: () => ({
        lean: async () => [{ email: 'admin@acwaops.com', name: 'Admin', empId: '1' }],
      }),
    });

    const req = { query: { crew: 'C' } };
    const res = mockRes();
    await getCrew(req, res);

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.source).toBe('static');
    expect(payload.members.every((m) => m.crew === 'C')).toBe(true);
    AdminUser.find.mockRestore();
  });
});
