/**
 * Idempotent ops org chart seed: backup → parse HTML → merge into AdminUser.
 *
 * Usage:
 *   npm run seed:ops-org-html
 *   npm run seed:ops-org-html -- [path/to/export.html] [--dry-run]
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const htmlPath = args.find((a) => !a.startsWith('--')) || undefined;

const root = path.join(__dirname, '..');

function runNode(script, scriptArgs = []) {
  const res = spawnSync(process.execPath, [path.join(root, script), ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

async function main() {
  console.log('\n=== Step 1/3: Backup org-chart data ===');
  runNode('scripts/backup-org-chart-data.js');

  console.log('\n=== Step 2/3: Parse ops org chart HTML ===');
  const parseArgs = htmlPath ? [htmlPath] : [];
  runNode('scripts/parse-ops-org-chart-html.js', parseArgs);

  console.log('\n=== Step 3/3: Import into MongoDB (merge/update) ===');
  const importArgs = dryRun ? ['--dry-run'] : [];
  runNode('scripts/import-ops-org-chart.js', importArgs);

  console.log('\nDone. No collections were wiped — existing users not in the HTML file were preserved.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
