const AdminUser = require('../models/AdminUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  const { email, password, name, empId, crew, role, accessRole, color } = req.body;
  
  if (!email || !password || !name || !empId || !crew || !role) {
    return res.status(400).json({ message: 'All personnel fields are required.' });
  }

  // Domain restriction
  const allowedDomains = ['acwapower.com', 'nomac.com'];
  const domain = email.split('@')[1];
  if (!allowedDomains.includes(domain)) {
    return res.status(403).json({ message: 'Only @acwapower.com and @nomac.com emails are allowed.' });
  }

  try {
    const existing = await AdminUser.findOne({ $or: [{ email }, { empId }] });
    if (existing) {
        if (existing.email === email) return res.status(409).json({ message: 'Email already registered.' });
        if (existing.empId === empId) return res.status(409).json({ message: 'Employee ID already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = new AdminUser({ 
      email, 
      passwordHash, 
      name,
      empId,
      crew,
      role,
      color: color || 'crew-grey',
      accessRole: accessRole || 'viewer',
      leaves: [],
      isApproved: false // Explicitly set to false
    });
    
    await user.save();
    res.status(201).json({ message: 'Personnel registered successfully. Pending admin approval.', role: user.accessRole });
  } catch (error) {
    res.status(500).json({ message: 'Error registering personnel.', error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
    
    if (!user.isApproved) {
      return res.status(403).json({ message: 'Your account is pending admin approval.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });
    
    const token = jwt.sign({ 
      id: user._id, 
      email: user.email,
      role: user.accessRole,
      name: user.name,
      empId: user.empId
    }, process.env.JWT_SECRET, { expiresIn: '1d' });
    
    res.json({ token, role: user.accessRole });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
};

exports.verify = (req, res) => {
  res.json({ ok: true, user: req.user });
};
