const AdminConfig = require('../models/AdminConfig');
const AdminUser   = require('../models/AdminUser');
const bcrypt      = require('bcryptjs');

// ─── Status / PIN / Lock ─────────────────────────────────────────────────────

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
    if (!config) { config = new AdminConfig(); await config.save(); }
    res.json(config);
  } catch (err) {
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
    if (!config || !config.pinHash) return res.status(404).json({ message: 'No PIN set.' });
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
    if (!config) config = new AdminConfig();
    config.editingLocked = !!locked;
    await config.save();
    res.json({ message: `Editing lock set to ${!!locked}`, editingLocked: config.editingLocked });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling lock', error: err.message });
  }
};

// ─── Crews / Roles (accepts {crew} OR {name}) ────────────────────────────────

exports.addCrew = async (req, res) => {
  try {
    const crew = (req.body.crew || req.body.name || '').toString().trim();
    if (!crew) return res.status(400).json({ message: 'Crew name is required.' });
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
    const role = (req.body.role || req.body.name || '').toString().trim();
    if (!role) return res.status(400).json({ message: 'Role name is required.' });
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
    const role = decodeURIComponent(req.params.role);
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableRoles = config.availableRoles.filter(r => r !== role);
    await config.save();
    res.json(config.availableRoles);
  } catch (err) {
    res.status(500).json({ message: 'Error removing role', error: err.message });
  }
};

// ─── User Management ─────────────────────────────────────────────────────────

exports.getPendingUsers = async (req, res) => {
  try {
    const users = await AdminUser.find({ isApproved: false }).select('-passwordHash');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching pending users', error: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await AdminUser.find().select('-passwordHash');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users', error: err.message });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await AdminUser.findByIdAndUpdate(id, { isApproved: true }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User approved.', user });
  } catch (err) {
    res.status(500).json({ message: 'Error approving user', error: err.message });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await AdminUser.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User rejected and removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Error rejecting user', error: err.message });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { accessRole } = req.body;
    const user = await AdminUser.findByIdAndUpdate(id, { accessRole }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User role updated.', user });
  } catch (err) {
    res.status(500).json({ message: 'Error updating user role', error: err.message });
  }
};

// ─── Curriculum CRUD ─────────────────────────────────────────────────────────

exports.getCurriculum = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) { config = new AdminConfig(); await config.save(); }
    res.json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching curriculum', error: err.message });
  }
};

exports.addCurriculumItem = async (req, res) => {
  try {
    const { category, title, description, link, duration } = req.body;
    if (!category || !title) return res.status(400).json({ message: 'Category and title are required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    config.curriculum.push({ category, title, description, link, duration });
    await config.save();
    res.status(201).json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error adding curriculum item', error: err.message });
  }
};

exports.updateCurriculumItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, title, description, link, duration } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const item = config.curriculum.id(id);
    if (!item) return res.status(404).json({ message: 'Curriculum item not found.' });
    if (category    !== undefined) item.category    = category;
    if (title       !== undefined) item.title       = title;
    if (description !== undefined) item.description = description;
    if (link        !== undefined) item.link        = link;
    if (duration    !== undefined) item.duration    = duration;
    await config.save();
    res.json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error updating curriculum item', error: err.message });
  }
};

exports.deleteCurriculumItem = async (req, res) => {
  try {
    const { id } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.curriculum = config.curriculum.filter(item => item._id.toString() !== id);
    await config.save();
    res.json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error deleting curriculum item', error: err.message });
  }
};

// ─── PTW Personnel CRUD (flexible body) ──────────────────────────────────────

exports.getPtwPersonnel = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) { config = new AdminConfig(); await config.save(); }
    res.json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching PTW personnel', error: err.message });
  }
};

exports.addPtwPersonnel = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ message: 'Name is required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    config.ptwPersonnel.push(body);
    await config.save();
    res.status(201).json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error adding PTW personnel', error: err.message });
  }
};

exports.updatePtwPersonnel = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const person = config.ptwPersonnel.id(id);
    if (!person) return res.status(404).json({ message: 'PTW personnel not found.' });
    Object.assign(person, updates);
    await config.save();
    res.json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error updating PTW personnel', error: err.message });
  }
};

exports.deletePtwPersonnel = async (req, res) => {
  try {
    const { id } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.ptwPersonnel = config.ptwPersonnel.filter(p => p._id.toString() !== id);
    await config.save();
    res.json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error deleting PTW personnel', error: err.message });
  }
};
