const {
  parseWorkOrders,
  parseTaskPlannerWorkOrders,
  parseSafetyPermits,
  parseIsolationPoints,
  parsePlantEquipment,
  parseLocations,
  parseKeySafes,
  parseJhaTaskPlannerRow,
  parseJhasFromTaskPlanner,
  synthesizeJhasFromWorkOrders,
  parseJhasFromTaskPlanner,
  parseJhaTaskPlannerRow,
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

  test('parseTaskPlannerWorkOrders parses concatenated List All Work rows', () => {
    const paste = 'Reported By ID[ ] 000302247845JHAAssigned30GHC01AP001KP01RM OF ST30 CCW PUMP2GRP-30 CONDENSATE TRANSFER PUMP 1'
      + 'Thu 05 Feb 2026 00:00Fri 06 Feb 2026 00:00LowQ4ADAPTOR'
      + '[ ] 000303318039RLQ430GHC01AP001KP01RM STG 20 WATER BOX VACCUM PUMP 2GRP-30 CONDENSATE TRANSFER PUMP 1'
      + 'Thu 05 Feb 2026 00:00Fri 06 Feb 2026 00:00LowQ4ADAPTOR'
      + '[ ] 000302834611RLQ400QKC51-AH004RM CH-51 PROCESS UNIT HVAC-4CH-51 PROCESS UNIT HVAC-4'
      + 'Tue 20 Jan 2026 00:00Wed 21 Jan 2026 00:00LowQ4ADAPTOR';
    const rows = parseTaskPlannerWorkOrders(paste);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      code: '000302247845',
      prometheusStatusCode: 'JHAAssigned',
      status: 'jha_assigned',
      equipmentCode: '30GHC01AP001KP01',
      reportedBy: 'Q4ADAPTOR',
    });
    expect(rows[1]).toMatchObject({
      code: '000303318039',
      prometheusStatusCode: 'RLQ4',
      status: 'released',
      equipmentCode: '30GHC01AP001KP01',
    });
    expect(rows[2]).toMatchObject({
      code: '000302834611',
      prometheusStatusCode: 'RLQ4',
      equipmentCode: '00QKC51-AH004',
    });
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

  test('parseJhaTaskPlannerRow parses concatenated Task Planner row', () => {
    const row = 'RA045153ApprovedJob Hazard AnalysisCHILLER AREA00QKC54AT007CH-54 SOLIDS SEPARATORChiller-54 SOLIDS SEPARATOR FILTRATION TANK inspection';
    const parsed = parseJhaTaskPlannerRow(row);
    expect(parsed).not.toBeNull();
    expect(parsed.code).toBe('RA045153');
    expect(parsed.status).toBe('approved');
    expect(parsed.prometheusStatusCode).toBe('Approved');
    expect(parsed.locationName).toBe('CHILLER AREA');
    expect(parsed.equipmentCode).toBe('00QKC54AT007');
  });

  test('parseJhasFromTaskPlanner parses RA and Not Required statuses', () => {
    const sample = [
      '[ ] Not RequiredJob Hazard AnalysisST60QIPP60MAJ51AP011KP01WATER BOX VACCUM PUMP-2RM STG 60 WATER BOX VACCUM PUMP 2',
      '[ ] RA024555RaisedJob Hazard AnalysisGAS TURBINE 52 AREA52MBL10AA255GT-52 scaffolding platform',
      '[ ] RA007924ClosedJob Hazard AnalysisNOMAC QIPP PlantQIPP-12M-KAGENERATOR UNITOT20 GT-12 GENERATOR ACTIVITIES',
    ].join('');
    const rows = parseJhasFromTaskPlanner(sample);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.code === 'RA024555')?.status).toBe('raised');
    expect(rows.find((r) => r.code === 'RA007924')?.status).toBe('closed');
    expect(rows.some((r) => r.status === 'not_required')).toBe(true);
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
    expect(mapWoStatus('RLQ')).toBe('released');
    expect(mapWoStatus('CLQ')).toBe('closed');
    expect(mapWoStatus('APQ')).toBe('jha_approved');
  });

  test('mapJhaStatus maps Prometheus JHA codes', () => {
    const { mapJhaStatus } = require('../constants/qippLifecycle');
    expect(mapJhaStatus('Closed')).toBe('closed');
    expect(mapJhaStatus('Not Required')).toBe('not_required');
    expect(mapJhaStatus('Approved')).toBe('approved');
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
