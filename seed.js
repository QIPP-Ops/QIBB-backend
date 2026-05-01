require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');

// Models
const PlantPerformance = require('./models/PlantPerformance');
const EnvironmentalReport = require('./models/EnvironmentalReport');
const SafetyPermit = require('./models/SafetyPermit');
const SafetyJha = require('./models/SafetyJha');
const WorkOrder = require('./models/WorkOrder');
const LotoKeySafe = require('./models/LotoKeySafe');
const IsolationPoint = require('./models/IsolationPoint');
const SafetyStats = require('./models/SafetyStats');
const AdminConfig = require('./models/AdminConfig');
const AdminUser = require('./models/AdminUser');

// Data for real seed
const rosterData = require('./data/roster.json');
const plantData = require('./data/plant_data.json');
const realPtwExpandedData = require('./data/real_ptw_expanded.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function clearDatabase() {
  await PlantPerformance.deleteMany({});
  await EnvironmentalReport.deleteMany({});
  await SafetyPermit.deleteMany({});
  await SafetyJha.deleteMany({});
  await WorkOrder.deleteMany({});
  await LotoKeySafe.deleteMany({});
  await IsolationPoint.deleteMany({});
  await SafetyStats.deleteMany({});
  await AdminConfig.deleteMany({});
  await AdminUser.deleteMany({});
  console.log('🧹 Cleared existing data');
}

async function seedReal() {
  console.log('🌱 Seeding REAL DATA...');
  
  // 1. Initialize System Config
  const config = new AdminConfig();
  await config.save();
  console.log('⚙️ System Config Initialized');

  // 2. Personnel
  const defaultPasswordHash = await bcrypt.hash('acwa_ops_2026', 10);
  const adminPasswordHash = await bcrypt.hash('acwa_admin_2026', 10);

  const formattedPersonnel = rosterData.map(p => {
    const empId = p.empId ? String(p.empId).trim() : `TEMP-${p.id || Math.floor(Math.random() * 10000)}`;
    const email = `${p.name.toLowerCase().replace(/\s+/g, '.')}@acwapower.com`;
    
    return {
      name: p.name,
      email,
      passwordHash: defaultPasswordHash,
      empId,
      crew: p.crew,
      role: p.role,
      color: p.color || 'crew-grey',
      accessRole: 'viewer',
      leaves: p.leaves.map(l => ({
        start: new Date(l.start),
        end: new Date(l.end),
        type: l.type
      }))
    };
  });

  await AdminUser.insertMany(formattedPersonnel);
  
  // Admin
  await new AdminUser({
    email: 'ops.admin@acwapower.com',
    passwordHash: adminPasswordHash,
    name: 'System Administrator',
    empId: 'ADMIN-001',
    crew: 'S',
    role: 'Management',
    accessRole: 'admin',
    color: 'crew-lightviolet'
  }).save();
  console.log('✅ Personnel & Admin Seeded');

  // 3. KPI Data
  const formattedKpis = plantData.map(d => {
    const [day, month, year] = d.Date.split(".");
    return {
      date: new Date(`${year}-${month}-${day}`),
      generation: d.Generation,
      netGen: d.NetGen ?? ((d.Generation != null && d.Aux != null) ? (d.Generation - d.Aux) : null),
      load: d.Load,
      plf: d.PLF || (d.Load ? (d.Load / 3883.2 * 100) : 0),
      efficiency: d.Efficiency,
      heatRate: d.HeatRate,
      fuel: d.Fuel,
      aux: d.Aux,
      mfeqh: d.MFEQH,
      emissions: {
        nox: d.Emissions?.NOx,
        sox: d.Emissions?.SOx,
        co: d.Emissions?.CO,
        particulate: d.Emissions?.Particulate,
        stackTemp: d.Emissions?.StackTemp
      },
      water: { roProduction: d.Water?.ROProduction },
      airIntakeDP: d.AirIntakeDP,
      weather: {
        tempMax: d.TempMax, tempMin: d.TempMin, tempAvg: d.TempAvg,
        maxRH: d.MaxRH, minRH: d.MinRH, windSpeed: d.WindSpeed
      },
      units: d.Units ? d.Units.map(u => ({
        group: u.Group, unit: u.Unit, type: u.Type,
        load: u.Load, generation: u.Generation, mfeqh: u.MFEQH
      })) : []
    };
  });
  await PlantPerformance.insertMany(formattedKpis);
  console.log('✅ KPI Data Seeded');

  // 4. Safety Data (Always Real for Real Seed)
  await seedSafetyReal();
}

async function seedSafetyReal() {
  console.log('🛡️ Seeding REAL Safety data...');
  
  const allRawPermits = [
    ...(realPtwExpandedData.permits || []),
    ...(realPtwExpandedData.supps || [])
  ].filter(p => p['Doc No']);

  const formattedPermits = allRawPermits.map(p => {
    const validFrom = new Date(p['Valid From']);
    const validTo = new Date(validFrom.getTime() + 12 * 3600000); 
    return {
      permitId: p['Doc No'],
      status: p['Status'],
      type: p['Type'],
      equipmentNo: p['Equipment No'],
      plantSummary: p['Plant Summary'],
      description: p['Work Desc'],
      location: p['Location'],
      workers: p['Workers'] || "0",
      issuedBy: 'Legacy System',
      authorizedBy: 'Shift Manager',
      contractor: 'NOMAC',
      validFrom: isNaN(validFrom.getTime()) ? new Date() : validFrom,
      validTo: isNaN(validTo.getTime()) ? new Date() : validTo
    };
  });
  await SafetyPermit.insertMany(formattedPermits);

  const formattedJhas = (realPtwExpandedData.jha || [])
    .filter(j => j['JHA No'])
    .map(j => ({
      jhaNo: j['JHA No'],
      status: j['Status'],
      jhaType: j['JHA Type'],
      location: j['Location'],
      equipmentNo: j['Equipment No'],
      equipmentDesc: j['Equipment Desc'],
      workDesc: j['Work Desc']
    }));
  await SafetyJha.insertMany(formattedJhas);

  const formattedWos = [
    ...(realPtwExpandedData.work_assess || []).map(w => ({ ...w, type: 'assess' })),
    ...(realPtwExpandedData.work_all || []).map(w => ({ ...w, type: 'all' }))
  ].filter(w => w['WO No'])
  .map(w => ({
    woNo: w['WO No'],
    status: w['Status'],
    equipmentNo: w['Equipment No'],
    workDesc: w['Work Desc'],
    equipmentDesc: w['Equipment Desc'],
    planStart: w['Plan Start'] ? new Date(w['Plan Start']) : null,
    planFinish: w['Plan Finish'] ? new Date(w['Plan Finish']) : null,
    priority: w['Priority'],
    type: w.type
  }));
  await WorkOrder.insertMany(formattedWos);

  const keysBySafe = {};
  (realPtwExpandedData.ks_keys || []).filter(k => k['Key Safe No']).forEach(k => {
    const safeNo = k['Key Safe No'];
    if (!keysBySafe[safeNo]) keysBySafe[safeNo] = [];
    keysBySafe[safeNo].push({
      ref: k['Ref'], keyNo: k['Key No'], secondaryKeySafe: k['Secondary Key Safe'],
      permitNo: k['Permit No'], locked: k['Locked'], manualKeyNo: k['Manual Key No']
    });
  });

  const formattedSafes = (realPtwExpandedData.ks_summary || []).filter(s => s['Key Safe No']).map(s => ({
    keySafeNo: s['Key Safe No'],
    status: s['Status'],
    description: s['Key Safe Desc'],
    keys: keysBySafe[s['Key Safe No']] || []
  }));
  await LotoKeySafe.insertMany(formattedSafes);

  const formattedIsos = (realPtwExpandedData.iso || []).filter(i => i['Isolation Point No']).map(i => ({
    isolationPointNo: i['Isolation Point No'],
    equipmentNo: i['Equipment No'],
    method: i['Method'],
    description: i['Isolation Desc']
  }));
  await IsolationPoint.insertMany(formattedIsos);

  const stats = new SafetyStats({
    permitStatus: realPtwExpandedData.chartsData.permit_status,
    permitType: realPtwExpandedData.chartsData.permit_type,
    suppType: realPtwExpandedData.chartsData.supp_type,
    jhaStatus: realPtwExpandedData.chartsData.jha_status,
    workPriority: realPtwExpandedData.chartsData.work_priority,
    ksStatus: realPtwExpandedData.chartsData.ks_status,
    isoMethod: realPtwExpandedData.chartsData.iso_method,
    suppStatus: realPtwExpandedData.chartsData.supp_status
  });
  await stats.save();
  console.log('✅ Safety Data Seeded (Real)');
}

async function seedSafetyFake() {
  console.log('🛡️ Generating FAKE Safety data...');
  
  const statuses = ['Issued', 'Prepared', 'Live', 'Cancelled', 'Closed'];
  const types = ['Hot Work', 'Cold Work', 'Confined Space', 'Radiography', 'Excavation'];
  const locations = ['Boiler Area', 'Turbine Hall', 'Substation', 'Water Treatment', 'Fuel Farm'];
  
  const permits = [];
  for (let i = 1; i <= 50; i++) {
    permits.push({
      permitId: `PERMIT-${1000 + i}`,
      status: randomChoice(statuses),
      type: randomChoice(types),
      equipmentNo: `EQ-${2000 + i}`,
      plantSummary: `Fake Plant Summary ${i}`,
      description: `Description of fake work for permit ${i}`,
      location: randomChoice(locations),
      workers: String(Math.floor(Math.random() * 10) + 1),
      issuedBy: 'System Demo',
      authorizedBy: 'Shift Manager',
      contractor: 'NOMAC',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 12 * 3600000)
    });
  }
  await SafetyPermit.insertMany(permits);

  const jhas = [];
  for (let i = 1; i <= 30; i++) {
    jhas.push({
      jhaNo: `JHA-${3000 + i}`,
      status: 'Approved',
      jhaType: 'Standard',
      location: randomChoice(locations),
      equipmentNo: `EQ-${2000 + i}`,
      equipmentDesc: `Equipment Description ${i}`,
      workDesc: `JHA work description ${i}`
    });
  }
  await SafetyJha.insertMany(jhas);

  const wos = [];
  for (let i = 1; i <= 40; i++) {
    wos.push({
      woNo: `WO-${4000 + i}`,
      status: randomChoice(['INPR', 'COMP', 'SCHD']),
      equipmentNo: `EQ-${2000 + i}`,
      workDesc: `Work order description ${i}`,
      equipmentDesc: `Equipment Description ${i}`,
      planStart: new Date(),
      planFinish: new Date(Date.now() + 24 * 3600000),
      priority: randomChoice(['High', 'Medium', 'Low']),
      type: i % 2 === 0 ? 'assess' : 'all'
    });
  }
  await WorkOrder.insertMany(wos);

  const safes = [];
  for (let i = 1; i <= 10; i++) {
    safes.push({
      keySafeNo: `KS-${5000 + i}`,
      status: randomChoice(['In Use', 'Available']),
      description: `Key safe for unit ${i}`,
      keys: [
        { ref: 'A1', keyNo: `K-${100 + i}`, locked: 'Yes' },
        { ref: 'A2', keyNo: `K-${200 + i}`, locked: 'No' }
      ]
    });
  }
  await LotoKeySafe.insertMany(safes);

  const isos = [];
  for (let i = 1; i <= 20; i++) {
    isos.push({
      isolationPointNo: `ISO-${6000 + i}`,
      equipmentNo: `EQ-${2000 + i}`,
      method: randomChoice(['Electrical', 'Mechanical', 'Valving']),
      description: `Isolation point for equipment ${i}`
    });
  }
  await IsolationPoint.insertMany(isos);

  // Stats
  const stats = new SafetyStats({
    permitStatus: { Issued: 20, Prepared: 10, Live: 15, Cancelled: 5 },
    permitType: { 'Hot Work': 15, 'Cold Work': 25, 'Confined Space': 10 },
    jhaStatus: { Approved: 30 },
    workPriority: { High: 10, Medium: 20, Low: 10 },
    ksStatus: { 'In Use': 7, Available: 3 },
    isoMethod: { Electrical: 8, Mechanical: 7, Valving: 5 }
  });
  await stats.save();
  
  console.log('✅ Safety Data Seeded (Fake)');
}

async function seedDemo(ptwReal) {
  console.log('🌱 Seeding DEMO DATA...');
  
  const config = new AdminConfig();
  await config.save();

  const viewerPasswordHash = await bcrypt.hash('acwa_demo_2026', 10);
  const adminPasswordHash = await bcrypt.hash('acwa_admin_2026', 10);

  // 1. Admin
  await new AdminUser({
    name: 'System Administrator', email: 'ops.admin@acwapower.com', empId: 'ADMIN-001',
    crew: 'S', role: 'Management', color: 'crew-lightviolet', leaves: [],
    passwordHash: adminPasswordHash, accessRole: 'admin'
  }).save();

  // 2. 99 Users
  const firstNames = ['John', 'Jane', 'Mike', 'Harvey', 'Donna', 'Rachel', 'Louis', 'Jessica', 'Robert', 'Katrina'];
  const lastNames = ['Smith', 'Doe', 'Ross', 'Specter', 'Paulsen', 'Zane', 'Litt', 'Pearson', 'Williams', 'Bennett'];
  const crews = ['A', 'B', 'C', 'D', 'General', 'S'];
  const roles = ['Shift in Charge Engineer', 'Supervisor', 'CCR Operator', 'Local Operator', 'Field Operator'];
  const colors = ['crew-lightviolet', 'crew-green', 'crew-red', 'crew-grey', 'crew-lightblue', 'crew-yellow'];

  const userDocs = [];
  for (let i = 1; i <= 99; i++) {
    const fName = firstNames[i % firstNames.length];
    const lName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    userDocs.push({
      name: `${fName} ${lName} ${i}`,
      email: `${fName.toLowerCase()}.${lName.toLowerCase()}.${i}@acwapower.com`,
      empId: `ACWA-${2000 + i}`,
      crew: randomChoice(crews),
      role: randomChoice(roles),
      color: randomChoice(colors),
      passwordHash: viewerPasswordHash,
      accessRole: 'viewer',
      leaves: []
    });
  }
  await AdminUser.insertMany(userDocs);

  // 3. Performance & Env Data (2 Years)
  const kpis = [];
  const envReports = [];
  const startDate = new Date('2024-01-01');
  for (let i = 0; i < 850; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const month = date.getMonth();
    const isSummer = month >= 5 && month <= 8;
    const baseGen = isSummer ? 65000 : 35000;
    const generation = Math.max(10000, baseGen + (Math.random() * 10000 - 5000));
    const aux = generation * (0.04 + Math.random() * 0.02);
    const load = (generation / 70000) * 4000;
    const nox = 15 + (generation / 70000) * 25 + (Math.random() * 5);
    const stackTemp = 120 + (generation / 70000) * 80 + (Math.random() * 10);

    kpis.push({
      date, generation, netGen: generation - aux, load, plf: (load / 4000) * 100,
      efficiency: 45 + Math.random() * 5, heatRate: 8500 + Math.random() * 500,
      fuel: (generation / 10) * (1.1 - Math.random() * 0.2), aux, mfeqh: i * 24,
      emissions: { nox, sox: nox * 0.8, co: 5 + Math.random() * 10, particulate: 2 + Math.random() * 3, stackTemp },
      water: { roProduction: 500 + Math.random() * 200 },
      weather: {
          tempMax: isSummer ? 40 + Math.random() * 10 : 20 + Math.random() * 10,
          tempMin: isSummer ? 30 + Math.random() * 5 : 10 + Math.random() * 5,
          tempAvg: isSummer ? 35 : 15, maxRH: 60, minRH: 20, windSpeed: 10
      },
      units: [
          { group: 'G1', unit: 'GT1', type: 'GT', load: load * 0.4, generation: generation * 0.4 },
          { group: 'G1', unit: 'ST1', type: 'ST', load: load * 0.6, generation: generation * 0.6 }
      ]
    });

    envReports.push({
      date, so2: nox * 0.7, nox, co: 5 + Math.random() * 5, particulate: 2 + Math.random() * 2,
      stackTemp, remarks: 'Daily monitoring completed'
    });
  }
  await PlantPerformance.insertMany(kpis);
  await EnvironmentalReport.insertMany(envReports);
  console.log('✅ Demo Performance & Env Data Seeded');

  // 4. Safety Data
  if (ptwReal) {
    await seedSafetyReal();
  } else {
    await seedSafetyFake();
  }
}

async function main() {
  try {
    const choice = await askQuestion('🚀 Select Seeding Mode:\n(1) Real Data (Roster + Plant Data + Real PTW)\n(2) Demo Data (Generated Users + Performance + Choice of PTW)\nChoice [1/2]: ');
    
    let ptwReal = true;
    if (choice === '2') {
      const ptwChoice = await askQuestion('🛡️ Select PTW Data for Demo:\n(1) Real PTW (from expanded JSON)\n(2) Fake PTW (Generated random records)\nChoice [1/2]: ');
      ptwReal = ptwChoice === '1';
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔌 Connected to MongoDB');

    await clearDatabase();

    if (choice === '1') {
      await seedReal();
      console.log('\n🔐 Sample Credentials:');
      console.log('--- ADMIN ---');
      console.log('Email: ops.admin@acwapower.com');
      console.log('Pass:  acwa_admin_2026');
      console.log('--- VIEWER (Real) ---');
      console.log(`Email: ${rosterData[0].name.toLowerCase().replace(/\s+/g, '.')}@acwapower.com`);
      console.log('Pass:  acwa_ops_2026');
    } else {
      await seedDemo(ptwReal);
      console.log('\n🔐 Sample Credentials:');
      console.log('--- ADMIN ---');
      console.log('Email: ops.admin@acwapower.com');
      console.log('Pass:  acwa_admin_2026');
      console.log('--- VIEWER (Demo) ---');
      console.log('Email: john.smith.1@acwapower.com (example)');
      console.log('Pass:  acwa_demo_2026');
    }

    console.log('\n🚀 Seeding completed successfully!');
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

main();
