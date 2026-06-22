const path = require('path');
const fs = require('fs');
const AdminUser = require('../models/AdminUser');
const { filterProtectedAccounts } = require('../utils/protectedAccounts');

let staticCached = null;

function loadStaticCrewData() {
  if (staticCached) return staticCached;
  const filePath = path.join(__dirname, '../data/qipp-crew-calendar.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  staticCached = JSON.parse(raw);
  return staticCached;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(start, end) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.round((e - s) / 86400000) + 1;
}

function formatDateRange(start, end) {
  const fmt = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapUserToCrewMember(user) {
  const name = user.name || '';
  const upcomingTimeOff = (user.leaves || [])
    .filter((lv) => lv?.start && lv?.end)
    .map((lv) => ({
      startDate: lv.start,
      endDate: lv.end,
      dates: formatDateRange(lv.start, lv.end),
      days: daysBetween(lv.start, lv.end),
      status: lv.status === 'approved' || lv.type === 'Applied on SAP' ? 'Approved' : 'Planned',
      type: lv.type || lv.leaveType || 'Annual Leave',
    }));

  return {
    id: String(user.empId || user._id),
    empId: String(user.empId || ''),
    name,
    displayName: name.split(' ')[0] || name,
    initials: initialsFromName(name),
    jobTitle: user.role || 'Operator',
    crew: user.crew || 'General',
    location: 'Qurayyah Independent Power Plant',
    cluster: 'Central Eastern Cluster',
    companyCode: 'NOMC-NOQY',
    workSchedule: '12QY3',
    upcomingTimeOff,
    leaveBalances: {
      annualLeaveDays: user.annualLeaveBalance ?? null,
      carryForwardDays: user.carryForwardBalance ?? 0,
      bankLeaveDays: user.bankLeaveBalance ?? null,
    },
    timesheet: {
      period: new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      status: 'Submitted',
      plannedHours: 168,
      recordedHours: null,
    },
    email: user.email || null,
  };
}

function overlapsRange(entry, rangeStart, rangeEnd) {
  if (!rangeStart && !rangeEnd) return true;
  const start = rangeStart || '1970-01-01';
  const end = rangeEnd || '2099-12-31';
  for (const off of entry.upcomingTimeOff || []) {
    if (off.startDate <= end && off.endDate >= start) return true;
  }
  return false;
}

function filterMembers(members, query) {
  const { crew, role, location, month, start, end, q } = query;
  let out = members;

  if (crew && crew !== 'all') {
    out = out.filter((m) => String(m.crew).toLowerCase() === String(crew).toLowerCase());
  }
  if (role && role !== 'all') {
    const r = String(role).toLowerCase();
    out = out.filter((m) => String(m.jobTitle).toLowerCase().includes(r));
  }
  if (location && location !== 'all') {
    const loc = String(location).toLowerCase();
    out = out.filter(
      (m) =>
        String(m.location).toLowerCase().includes(loc) ||
        String(m.cluster).toLowerCase().includes(loc)
    );
  }
  if (q) {
    const needle = String(q).toLowerCase();
    out = out.filter(
      (m) =>
        String(m.name).toLowerCase().includes(needle) ||
        String(m.jobTitle).toLowerCase().includes(needle) ||
        String(m.empId).includes(needle)
    );
  }

  if (month) {
    const [y, m] = String(month).split('-').map(Number);
    if (y && m) {
      const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      out = out.filter((entry) => overlapsRange(entry, monthStart, monthEnd));
    }
  } else if (start || end) {
    out = out.filter((entry) => overlapsRange(entry, start, end));
  }

  return out;
}

exports.getCrew = async (req, res) => {
  try {
    const users = await AdminUser.find({ isActive: { $ne: false } })
      .select(
        'empId name email crew role leaves annualLeaveBalance bankLeaveBalance carryForwardBalance hiddenFromLeaveTimesheet'
      )
      .lean();

    const rosterUsers = filterProtectedAccounts(users).filter((u) => !u.hiddenFromLeaveTimesheet);

    let members;
    let source;

    if (rosterUsers.length >= 10) {
      members = rosterUsers.map(mapUserToCrewMember);
      source = 'database';
    } else {
      const staticData = loadStaticCrewData();
      members = staticData.members || [];
      source = 'static';
    }

    const filtered = filterMembers(members, req.query);

    const roles = [...new Set(members.map((m) => m.jobTitle).filter(Boolean))].sort();
    const crews = [...new Set(members.map((m) => m.crew).filter(Boolean))].sort();

    res.json({
      source,
      location: 'Qurayyah Independent Power Plant',
      cluster: 'Central Eastern Cluster',
      companyCode: 'NOMC-NOQY',
      workScheduleDefault: '12QY3',
      total: filtered.length,
      roles,
      crews,
      members: filtered,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load crew calendar data' });
  }
};
