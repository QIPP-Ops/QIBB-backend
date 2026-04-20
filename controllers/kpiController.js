const PlantPerformance = require('../models/PlantPerformance');

exports.getKpis = async (req, res) => {
  const { days } = req.query;
  try {
    let query = PlantPerformance.find().sort({ date: 1 });
    if (days && days !== '0') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(days));
      query = query.where('date').gte(cutoff);
    }
    const data = await query.exec();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
