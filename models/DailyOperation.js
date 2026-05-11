const mongoose = require('mongoose');

const opts = (col) => ({ strict: false, collection: col });

const make = (name, col) =>
  mongoose.models[name] || mongoose.model(name, new mongoose.Schema(
    { report_date: { type: String, index: true }, source_file: String, ingested_at: String },
    opts(col)
  ));

module.exports = {
  DailyOpSummary:  make('DailyOpSummary',  'daily_operation_summary'),
  DailyOpUnits:    make('DailyOpUnits',    'daily_operation_units'),
  DailyOpWeather:  make('DailyOpWeather',  'daily_operation_weather'),
  DailyOpRo:       make('DailyOpRo',       'daily_operation_ro'),
  DailyOpChillers: make('DailyOpChillers', 'daily_operation_chillers'),
};