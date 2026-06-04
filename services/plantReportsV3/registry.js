const path = require('path');

const PARSER_MODULES = {
  water: './parsers/waterParser.js',
  energy: './parsers/energyParser.js',
  environment: './parsers/environmentParser.js',
  daily_ops: './parsers/dailyOpsParser.js',
  fg_filter: './parsers/fgFilterParser.js',
  air_inlet_filter: './parsers/airInletFilterParser.js',
  timers_counters: './parsers/timersCountersParser.js',
  hrsg: './parsers/hrsgParser.js',
};

function detectKind(filename) {
  const name = path.basename(String(filename || '')).toLowerCase();

  if (name.includes('water')) {
    return 'water';
  }
  if (name.includes('energy')) {
    return 'energy';
  }
  if (name.includes('environment')) {
    return 'environment';
  }
  if (name.includes('operation')) {
    return 'daily_ops';
  }
  if (
    name.includes('fg-filter') ||
    name.includes('fg_filter') ||
    name.includes('fgfilter') ||
    name.includes('fuel-gas') ||
    name.includes('fuel_gas')
  ) {
    return 'fg_filter';
  }
  if (
    name.includes('air-intake') ||
    name.includes('air_intake') ||
    name.includes('air-inlet') ||
    name.includes('air_inlet')
  ) {
    return 'air_inlet_filter';
  }
  if (name.includes('timer') || name.includes('counter')) {
    return 'timers_counters';
  }
  if (name.includes('hrsg')) {
    return 'hrsg';
  }

  return null;
}

function getParser(filename) {
  const kind = detectKind(filename);
  if (!kind) {
    return null;
  }
  return require(PARSER_MODULES[kind]);
}

module.exports = getParser;
