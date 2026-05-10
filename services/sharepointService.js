const axios   = require('axios');
const ExcelJS = require('exceljs');
const {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
} = require('./reportParser');

// ─── Azure AD Token ───────────────────────────────────────────────────────────

async function getAccessToken() {
  const tenantId     = process.env.AZURE_TENANT_ID;
  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return res.data.access_token;
}

// ─── List Files in a SharePoint Folder ───────────────────────────────────────

async function listSharePointFiles(token, siteId, folderPath) {
  const encodedPath = encodeURIComponent(folderPath);
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/children`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data.value || [];
}

// ─── Download a File by Drive Item ID ────────────────────────────────────────

async function downloadFile(token, siteId, itemId) {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content`;

  const res = await axios.get(url, {
    headers:      { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
  });

  return Buffer.from(res.data);
}

// ─── Get Most Recent File Matching a Pattern ──────────────────────────────────

function getMostRecentFile(files, pattern) {
  const matched = files
    .filter(f => f.name && f.name.toLowerCase().includes(pattern.toLowerCase()))
    .sort((a, b) => new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime));
  return matched[0] || null;
}

// ─── Main Sync Function ───────────────────────────────────────────────────────
// Call this daily via cron. Fetches latest files from both SharePoint sites,
// parses them, and returns structured trend data ready to save to MongoDB.

async function syncAllReports() {
  const token = await getAccessToken();

  const SITE_1 = process.env.SHAREPOINT_SITE_ID_1; // HRSG / RO reports
  const SITE_2 = process.env.SHAREPOINT_SITE_ID_2; // Water / Energy reports

  const FOLDER_1 = process.env.SHAREPOINT_FOLDER_1 || 'Shared Documents/HRSG Reports';
  const FOLDER_2 = process.env.SHAREPOINT_FOLDER_2 || 'Shared Documents/Operations Reports';

  const [files1, files2] = await Promise.all([
    listSharePointFiles(token, SITE_1, FOLDER_1),
    listSharePointFiles(token, SITE_2, FOLDER_2),
  ]);

  const results = {};

  // ── HRSG + RO ──
  const hrsgFile = getMostRecentFile(files1, 'RO-HRSG');
  if (hrsgFile) {
    const buf = await downloadFile(token, SITE_1, hrsgFile.id);
    results.chemistry = await parseROHRSGReport(buf);
  }

  // ── Water Consumption ──
  const waterFile = getMostRecentFile(files2, 'water_consumption') ||
                    getMostRecentFile(files2, 'water');
  if (waterFile) {
    const buf = await downloadFile(token, SITE_2, waterFile.id);
    results.water = await parseWaterConsumption(buf);
  }

  // ── Energy Report ──
  const energyFile = getMostRecentFile(files2, 'ENERGY-PRODUCED') ||
                     getMostRecentFile(files2, 'energy');
  if (energyFile) {
    const buf = await downloadFile(token, SITE_2, energyFile.id);
    results.energy = await parseEnergyReport(buf);
  }

  // ── Daily Operation Report ──
  const dailyFile = getMostRecentFile(files2, 'Daily-Operation-Report');
  if (dailyFile) {
    const buf = await downloadFile(token, SITE_2, dailyFile.id);
    results.dailyOps = await parseDailyOperationReport(buf);
  }

  // ── GT Air Filter DP ──
  const airFilterFile = getMostRecentFile(files2, 'Air-Intake-Filter');
  if (airFilterFile) {
    const buf = await downloadFile(token, SITE_2, airFilterFile.id);
    results.airFilterDP = await parseGtFilterDP(buf, 'air');
  }

  // ── GT FG Filter DP ──
  const fgFilterFile = getMostRecentFile(files2, 'FG-filter');
  if (fgFilterFile) {
    const buf = await downloadFile(token, SITE_2, fgFilterFile.id);
    results.fgFilterDP = await parseGtFilterDP(buf, 'fuel');
  }

  return results;
}

module.exports = { syncAllReports, getAccessToken, downloadFile, listSharePointFiles };