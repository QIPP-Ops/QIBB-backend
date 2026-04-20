const Employee = require('../models/Employee');

exports.getRoster = async (req, res) => {
  try {
    const employees = await Employee.find().sort({ crew: 1, role: 1 });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addLeave = async (req, res) => {
  const { employeeId, leave } = req.body;
  try {
    console.log(`[ROSTER API] Adding leave for employee ${employeeId}:`, leave);
    const employee = await Employee.findOne({ empId: employeeId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    employee.leaves.push(leave);
    await employee.save();
    console.log(`[ROSTER API] Successfully added leave for ${employeeId}`);
    res.status(201).json(employee);
  } catch (error) {
    console.error(`[ROSTER API] Error adding leave for ${employeeId}:`, error);
    res.status(400).json({ message: error.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const employee = new Employee(req.body);
    await employee.save();
    res.status(201).json(employee);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findOneAndUpdate(
      { empId: req.params.empId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json(employee);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findOneAndDelete({ empId: req.params.empId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.removeLeave = async (req, res) => {
  const { employeeId, leaveId } = req.params;
  try {
    console.log(`[ROSTER API] Removing leave ${leaveId} for employee ${employeeId}`);
    const employee = await Employee.findOne({ empId: employeeId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    employee.leaves = employee.leaves.filter(l => l._id.toString() !== leaveId);
    await employee.save();
    console.log(`[ROSTER API] Successfully removed leave for ${employeeId}`);
    res.json(employee);
  } catch (error) {
    console.error(`[ROSTER API] Error removing leave for ${employeeId}:`, error);
    res.status(400).json({ message: error.message });
  }
};
