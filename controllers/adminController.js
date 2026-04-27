const AdminConfig = require('../models/AdminConfig');
const bcrypt = require('bcryptjs');

exports.getStatus = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) return res.json({ editingLocked: false });
    res.json({ editingLocked: config.editingLocked });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching status', error: err.message });
  }
};

exports.getConfig = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) {
       config = new AdminConfig();
       await config.save();
    }
    res.json(config);
  } catch (err) {
    console.error('Error in getConfig:', err);
    res.status(500).json({ message: 'Error fetching configuration', error: err.message });
  }
};

exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length < 4) return res.status(400).json({ message: 'PIN must be at least 4 digits.' });
    const hash = await bcrypt.hash(pin, 10);
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig({ pinHash: hash });
    else config.pinHash = hash;
    await config.save();
    res.json({ message: 'PIN updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Error setting PIN', error: err.message });
  }
};

exports.checkPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'No PIN set.' });
    const valid = await bcrypt.compare(pin, config.pinHash);
    if (!valid) return res.status(401).json({ message: 'Invalid PIN.' });
    res.json({ message: 'PIN valid.' });
  } catch (err) {
    res.status(500).json({ message: 'Error checking PIN', error: err.message });
  }
};

exports.setLock = async (req, res) => {
  try {
    const { locked } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'No config found.' });
    config.editingLocked = !!locked;
    await config.save();
    res.json({ message: `Editing lock set to ${!!locked}` });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling lock', error: err.message });
  }
};

exports.addCrew = async (req, res) => {
  try {
    const { crew } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    if (!config.availableCrews.includes(crew)) {
      config.availableCrews.push(crew);
      await config.save();
    }
    res.json(config.availableCrews);
  } catch (err) {
    res.status(500).json({ message: 'Error adding crew', error: err.message });
  }
};

exports.removeCrew = async (req, res) => {
  try {
    const { crew } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableCrews = config.availableCrews.filter(c => c !== crew);
    await config.save();
    res.json(config.availableCrews);
  } catch (err) {
    res.status(500).json({ message: 'Error removing crew', error: err.message });
  }
};

exports.addRole = async (req, res) => {
  try {
    const { role } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    if (!config.availableRoles.includes(role)) {
      config.availableRoles.push(role);
      await config.save();
    }
    res.json(config.availableRoles);
  } catch (err) {
    res.status(500).json({ message: 'Error adding role', error: err.message });
  }
};

exports.removeRole = async (req, res) => {
  try {
    const { role } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableRoles = config.availableRoles.filter(r => r !== role);
    await config.save();
    res.json(config.availableRoles);
  } catch (err) {
    res.status(500).json({ message: 'Error removing role', error: err.message });
  }
};
