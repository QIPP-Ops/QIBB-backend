require('dotenv').config();
const mongoose = require('mongoose');
const PlantPerformance = require('./models/PlantPerformance');
const AdminUser = require('./models/AdminUser');
const AdminConfig = require('./models/AdminConfig');
const bcrypt = require('bcryptjs');

const rosterData = require('./data/roster.json');
const plantData = require('./data/plant_data.json');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🌱 Connected to MongoDB for seeding (Unified Model)...');

    // 1. Clear existing data
    await PlantPerformance.deleteMany({});
    await AdminUser.deleteMany({});
    await AdminConfig.deleteMany({});
    console.log('🧹 Cleared existing data');

    // 2. Initialize System Config
    const config = new AdminConfig();
    await config.save();
    console.log('⚙️ System Config Initialized');

    // 3. Seed Personnel (Unified: Roster + Auth)
    const defaultPasswordHash = await bcrypt.hash('acwa_ops_2026', 10);
    const adminPasswordHash = await bcrypt.hash('acwa_admin_2026', 10);

    console.log('👤 Seeding personnel from roster data...');
    const formattedPersonnel = rosterData.map(p => {
      const empId = p.empId ? String(p.empId).trim() : `TEMP-${p.id || Math.floor(Math.random() * 10000)}`;
      // Generate email from name if not present
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
    console.log(`✅ Seeded ${formattedPersonnel.length} personnel accounts`);

    // 4. Create a dedicated System Admin if not in roster
    const adminEmail = 'ops.admin@acwapower.com';
    const existingAdmin = await AdminUser.findOne({ email: adminEmail });
    if (!existingAdmin) {
        const admin = new AdminUser({
           email: adminEmail,
           passwordHash: adminPasswordHash,
           name: 'System Administrator',
           empId: 'ADMIN-001',
           crew: 'S',
           role: 'Management',
           accessRole: 'admin',
           color: 'crew-lightviolet'
        });
        await admin.save();
        console.log('👑 Admin created: ops.admin@acwapower.com / acwa_admin_2026');
    }

    // 5. Seed KPI Data
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
        water: {
          roProduction: d.Water?.ROProduction
        },
        airIntakeDP: d.AirIntakeDP,
        weather: {
          tempMax: d.TempMax,
          tempMin: d.TempMin,
          tempAvg: d.TempAvg,
          maxRH: d.MaxRH,
          minRH: d.MinRH,
          windSpeed: d.WindSpeed
        },
        units: d.Units ? d.Units.map(u => ({
          group: u.Group,
          unit: u.Unit,
          type: u.Type,
          load: u.Load,
          generation: u.Generation,
          mfeqh: u.MFEQH
        })) : []
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
