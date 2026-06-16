/**
 * Copy MongoDB collections from Azure Cosmos DB (Mongo API) → MongoDB Atlas.
 *
 * Usage (Render Shell or local):
 *   SOURCE_MONGODB_URI='mongodb+srv://...@old-cosmos.../QIPP?...' \
 *   TARGET_MONGODB_URI='mongodb+srv://...@atlas.../QIPP?...' \
 *   node scripts/migrate-azure-mongo-to-atlas.js
 *
 * Aliases: AZURE_MONGODB_URI / COSMOS_URI for source, MONGODB_URI for target.
 *
 * Flags:
 *   --dry-run              list collections + counts only
 *   --drop-target          drop each target collection before insert
 *   --collections=a,b,c    comma-separated subset (default: all on source)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, normalizeDbName } = require('../config/database');

function parseArgs(argv) {
  const flags = { dryRun: false, dropTarget: false, collections: null };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--drop-target') flags.dropTarget = true;
    else if (arg.startsWith('--collections=')) {
      flags.collections = arg
        .slice('--collections='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return flags;
}

function getUri(kind) {
  let raw = '';
  let dbName = normalizeDbName(process.env.MONGODB_DB_NAME || 'QIPP');

  if (kind === 'source') {
    raw = (
      process.env.SOURCE_MONGODB_URI ||
      process.env.AZURE_MONGODB_URI ||
      process.env.AZURE_COSMOS_URI ||
      process.env.COSMOS_URI ||
      ''
    ).trim();
    dbName = normalizeDbName(
      process.env.SOURCE_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || 'QIPP'
    );
  } else {
    raw = (
      process.env.TARGET_MONGODB_URI ||
      process.env.MONGODB_URI ||
      ''
    ).trim();
    dbName = normalizeDbName(
      process.env.TARGET_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || 'QIPP'
    );
  }

  return resolveMongoUri(raw, dbName);
}

async function connect(uri, label) {
  if (!uri) throw new Error(`Missing ${label} URI`);
  const conn = await mongoose.createConnection(uri, {
    retryWrites: false,
    serverSelectionTimeoutMS: 45000,
  }).asPromise();
  return conn;
}

const KEY_COLLECTIONS = ['adminusers', 'adminconfigs', 'ptws', 'quizzes', 'quizassignments'];
const MIN_SOURCE_ADMINUSERS = 10;
const MIN_TARGET_ADMINUSERS = 10;

async function countAdminUsers(db) {
  try {
    return await db.collection('adminusers').countDocuments();
  } catch {
    return 0;
  }
}

function failRosterCheck(label, count, min) {
  const msg =
    `${label} adminusers=${count} (need >= ${min}). ` +
    'Wrong URI/database, Azure Cosmos empty or subscription disabled, or migration copied nothing. ' +
    'Run GitHub Action "Seed MongoDB Atlas" instead (see docs/MIGRATE_AZURE_MONGO_TO_ATLAS.md Option E).';
  console.error(`::error::${msg}`);
  process.exit(1);
}

async function validateSourceRoster(sourceDb) {
  const adminCount = await countAdminUsers(sourceDb);
  console.log(`\nSource adminusers: ${adminCount}`);
  if (adminCount < MIN_SOURCE_ADMINUSERS) {
    failRosterCheck('Source', adminCount, MIN_SOURCE_ADMINUSERS);
  }
  return adminCount;
}

async function validateTargetRoster(targetDb, label = 'Target') {
  const adminCount = await countAdminUsers(targetDb);
  console.log(`${label} adminusers: ${adminCount}`);
  if (adminCount < MIN_TARGET_ADMINUSERS) {
    failRosterCheck(label, adminCount, MIN_TARGET_ADMINUSERS);
  }
  return adminCount;
}

async function copyCollection(sourceDb, targetDb, name, opts) {
  const src = sourceDb.collection(name);
  const count = await src.countDocuments();
  if (opts.dryRun) {
    console.log(`  ${name}: ${count} documents`);
    return { name, copied: 0, skipped: count };
  }
  if (count === 0) {
    console.log(`  ${name}: empty — skipped`);
    return { name, copied: 0, skipped: 0 };
  }

  const tgt = targetDb.collection(name);
  if (opts.dropTarget) {
    await tgt.drop().catch(() => {});
  }

  const cursor = src.find({});
  const batchSize = 500;
  let batch = [];
  let copied = 0;

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= batchSize) {
      await tgt.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await tgt.insertMany(batch, { ordered: false });
    copied += batch.length;
  }

  console.log(`  ${name}: copied ${copied}`);
  return { name, copied, skipped: 0 };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sourceUri = getUri('source');
  const targetUri = getUri('target');

  const rawTarget = (
    process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || ''
  ).trim();
  const targetDbName = normalizeDbName(
    process.env.TARGET_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || 'QIPP'
  );
  if (rawTarget && targetUri !== rawTarget) {
    console.log(`ℹ️  Target URI normalized to database "${targetDbName}" (Render uses the same via MONGODB_DB_NAME)`);
  }

  const rawSource = (
    process.env.SOURCE_MONGODB_URI ||
    process.env.AZURE_MONGODB_URI ||
    process.env.COSMOS_URI ||
    ''
  ).trim();
  const sourceDbName = normalizeDbName(
    process.env.SOURCE_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || 'QIPP'
  );
  if (rawSource && sourceUri !== rawSource) {
    console.log(`ℹ️  Source URI normalized to database "${sourceDbName}"`);
  }

  if (!sourceUri) {
    console.error('Set SOURCE_MONGODB_URI (or AZURE_MONGODB_URI / COSMOS_URI) to the old Azure Cosmos connection string.');
    process.exit(1);
  }
  if (!targetUri) {
    console.error('Set TARGET_MONGODB_URI (or MONGODB_URI) to the Atlas connection string.');
    process.exit(1);
  }
  if (sourceUri === targetUri) {
    console.error('Source and target URIs must differ.');
    process.exit(1);
  }

  console.log(opts.dryRun ? '🔍 Dry run — no writes' : '📦 Copying Azure Mongo → Atlas');
  const sourceConn = await connect(sourceUri, 'source');
  const targetConn = await connect(targetUri, 'target');

  try {
    const sourceDb = sourceConn.db;
    const targetDb = targetConn.db;
    const collections = (
      opts.collections ||
      (await sourceDb.listCollections().toArray()).map((c) => c.name)
    ).filter((n) => !n.startsWith('system.'));

    console.log(`Source DB: ${sourceDb.databaseName}`);
    console.log(`Target DB: ${targetDb.databaseName}`);
    console.log(`Collections on source: ${collections.length}`);

    await validateSourceRoster(sourceDb);

    if (opts.dryRun) {
      console.log('\n--- Source collection counts ---');
      for (const name of collections) {
        await copyCollection(sourceDb, targetDb, name, opts);
      }
      console.log('\n--- Target key collection counts ---');
      for (const name of KEY_COLLECTIONS) {
        try {
          const n = await targetDb.collection(name).countDocuments();
          console.log(`  ${name}: ${n}`);
        } catch {
          console.log(`  ${name}: (missing)`);
        }
      }
      console.log('\n✅ Dry run complete');
      return;
    }

    const results = [];
    for (const name of collections) {
      results.push(await copyCollection(sourceDb, targetDb, name, opts));
    }

    console.log('\n--- Target after migration ---');
    for (const name of KEY_COLLECTIONS) {
      try {
        const n = await targetDb.collection(name).countDocuments();
        console.log(`  ${name}: ${n}`);
      } catch {
        console.log(`  ${name}: (missing)`);
      }
    }

    const copied = results.reduce((n, r) => n + (r.copied || 0), 0);
    console.log(`\n✅ Migration complete — ${copied} documents copied`);
    await validateTargetRoster(targetDb, 'Target after migration');
  } finally {
    await sourceConn.close();
    await targetConn.close();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
