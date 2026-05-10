const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const bcrypt = require('bcryptjs');

exports.getStatus = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    res.json({ editingLocked: config?.editingLocked || false });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getConfig = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) { config = new AdminConfig(); await config.save(); }
    res.json(config);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateConfig = async (req, res) => {
  try {
    const allowed = ['shiftCycleBaseDate','globalKpiEditingAllowed'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const config = await AdminConfig.findOneAndUpdate({}, updates, { new: true, upsert: true });
    res.json(config);
  } catch (err) { res.status(500).json({ message: err.message }); }
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
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.checkPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'No PIN set.' });
    const valid = await bcrypt.compare(pin, config.pinHash);
    if (!valid) return res.status(401).json({ message: 'Invalid PIN.' });
    res.json({ message: 'PIN valid.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.setLock = async (req, res) => {
  try {
    const { locked } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'No config found.' });
    config.editingLocked = !!locked;
    await config.save();
    res.json({ message: `Lock set to ${!!locked}` });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addCrew = async (req, res) => {
  try {
    const { crew } = req.body;
    let config = await AdminConfig.findOne() || new AdminConfig();
    if (!config.availableCrews.includes(crew)) { config.availableCrews.push(crew); await config.save(); }
    res.json(config.availableCrews);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.removeCrew = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableCrews = config.availableCrews.filter(c => c !== req.params.crew);
    await config.save();
    res.json(config.availableCrews);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.addRole = async (req, res) => {
  try {
    const { role } = req.body;
    let config = await AdminConfig.findOne() || new AdminConfig();
    if (!config.availableRoles.includes(role)) { config.availableRoles.push(role); await config.save(); }
    res.json(config.availableRoles);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.removeRole = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableRoles = config.availableRoles.filter(r => r !== req.params.role);
    await config.save();
    res.json(config.availableRoles);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Achievements
exports.getAchievements = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    res.json(config?.achievements || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.addAchievement = async (req, res) => {
  try {
    const config = await AdminConfig.findOneAndUpdate({}, { $push: { achievements: req.body } }, { new: true, upsert: true });
    res.json(config.achievements);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.updateAchievement = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const ach = config.achievements.id(req.params.id);
    if (!ach) return res.status(404).json({ message: 'Achievement not found.' });
    Object.assign(ach, req.body);
    await config.save();
    res.json(config.achievements);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.deleteAchievement = async (req, res) => {
  try {
    const config = await AdminConfig.findOneAndUpdate({}, { $pull: { achievements: { _id: req.params.id } } }, { new: true });
    res.json(config.achievements);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// KPI Templates
exports.getKpiTemplates = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    res.json(config?.kpiTemplates || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.upsertKpiTemplate = async (req, res) => {
  try {
    const { role, goals } = req.body;
    let config = await AdminConfig.findOne() || new AdminConfig();
    const existing = config.kpiTemplates.find(t => t.role === role);
    if (existing) existing.goals = goals;
    else config.kpiTemplates.push({ role, goals });
    await config.save();
    res.json(config.kpiTemplates);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// User Management
exports.getPendingUsers = async (req, res) => {
  try { res.json(await AdminUser.find({ isApproved: false }).select('-passwordHash')); }
  catch (err) { res.status(500).json({ message: err.message }); }
};
exports.getAllUsers = async (req, res) => {
  try { res.json(await AdminUser.find().select('-passwordHash')); }
  catch (err) { res.status(500).json({ message: err.message }); }
};
exports.approveUser = async (req, res) => {
  try {
    const user = await AdminUser.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User approved.', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.rejectUser = async (req, res) => {
  try {
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ message: 'User rejected.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.updateUserRole = async (req, res) => {
  try {
    const user = await AdminUser.findByIdAndUpdate(req.params.id, { accessRole: req.body.accessRole }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'Role updated.', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.getPtwPersonnel = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    res.json(config?.ptwPersonnel || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.addPtwPerson = async (req, res) => {
  try {
    const config = await AdminConfig.findOneAndUpdate({}, { $push: { ptwPersonnel: req.body } }, { new: true, upsert: true });
    res.json(config.ptwPersonnel);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.updatePtwPerson = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    const person = config.ptwPersonnel.id(req.params.id);
    if (!person) return res.status(404).json({ message: 'Not found' });
    Object.assign(person, req.body);
    await config.save();
    res.json(config.ptwPersonnel);
  } catch (err) { res.status(500).json({ message: err.message }); }
};
exports.deletePtwPerson = async (req, res) => {
  try {
    const config = await AdminConfig.findOneAndUpdate({}, { $pull: { ptwPersonnel: { _id: req.params.id } } }, { new: true });
    res.json(config.ptwPersonnel);
  } catch (err) { res.status(500).json({ message: err.message }); }
};