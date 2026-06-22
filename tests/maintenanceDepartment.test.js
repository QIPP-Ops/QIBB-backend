const {
  normalizeDepartment,
  parseDepartmentFromDesignation,
  resolveMaintenanceDepartment,
} = require('../utils/maintenanceDepartment');

describe('maintenanceDepartment', () => {
  test('normalizeDepartment accepts MMD/EMD/IMD', () => {
    expect(normalizeDepartment('mmd')).toBe('MMD');
    expect(normalizeDepartment('EMD')).toBe('EMD');
    expect(normalizeDepartment('imd')).toBe('IMD');
    expect(normalizeDepartment('workshop')).toBeNull();
  });

  test('parseDepartmentFromDesignation reads designation prefix', () => {
    expect(parseDepartmentFromDesignation('MMD Sup.')).toBe('MMD');
    expect(parseDepartmentFromDesignation('EMD Tech')).toBe('EMD');
    expect(parseDepartmentFromDesignation('IMD Tech')).toBe('IMD');
    expect(parseDepartmentFromDesignation('CCR')).toBeNull();
  });

  test('resolveMaintenanceDepartment prefers profile over PTW', () => {
    const user = { maintenanceDepartment: 'EMD' };
    const ptw = { department: 'MMD', designation: 'MMD Tech' };
    expect(resolveMaintenanceDepartment(user, ptw)).toBe('EMD');
  });

  test('resolveMaintenanceDepartment falls back to PTW department then designation', () => {
    expect(resolveMaintenanceDepartment({}, { department: 'IMD' })).toBe('IMD');
    expect(resolveMaintenanceDepartment({}, { designation: 'MMD Tech' })).toBe('MMD');
    expect(resolveMaintenanceDepartment({}, { designation: 'LO' })).toBeNull();
  });
});
