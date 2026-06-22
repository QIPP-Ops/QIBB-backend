/**
 * Parse SAP Team Absence Calendar HTML → data/qipp-ops-org-chart.json
 *
 * Usage:
 *   node scripts/parse-ops-org-chart-html.js [path/to/export.html]
 */
const fs = require('fs');
const path = require('path');
const { parseOpsOrgChartFile } = require('../utils/parseOpsOrgChartHtml');

const htmlPath = process.argv[2] || undefined;
const outPath = path.join(__dirname, '../data/qipp-ops-org-chart.json');

const data = parseOpsOrgChartFile(htmlPath);
data.source.parsedAt = new Date().toISOString();
data.source.file = path.resolve(htmlPath || require('../utils/parseOpsOrgChartHtml').DEFAULT_HTML);

fs.writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(`Manager: ${data.manager.name} (${data.manager.title})`);
console.log(`Members: ${data.summary.totalMembers}`);
console.log(
  `Matched — roster: ${data.summary.rosterMatched}, email: ${data.summary.emailMatched}, PTW: ${data.summary.ptwMatched}`
);
console.log(`Maintenance dept tags: ${data.summary.withMaintenanceDepartment}`);
