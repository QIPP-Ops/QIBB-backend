const AdminUser = require('../models/AdminUser');

exports.getRoster = async (req, res) => {
  try {
    const users = await AdminUser.find().sort({ crew: 1, role: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addLeave = async (req, res) => {
  const { employeeId, leave } = req.body;
  try {
    const user = await AdminUser.findOne({ empId: employeeId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    user.leaves.push(leave);
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Create User through Roster - making sure it defaults to viewer if not specified
exports.createEmployee = async (req, res) => {
  try {
    const user = new AdminUser(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const user = await AdminUser.findOneAndUpdate(
      { empId: req.params.empId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const empId = req.params.empId;
    const user = await AdminUser.findOneAndDelete({ empId });

    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    
    res.json({ message: 'Personnel and associated account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.removeLeave = async (req, res) => {
  const { employeeId, leaveId } = req.params;
  try {
    const user = await AdminUser.findOne({ empId: employeeId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    
    user.leaves = user.leaves.filter(l => l._id.toString() !== leaveId);
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
