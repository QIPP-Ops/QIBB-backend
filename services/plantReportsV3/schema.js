const VALID_KINDS = [
  'water',
  'energy',
  'environment',
  'daily_ops',
  'fg_filter',
  'air_inlet_filter',
  'timers_counters',
  'hrsg',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validatePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    return false;
  }

  const { date, metric, value } = point;

  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return false;
  }

  if (typeof metric !== 'string' || metric.length === 0) {
    return false;
  }

  if (value !== null && (typeof value !== 'number' || Number.isNaN(value))) {
    return false;
  }

  return true;
}

function validatePayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['payload must be an object'] };
  }

  if (!VALID_KINDS.includes(payload.kind)) {
    errors.push(`kind must be one of: ${VALID_KINDS.join(', ')}`);
  }

  if (!Array.isArray(payload.data)) {
    errors.push('data must be an array');
  } else {
    for (let i = 0; i < payload.data.length; i += 1) {
      if (!validatePoint(payload.data[i])) {
        errors.push(`data[${i}] failed validatePoint`);
      }
    }
  }

  if (errors.length === 0) {
    return { valid: true };
  }

  return { valid: false, errors };
}

module.exports = {
  VALID_KINDS,
  validatePoint,
  validatePayload,
};
