require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const PlantPerformance = require('./models/PlantPerformance');

const AdminUser = require('./models/AdminUser');
const bcrypt = require('bcryptjs');

const rosterData = require('./data/roster.json');
const plantData = require('./data/plant_data.json');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🌱 Connected to MongoDB for seeding...');

    // 1. Clear existing data
    await Employee.deleteMany({});
    await PlantPerformance.deleteMany({});
    await AdminUser.deleteMany({});
    console.log('🧹 Cleared existing data');

    // 2. Seed Admin User
    const passwordHash = await bcrypt.hash('acwa123', 10);
    const admin = new AdminUser({
       email: 'admin@acwa.com',
       passwordHash
    });
    await admin.save();
    console.log('👑 Default Admin created: admin@acwa.com / acwa123');

    // 3. Seed Roster
    const formattedRoster = rosterData.map(p => ({
      name: p.name,
      empId: p.empId,
      crew: p.crew,
      role: p.role,
      color: p.color,
      leaves: p.leaves.map(l => ({
        start: new Date(l.start),
        end: new Date(l.end),
        type: l.type
      }))
    }));
    await Employee.insertMany(formattedRoster);
    console.log(`✅ Seeded ${formattedRoster.length} employees`);

    // 3. Seed KPI Data
    const formattedKpis = plantData.map(d => {
      const [day, month, year] = d.Date.split(".");
      return {
        date: new Date(`${year}-${month}-${day}`),
        generation: d.Generation,
        netGen: d.NetGen,
        load: d.Load,
        plf: d.PLF || (d.Load ? (d.Load / 3883.2 * 100) : 0),
        efficiency: d.Efficiency,
        heatRate: d.HeatRate,
        fuel: d.Fuel,
        emissions: {
          nox: d.Emissions.NOx,
          sox: d.Emissions.SOx,
          co: d.Emissions.CO,
          particulate: d.Emissions.Particulate,
          stackTemp: d.Emissions.StackTemp
        },
        water: {
          roProduction: d.Water.ROProduction
        },
        airIntakeDP: d.AirIntakeDP
      };
    });
    await PlantPerformance.insertMany(formattedKpis);
    console.log(`✅ Seeded ${formattedKpis.length} KPI records`);

    console.log('🚀 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
