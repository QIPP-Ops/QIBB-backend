const EnvironmentalReport = require('../models/EnvironmentalReport');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');

exports.getAll = async (req, res) => {
  try {
    const reports = await EnvironmentalReport.find().sort({ date: 1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const report = new EnvironmentalReport(req.body);
    await report.save();
    res.status(201).json(report);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const report = await EnvironmentalReport.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const report = await EnvironmentalReport.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.exportCSV = async (req, res) => {
  try {
    const reports = await EnvironmentalReport.find().sort({ date: 1 });
    const parser = new Parser();
    const csv = parser.parse(reports.map(r => r.toObject()));
    res.header('Content-Type', 'text/csv');
    res.attachment('environmental_reports.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const reports = await EnvironmentalReport.find().sort({ date: 1 });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reports');
    worksheet.columns = [
      { header: 'date', key: 'date', width: 20 },
      { header: 'so2', key: 'so2', width: 10 },
      { header: 'nox', key: 'nox', width: 10 },
      { header: 'co', key: 'co', width: 10 },
      { header: 'particulate', key: 'particulate', width: 15 },
      { header: 'stackTemp', key: 'stackTemp', width: 12 },
      { header: 'remarks', key: 'remarks', width: 30 }
    ];
    reports.forEach(r => {
      worksheet.addRow({
        date: r.date ? r.date.toISOString().split('T')[0] : '',
        so2: r.so2,
        nox: r.nox,
        co: r.co,
        particulate: r.particulate,
        stackTemp: r.stackTemp,
        remarks: r.remarks
      });
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('environmental_reports.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.importData = async (req, res) => {
  try {
    let data = [];
    if (req.file.originalname.endsWith('.csv')) {
      const csv = req.file.buffer.toString('utf-8');
      const rows = csv.split('\n').filter(Boolean);
      const headers = rows[0].split(',');
      data = rows.slice(1).map(row => {
        const values = row.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim(); });
        return obj;
      });
    } else if (req.file.originalname.endsWith('.xlsx')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const [date, so2, nox, co, particulate, stackTemp, remarks] = row.values.slice(1);
        data.push({ date, so2, nox, co, particulate, stackTemp, remarks });
      });
    }
    for (const entry of data) {
      await EnvironmentalReport.findOneAndUpdate(
        { date: entry.date },
        entry,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    res.json({ message: 'Import successful', count: data.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
