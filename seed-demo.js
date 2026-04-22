require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const PlantPerformance = require('./models/PlantPerformance');
const EnvironmentalReport = require('./models/EnvironmentalReport');
const SafetyPermit = require('./models/SafetyPermit');
const AdminConfig = require('./models/AdminConfig');
const AdminUser = require('./models/AdminUser');

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedDemo() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🌱 Connected to MongoDB for REALISTIC DEMO seeding...');

    await PlantPerformance.deleteMany({});
    await EnvironmentalReport.deleteMany({});
    await SafetyPermit.deleteMany({});
    await AdminConfig.deleteMany({});
    await AdminUser.deleteMany({});

    const config = new AdminConfig();
    await config.save();

    const viewerPasswordHash = await bcrypt.hash('acwa_demo_2026', 10);
    const adminPasswordHash = await bcrypt.hash('acwa_admin_2026', 10);

    // 1. Admin
    await new AdminUser({
      name: 'System Administrator',
      email: 'ops.admin@acwapower.com',
      empId: 'ADMIN-001',
      crew: 'S',
      role: 'Management',
      color: 'crew-lightviolet',
      leaves: [],
      passwordHash: adminPasswordHash,
      accessRole: 'admin'
    }).save();

    // 2. 99 Unified Users
    const firstNames = ['John', 'Jane', 'Mike', 'Harvey', 'Donna', 'Rachel', 'Louis', 'Jessica', 'Robert', 'Katrina', 'Alex', 'Samantha', 'Greer', 'Sheila', 'Harold', 'Benjamin', 'Sean', 'Travis', 'Logan', 'Dana'];
    const lastNames = ['Smith', 'Doe', 'Ross', 'Specter', 'Paulsen', 'Zane', 'Litt', 'Pearson', 'Williams', 'Bennett', 'Williams', 'Wheeler', 'Childs', 'Sazs', 'Gunderson', 'Cooledge', 'Cahill', 'Tanner', 'Sanders', 'Scott'];
    const crews = ['A', 'B', 'C', 'D', 'General', 'S'];
    const roles = ['Shift in Charge Engineer', 'Supervisor', 'CCR Operator', 'Local Operator', 'Field Operator', 'Operations Support'];
    const colors = ['crew-lightviolet', 'crew-green', 'crew-red', 'crew-grey', 'crew-lightblue', 'crew-yellow', 'crew-lightorange'];

    const userDocs = [];
    for (let i = 1; i <= 99; i++) {
      const fName = firstNames[i % firstNames.length];
      const lName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
      const name = `${fName} ${lName} ${i}`;
      const email = `${fName.toLowerCase()}.${lName.toLowerCase()}.${i}@acwapower.com`;
      const empId = `ACWA-${2000 + i}`;
      
      userDocs.push({
        name, email, empId,
        crew: randomChoice(crews),
        role: randomChoice(roles),
        color: randomChoice(colors),
        passwordHash: viewerPasswordHash,
        accessRole: 'viewer',
        leaves: []
      });
    }
    await AdminUser.insertMany(userDocs);
    console.log('✅ Users Seeded');

    // 3. Realistic KPI Data (2 Years)
    const kpis = [];
    const envReports = [];
    const startDate = new Date('2024-01-01');
    const totalDays = 850; // Roughly 2.3 years

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const month = date.getMonth(); // 0-11
      const isSummer = month >= 5 && month <= 8; // June - Sept
      
      // Generation Logic: Higher in summer, lower in winter
      const baseGen = isSummer ? 65000 : 35000;
      const variation = Math.random() * 10000 - 5000;
      const generation = Math.max(10000, baseGen + variation);
      const aux = generation * (0.04 + Math.random() * 0.02); // 4-6% aux consumption
      const netGen = generation - aux;
      
      const load = (generation / 70000) * 4000; // Proxy load
      const fuel = (generation / 10) * (1.1 - Math.random() * 0.2); // Efficiency correlation
      
      // Emissions correlate with load/gen
      const nox = 15 + (generation / 70000) * 25 + (Math.random() * 5);
      const stackTemp = 120 + (generation / 70000) * 80 + (Math.random() * 10);

      kpis.push({
        date,
        generation,
        netGen,
        load,
        plf: (load / 4000) * 100,
        efficiency: 45 + Math.random() * 5,
        heatRate: 8500 + Math.random() * 500,
        fuel,
        aux,
        mfeqh: i * 24,
        emissions: { nox, sox: nox * 0.8, co: 5 + Math.random() * 10, particulate: 2 + Math.random() * 3, stackTemp },
        water: { roProduction: 500 + Math.random() * 200 },
        weather: {
            tempMax: isSummer ? 40 + Math.random() * 10 : 20 + Math.random() * 10,
            tempMin: isSummer ? 30 + Math.random() * 5 : 10 + Math.random() * 5,
            tempAvg: isSummer ? 35 : 15,
            maxRH: 60, minRH: 20, windSpeed: 10
        },
        units: [
            { group: 'G1', unit: 'GT1', type: 'GT', load: load * 0.4, generation: generation * 0.4 },
            { group: 'G1', unit: 'ST1', type: 'ST', load: load * 0.6, generation: generation * 0.6 }
        ]
      });

      envReports.push({
        date,
        so2: nox * 0.7,
        nox,
        co: 5 + Math.random() * 5,
        particulate: 2 + Math.random() * 2,
        stackTemp,
        remarks: 'Daily monitoring completed'
      });
    }

    await PlantPerformance.insertMany(kpis);
    await EnvironmentalReport.insertMany(envReports);
    console.log('✅ Performance & Env Data Seeded');

    console.log('🚀 UNIFIED REALISTIC DEMO SEEDING COMPLETE!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDemo();
