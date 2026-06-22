/**
 * Snapshot org-chart-related data before structural changes.
 * Does NOT modify or reset any live data.
 *
 * Usage: node scripts/backup-org-chart-data.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const OrgLayout = require('../models/OrgLayout');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_ROOT = path.join(DATA_DIR, 'backups');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

async function main() {
  const stamp = timestamp();
  const outDir = path.join(BACKUPS_ROOT, stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    purpose: 'Pre org-chart restructure backup (crews A-D, not General)',
    files: [],
    mongo: { connected: false },
  };

  const staticCopies = [
    ['roster.json', path.join(DATA_DIR, 'roster.json')],
    ['qipp-ops-org-chart.json', path.join(DATA_DIR, 'qipp-ops-org-chart.json')],
    ['personnel-emails.json', path.join(DATA_DIR, 'personnel-emails.json')],
  ];

  for (const [name, src] of staticCopies) {
    if (copyIfExists(src, path.join(outDir, name))) {
      manifest.files.push({ name, source: 'static', path: name });
    }
  }

  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      await mongoose.connect(uri, {
        dbName: process.env.MONGODB_DB_NAME || undefined,
        serverSelectionTimeoutMS: 15000,
      });
      manifest.mongo.connected = true;

      const personnel = await AdminUser.find({})
        .select(
          'empId name fullName crew role color email accessRole opsGroupLabel opsTreeParentEmpId opsTreeRelation opsTreeOrder assignedTo'
        )
        .lean();
      fs.writeFileSync(path.join(outDir, 'admin-users-personnel.json'), JSON.stringify(personnel, null, 2));
      manifest.files.push({
        name: 'admin-users-personnel.json',
        source: 'mongodb',
        count: personnel.length,
        fields: [
          'empId',
          'name',
          'crew',
          'role',
          'opsGroupLabel',
          'opsTreeParentEmpId',
          'opsTreeRelation',
          'assignedTo',
        ],
      });

      const orgLayouts = await OrgLayout.find({}).lean();
      fs.writeFileSync(path.join(outDir, 'org-layouts.json'), JSON.stringify(orgLayouts, null, 2));
      manifest.files.push({
        name: 'org-layouts.json',
        source: 'mongodb',
        count: orgLayouts.length,
        crewIds: orgLayouts.map((d) => d.crewId),
      });

      const config = await AdminConfig.findOne()
        .select('availableCrews availableRoles groupPresets')
        .lean();
      if (config) {
        fs.writeFileSync(path.join(outDir, 'admin-config-org.json'), JSON.stringify(config, null, 2));
        manifest.files.push({
          name: 'admin-config-org.json',
          source: 'mongodb',
          fields: ['availableCrews', 'availableRoles', 'groupPresets'],
        });
      }

      await mongoose.disconnect();
    } catch (err) {
      manifest.mongo.error = err.message;
      console.warn('MongoDB backup skipped or partial:', err.message);
      try {
        await mongoose.disconnect();
      } catch {
        /* ignore */
      }
    }
  } else {
    manifest.mongo.note = 'MONGODB_URI not set — static files only';
  }

  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'README.md'),
    `# Org chart backup — ${stamp}

## Contents
${manifest.files.map((f) => `- **${f.name}** (${f.source}${f.count != null ? `, ${f.count} records` : ''})`).join('\n')}

## What was preserved
- Full personnel roster assignments (crew, role, group, assignedTo, ops tree placement)
- Saved manual org layouts per crew
- Admin config: crews, roles, group presets
- Static roster seed and ops org chart import data

## Restore note
This backup is read-only. To restore org layouts, import \`org-layouts.json\` into the OrgLayout collection manually if needed.
`
  );

  console.log(`Backup written to: ${outDir}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
