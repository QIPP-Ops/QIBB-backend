const AdminConfig = require('../models/AdminConfig');
const bcrypt = require('bcryptjs');

exports.getStatus = async (req, res) => {
  const config = await AdminConfig.findOne();
  if (!config) return res.json({ editingLocked: false });
  res.json({ editingLocked: config.editingLocked });
};

exports.setPin = async (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) return res.status(400).json({ message: 'PIN must be at least 4 digits.' });
  const hash = await bcrypt.hash(pin, 10);
  let config = await AdminConfig.findOne();
  if (!config) config = new AdminConfig({ pinHash: hash });
  else config.pinHash = hash;
  await config.save();
  res.json({ message: 'PIN updated.' });
};

exports.checkPin = async (req, res) => {
  const { pin } = req.body;
  const config = await AdminConfig.findOne();
  if (!config) return res.status(404).json({ message: 'No PIN set.' });
  const valid = await bcrypt.compare(pin, config.pinHash);
  if (!valid) return res.status(401).json({ message: 'Invalid PIN.' });
  res.json({ message: 'PIN valid.' });
};

exports.setLock = async (req, res) => {
  const { locked } = req.body;
  let config = await AdminConfig.findOne();
  if (!config) return res.status(404).json({ message: 'No config found.' });
  config.editingLocked = !!locked;
  await config.save();
  res.json({ message: `Editing lock set to ${!!locked}` });
};
