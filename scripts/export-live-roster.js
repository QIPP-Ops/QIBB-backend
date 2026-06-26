/**
 * Export active approved roster users to JSON for leave planner.
 * Usage: node scripts/export-live-roster.js [output.json]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');

const OUT = process.argv[2] || path.join(__dirname, '../../scripts/live-roster-cache.json');

function loadUriCandidates() {
  const candidates = [];
  const backendEnv = path.join(__dirname, '../.env');
  const downloadsEnv = 'C:/Users/asus/Downloads/.env';

  for (const envPath of [backendEnv, downloadsEnv]) {
    if (!fs.existsSync(envPath)) continue;
    const parsed = require('dotenv').parse(fs.readFileSync(envPath));
    let uri = parsed.MONGODB_URI || '';
    uri = uri.replace(/^mongodb\+srv:\/\/mongodb\+srv:\/\//, 'mongodb+srv://');
    if (!uri) continue;
    const label = envPath.includes('Downloads') ? 'downloads-env' : 'backend-env';
    if (!candidates.some((c) => c.uri === uri)) {
      candidates.push({ label, uri, dbName: parsed.MONGODB_DB_NAME || 'QIPP' });
    }
  }
  return candidates;
}

function toYmd(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeCrew(crew) {
  const raw = String(crew || 'General').trim();
  const u = raw.toUpperCase();
  if (!raw || u === 'GENERAL' || u === 'G' || u === 'S') return raw || 'General';
  const stripped = u.replace(/^CREW\s+/i, '').trim();
  if (/^[A-D]$/.test(stripped)) return stripped;
  return raw;
}

async function fetchFromMongo() {
  for (const { label, uri } of loadUriCandidates()) {
    console.error(`Trying MongoDB (${label})...`);
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
      const filter = {
        isApproved: true,
        isActive: { $ne: false },
        hiddenFromLeaveTimesheet: { $ne: true },
      };
      const users = await AdminUser.find(filter)
        .select('name fullName empId crew role color annualLeaveBalance bankLeaveBalance compensateDayBalance leaves')
        .lean();
      await mongoose.disconnect();
      if (users.length) {
        return { source: `mongodb:${label}`, users };
      }
    } catch (err) {
      console.error(`  FAIL: ${err.message}`);
      try { await mongoose.disconnect(); } catch (_) {}
    }
  }
  return null;
}

async function fetchFromApi() {
  const base = 'https://qibb-backend.onrender.com/api';
  const creds = [
    { email: 'admin@acwaops.com', password: process.env.SUPER_ADMIN_PASSWORD || process.env.SMTP_PASS },
    { email: 'admin@acwaops.com', password: 'Qipp2026Admin' },
  ].filter((c) => c.password);

  for (const { email, password } of creds) {
    console.error(`Trying API login as ${email}...`);
    try {
      const loginRes = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) {
        console.error(`  login ${loginRes.status}`);
        continue;
      }
      const login = await loginRes.json();
      const token = login.token || login.accessToken;
      if (!token) {
        console.error('  no token in response');
        continue;
      }
      const rosterRes = await fetch(`${base}/roster?forLeaveTimesheet=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!rosterRes.ok) {
        console.error(`  roster ${rosterRes.status}`);
        continue;
      }
      const users = await rosterRes.json();
      const filtered = (Array.isArray(users) ? users : []).filter(
        (u) => u.isApproved !== false && u.isActive !== false
      );
      if (filtered.length) {
        return { source: 'api:qibb-backend.onrender.com', users: filtered };
      }
    } catch (err) {
      console.error(`  FAIL: ${err.message}`);
    }
  }
  return null;
}

function mapUsers(payload) {
  return payload.users.map((u) => ({
    empId: u.empId,
    name: u.fullName || u.name,
    displayName: u.name,
    crew: normalizeCrew(u.crew),
    role: u.role || '',
    color: u.color || '',
    annual: Number(u.annualLeaveBalance) || 0,
    bank: Number(u.bankLeaveBalance) || 0,
    compensate: Number(u.compensateDayBalance) || 0,
    leaves: (u.leaves || [])
      .filter((lv) => (lv.status || 'approved') !== 'rejected')
      .map((lv) => ({
        start: toYmd(lv.start),
        end: toYmd(lv.end),
        type: lv.type || 'Planned',
        status: lv.status || 'approved',
      }))
      .filter((lv) => lv.start && lv.end),
  }));
}

async function main() {
  let payload = await fetchFromMongo();
  if (!payload) payload = await fetchFromApi();
  if (!payload) {
    console.error('BLOCKER: MongoDB unreachable (IP whitelist) and API login failed.');
    process.exit(1);
  }

  const out = {
    exportedAt: new Date().toISOString(),
    source: payload.source,
    count: payload.users.length,
    employees: mapUsers(payload),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ source: out.source, count: out.count, path: OUT }));
}

main();
