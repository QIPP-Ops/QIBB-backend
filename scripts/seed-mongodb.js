/**
 * Idempotent MongoDB Atlas seed for Render / fresh deployments.
 *
 *   MONGODB_URI='mongodb+srv://...' SMTP_USER=... SMTP_PASS=... npm run seed:mongodb
 *
 * Super admin uses SMTP mailbox by default (SMTP_USER + SMTP_PASS).
 * Optional overrides: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 *
 * Optional:
 *   SEED_DEFAULT_USER_PASSWORD  — shared temp password for roster logins (omit = roster rows still created, logins disabled)
 *   SEED_KPI_DATA=1             — insert plant KPI rows when collection is empty
 *   SEED_FORCE_RESET=1          — wipe AdminUser, AdminConfig, PlantPerformance first (destructive)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { getMongoUri, getDatabaseNameFromUri } = require('../config/database');
const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const PlantPerformance = require('../models/PlantPerformance');
const { ensurePtwPersonnelSeeded } = require('../services/ptwAutoSeed');
const { mergeEmailPresets } = require('../services/emailPresetsService');
const {
  buildPersonnelEmailIndex,
  resolvePersonEmail,
  buildRosterUserFields,
  resolveSuperAdminCredentials,
  bundledEmailPresets,
} = require('./lib/atlasSeedHelpers');

const rosterData = require('../data/roster.json');
const personnelEmails = require('../data/personnel-emails.json');
const plantData = require('../data/plant_data.json');

function log(msg) {
  console.log(msg);
}

function formatPlantPerformanceRows(rows) {
  return rows.map((d) => {
    const [day, month, year] = d.Date.split('.');
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
        stackTemp: d.Emissions?.StackTemp,
      },
      water: { roProduction: d.Water?.ROProduction },
      airIntakeDP: d.AirIntakeDP,
      weather: {
        tempMax: d.TempMax,
        tempMin: d.TempMin,
        tempAvg: d.TempAvg,
        maxRH: d.MaxRH,
        minRH: d.MinRH,
        windSpeed: d.WindSpeed,
      },
      units: (d.Units || []).map((u) => ({
        group: u.Group,
        unit: u.Unit,
        type: u.Type,
        load: u.Load,
        generation: u.Generation,
        mfeqh: u.MFEQH,
      })),
    };
  });
}

async function ensureAdminConfig() {
  let config = await AdminConfig.findOne();
  if (!config) config = new AdminConfig();

  const presets = bundledEmailPresets();
  config.emailPresets = mergeEmailPresets(config.emailPresets || []);
  if (!config.emailPresets.length) {
    config.emailPresets = presets;
  }

  await config.save();
  return config;
}

async function seedRosterUsers(defaultPassword) {
  const passwordSource = defaultPassword ? 'SEED_DEFAULT_USER_PASSWORD' : 'random (login disabled until reset)';
  const passwordHash = defaultPassword
    ? await bcrypt.hash(defaultPassword, 10)
    : await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);

  if (!defaultPassword) {
    log(
      'ℹ️  Roster accounts created without SEED_DEFAULT_USER_PASSWORD — use Admin → reset password or set env and re-seed'
    );
  } else {
    log(`👥 Roster login password from ${passwordSource}`);
  }

  const emailIndex = buildPersonnelEmailIndex(personnelEmails);
  let created = 0;
  let updated = 0;
  let placeholderEmails = 0;

  for (const person of rosterData) {
    const email = resolvePersonEmail(person, emailIndex);
    if (/@roster\.acwaops\.local$/i.test(email)) {
      placeholderEmails += 1;
    }

    const fields = buildRosterUserFields(person, email, passwordHash);
    const existing = await AdminUser.findOne({
      $or: [{ empId: fields.empId }, { email: fields.email }],
    });

    if (existing) {
      existing.name = fields.name;
      existing.fullName = fields.fullName;
      existing.crew = fields.crew;
      existing.role = fields.role;
      existing.color = fields.color;
      existing.leaves = fields.leaves;
      if (!existing.isApproved) existing.isApproved = true;
      if (!existing.isEmailVerified) existing.isEmailVerified = true;
      await existing.save();
      updated += 1;
    } else {
      await AdminUser.create(fields);
      created += 1;
    }
  }

  return { created, updated, placeholderEmails, total: rosterData.length };
}

async function seedSuperAdmin() {
  const { email, password, emailSource, passwordSource } = resolveSuperAdminCredentials();

  if (!password) {
    log('⏭️  Skipped super admin — set SMTP_PASS (or SUPER_ADMIN_PASSWORD override)');
    return { action: 'skipped' };
  }

  if (!email) {
    log('⏭️  Skipped super admin — set SMTP_USER or SUPER_ADMIN_EMAIL');
    return { action: 'skipped' };
  }

  log(`👑 Super admin email from ${emailSource}, password from ${passwordSource}`);

  const passwordHash = await bcrypt.hash(password, 10);
  let user = await AdminUser.findOne({ email });
  if (user) {
    user.passwordHash = passwordHash;
    user.accessRole = 'admin';
    user.canOpsLead = true;
    user.isApproved = true;
    user.isEmailVerified = true;
    user.kpiEditingAllowed = true;
    user.isActive = true;
    user.name = user.name || 'System Super Admin';
    user.empId = user.empId || 'SUPER-ADMIN';
    user.crew = user.crew || 'S';
    user.role = user.role || 'Management';
    user.color = user.color || 'crew-lightviolet';
    await user.save();
    log(`👑 Updated super admin: ${email} (sources: ${emailSource}/${passwordSource})`);
    return { action: 'updated', email, emailSource, passwordSource };
  }

  await AdminUser.create({
    email,
    passwordHash,
    name: 'System Super Admin',
    empId: 'SUPER-ADMIN',
    crew: 'S',
    role: 'Management',
    color: 'crew-lightviolet',
    accessRole: 'admin',
    canOpsLead: true,
    kpiEditingAllowed: true,
    isApproved: true,
    isEmailVerified: true,
    isActive: true,
  });
  log(`👑 Created super admin: ${email} (sources: ${emailSource}/${passwordSource})`);
  return { action: 'created', email, emailSource, passwordSource };
}

async function seedKpiIfEmpty() {
  if (process.env.SEED_KPI_DATA !== '1') {
    log('⏭️  KPI seed skipped (set SEED_KPI_DATA=1 to load plant_data.json when empty)');
    return { inserted: 0 };
  }

  const count = await PlantPerformance.countDocuments();
  if (count > 0) {
    log(`⏭️  PlantPerformance already has ${count} rows`);
    return { inserted: 0 };
  }

  const rows = formatPlantPerformanceRows(plantData);
  await PlantPerformance.insertMany(rows);
  log(`📊 Inserted ${rows.length} PlantPerformance KPI rows`);
  return { inserted: rows.length };
}

async function assertRosterSeeded() {
  const { filterProtectedAccounts } = require('../utils/protectedAccounts');
  const users = await AdminUser.find().select('email').lean();
  const rosterVisible = filterProtectedAccounts(users).length;
  const dbName = mongoose.connection.db?.databaseName || getDatabaseNameFromUri(getMongoUri());
  if (rosterVisible < 10) {
    throw new Error(
      `Roster seed produced rosterVisible=${rosterVisible} in database "${dbName}". ` +
      'Check MONGODB_URI and MONGODB_DB_NAME match Render (should be QIPP).'
    );
  }
  return { rosterVisible, dbName, adminUsersTotal: users.length };
}

async function runAtlasSeed(options = {}) {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error('Set MONGODB_URI or COSMOS_URI');
  }

  const dbName = getDatabaseNameFromUri(uri);
  await mongoose.connect(uri, { retryWrites: false });
  log(`🌱 Connected to MongoDB database "${mongoose.connection.db?.databaseName || dbName}"`);

  if (process.env.SEED_FORCE_RESET === '1' || options.forceReset) {
    log('⚠️  SEED_FORCE_RESET — clearing AdminUser, AdminConfig, PlantPerformance');
    await Promise.all([
      AdminUser.deleteMany({}),
      AdminConfig.deleteMany({}),
      PlantPerformance.deleteMany({}),
    ]);
  }

  await ensureAdminConfig();
  log('⚙️  AdminConfig ready (email presets merged)');

  const roster = await seedRosterUsers(
    process.env.SEED_DEFAULT_USER_PASSWORD || options.defaultUserPassword || ''
  );
  log(
    `👥 Roster: ${roster.created} created, ${roster.updated} updated, ` +
    `${roster.placeholderEmails} placeholder emails, ${roster.total} total in roster.json`
  );

  const superAdmin = await seedSuperAdmin();
  const ptw = await ensurePtwPersonnelSeeded();
  if (ptw.seeded) {
    log(`🔐 PTW personnel seeded (${ptw.count} entries)`);
  } else {
    log(`🔐 PTW personnel already populated (${ptw.count} entries)`);
  }

  const kpi = await seedKpiIfEmpty();

  const rosterCheck = await assertRosterSeeded();
  log(`✅ rosterVisible=${rosterCheck.rosterVisible} in "${rosterCheck.dbName}"`);

  if (!options.skipDisconnect) {
    await mongoose.disconnect();
  }
  return { roster, superAdmin, ptw, kpi, rosterCheck };
}

async function main() {
  try {
    await runAtlasSeed();
    log('✅ MongoDB seed completed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runAtlasSeed, formatPlantPerformanceRows };
