const {
  parseWorkOrders,
  parseSafetyPermits,
  parseIsolationPoints,
  parsePlantEquipment,
  parseLocations,
  parseKeySafes,
  synthesizeJhasFromWorkOrders,
} = require('../utils/qippHtmlParser');
const { inferDepartment } = require('../utils/qippDepartment');
const { buildWorkPacks } = require('../utils/qippWorkPack');

describe('qippHtmlParser', () => {
  test('parseWorkOrders extracts WO fields', () => {
    const html = `<tr><td></td><td><a href="/Q4Safety-QIPP/Entity/WorkOrder?code=000303519529">000303519529</a></td>`
      + `<td>JHAAssigned</td><td><a href="/Entity/Equipment?code=00GRB82AP001KP01">00GRB82AP001KP01</a></td>`
      + `<td>desc</td><td>equip desc</td><td>Wed 18 Mar 2026 00:00</td><td>Wed 18 Mar 2026 00:00</td>`
      + `<td>Low</td><td><a href="/Entity/Person?code=Q4ADAPTOR">Q4ADAPTOR</a></td></tr>`;
    const rows = parseWorkOrders(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('000303519529');
    expect(rows[0].status).toBe('jha_assigned');
    expect(rows[0].equipmentCode).toBe('00GRB82AP001KP01');
    expect(rows[0].reportedBy).toBe('Q4ADAPTOR');
  });

  test('parseSafetyPermits extracts PE fields', () => {
    const html = `<tr><td></td><td><a href="/Entity/SafetyPermitLive?code=PE083128">PE083128</a></td>`
      + `<td>Surrendered</td><td>Permit To Work</td>`
      + `<td><a href="/Entity/Equipment?code=12LAB70AA101">12LAB70AA101</a></td>`
      + `<td>plant</td><td>work</td><td>RO AREA</td><td>Mon 01 Jun 2026 00:00</td>`
      + `<td class="right-aligned">0</td></tr>`;
    const rows = parseSafetyPermits(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('PE083128');
    expect(rows[0].status).toBe('surrendered');
    expect(rows[0].typeLabel).toBe('Permit To Work');
  });

  test('parseIsolationPoints extracts IP fields', () => {
    const html = `<tr><td></td><td><a href="/Entity/IsolationPoint?code=00BFA0901">00BFA0901</a></td>`
      + `<td><a href="/Entity/Equipment?code=00BFA0901">00BFA0901</a></td>`
      + `<td>Off, Lock and Tag</td><td>FDR SECURITY BUILDING</td></tr>`;
    const rows = parseIsolationPoints(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('00BFA0901');
    expect(rows[0].isolationMethodCode).toBe('Off, Lock and Tag');
  });

  test('parsePlantEquipment extracts plant rows', () => {
    const html = `<td><a href="/Entity/Plant?code=60XKA00AA191">60XKA00AA191</a></td>`
      + `<td>EDG LUBE OIL PRESS RLF VLV</td><td>STEAM TURBINE 60 AREA</td><td></td>`
      + `<td><a href="/Entity/Equipment?code=SAB2-ST060-XKA">SAB2-ST060-XKA</a></td>`;
    const rows = parsePlantEquipment(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('60XKA00AA191');
    expect(rows[0].locationName).toBe('STEAM TURBINE 60 AREA');
  });

  test('parseLocations extracts location rows', () => {
    const html = `<td><a href="/Entity/Location?code=ADMIN">ADMIN</a></td>`
      + `<td>ADMIN</td><td>ADMIN</td><td>ADMIN</td>`;
    const rows = parseLocations(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('ADMIN');
  });

  test('parseKeySafes extracts key safe rows', () => {
    const html = `<td><a href="/Entity/KeySafe?code=LOTO%20BOX%2090">LOTO BOX 90</a></td>`
      + `<td>Available</td><td>LOTO BOX 90 </td>`;
    const rows = parseKeySafes(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('LOTO BOX 90');
    expect(rows[0].status).toBe('Available');
  });

  test('synthesizeJhasFromWorkOrders links WO codes', () => {
    const wos = [{
      code: '000303519529',
      status: 'jha_assigned',
      equipmentCode: 'EQ1',
      description: 'Pump overhaul',
      equipmentDescription: 'PUMP',
      department: 'MMD',
    }];
    const jhas = synthesizeJhasFromWorkOrders(wos);
    expect(jhas[0].workOrderCode).toBe('000303519529');
    expect(jhas[0].code).toBe('JHA03519529');
  });

  test('buildWorkPacks links PE to WO by equipment and description', () => {
    const wos = [{
      code: '000100000001',
      equipmentCode: '10BTB01',
      description: 'BATTERY BANK REPLACEMENT',
      plannedStart: 'Wed 07 May 2025 00:00',
    }];
    const permits = [{
      code: 'PE063674',
      equipmentCode: '10BTB01',
      workDescription: 'BATTERY BANK REPLACEMENT WORK',
      validFrom: 'Wed 07 May 2025 00:00',
    }];
    const jhas = synthesizeJhasFromWorkOrders([{
      code: '000100000001',
      status: 'released',
      equipmentCode: '10BTB01',
      description: 'BATTERY BANK REPLACEMENT',
      equipmentDescription: '',
      department: 'EMD',
    }]);
    const packs = buildWorkPacks(wos, permits, jhas);
    expect(packs[0].workOrderCode).toBe('000100000001');
    expect(packs[0].permitCode).toBe('PE063674');
    expect(packs[0].jhaCode).toMatch(/^JHA/);
  });
});

describe('qippLifecycle', () => {
  test('mapWoStatus maps Prometheus codes', () => {
    const { mapWoStatus } = require('../constants/qippLifecycle');
    expect(mapWoStatus('RLQ4')).toBe('released');
    expect(mapWoStatus('CLQ4')).toBe('closed');
  });
});

describe('qippDepartment', () => {
  test('infers EMD for electrical work', () => {
    expect(inferDepartment('MCC PANEL MAINTENANCE', '00BTA01')).toBe('EMD');
  });
  test('infers IMD for instrument tags', () => {
    expect(inferDepartment('TRANSMITTER CALIBRATION', '10FI001')).toBe('IMD');
  });
  test('infers MMD for mechanical pump work', () => {
    expect(inferDepartment('PUMP OVERHAUL', '00GRB82AP001KP01')).toBe('MMD');
  });
});
