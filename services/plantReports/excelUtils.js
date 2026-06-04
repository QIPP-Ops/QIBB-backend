function cellText(cell) {
  const v = cell?.value;
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  if (typeof v === 'object' && v.richText) {
    return v.richText.map((p) => p.text).join('').trim();
  }
  const s = String(v).trim();
  if (s === '[object Object]') return '';
  return s;
}

function parseNumber(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s) || /^sd$/i.test(s) || /not working/i.test(s)) {
    return null;
  }
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function slugKey(parts) {
  return parts
    .filter(Boolean)
    .join('.')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function inferDateFromFilename(filePath, fallbackDate) {
  const base = require('path').basename(filePath);

  const isoStart = base.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoStart) return `${isoStart[1]}-${isoStart[2]}-${isoStart[3]}`;

  const ymStart = base.match(/^(\d{4})[-_](\d{2})(?![0-9])/);
  if (ymStart) return `${ymStart[1]}-${ymStart[2]}-01`;

  const iso = base.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = base.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const month = base.match(/(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (month) {
    const months = {
      january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    };
    const m = months[month[1].toLowerCase()];
    const d = String(month[2]).padStart(2, '0');
    return `${month[3]}-${m}-${d}`;
  }

  const abbr = base.match(
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\.?\s+(\d{1,2})[,.]?\s+(\d{4})/i
  );
  if (abbr) {
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
    };
    const key = abbr[1].toLowerCase().replace(/\.$/, '').slice(0, 4);
    const m = months[key.slice(0, 3)] || months[key];
    if (m) {
      const d = String(abbr[2]).padStart(2, '0');
      return `${abbr[3]}-${m}-${d}`;
    }
  }

  if (fallbackDate) {
    const d = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

function classifyReport(filename) {
  const n = filename.toLowerCase().replace(/[_\s]+/g, ' ');
  if (n.includes('daily water consumption') || n.includes('water consumption') || n.includes('daily_water')) {
    return 'water';
  }
  if (n.includes('operation shift report')) return 'shift';
  if (n.includes('daily operation report')) return 'daily_ops';
  if (/ro[\s-]?hrsg/.test(n) || n.includes('ro hrsg')) return 'ro_hrsg';
  if (n.includes('gt') && n.includes('fg filter')) return 'gt_fg_filter';
  if (n.includes('air intake filter')) return 'gt_air_filter';
  if (n.includes('fuel gas daily')) return 'fuel_gas';
  if (n.includes('environment report')) return 'environment';
  if (n.includes('oil purifier')) return 'oil_purifier';
  if (n.includes('timers-counters') || n.includes('timers counters')) return 'timers';
  if (n.includes('power availability')) return 'power_avail';
  if (n.includes('energy-produced') || n.includes('energy produced') || (n.includes('energy') && n.includes('report'))) {
    return 'energy';
  }
  return 'other';
}

/** Skip placeholder / empty equipment cells */
function hasNumericInRow(row, startCol = 2, endCol = 14) {
  for (let c = startCol; c <= endCol; c++) {
    const n = parseNumber(cellText(row.getCell(c)));
    if (n != null) return true;
  }
  return false;
}

module.exports = {
  cellText,
  parseNumber,
  slugKey,
  inferDateFromFilename,
  classifyReport,
  hasNumericInRow,
};
