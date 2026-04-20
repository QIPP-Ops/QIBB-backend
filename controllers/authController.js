const AdminUser = require('../models/AdminUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });
  const existing = await AdminUser.findOne({ email });
  if (existing) return res.status(409).json({ message: 'Email already registered.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = new AdminUser({ 
    email, 
    passwordHash, 
    role: role || 'admin' 
  });
  await user.save();
  res.status(201).json({ message: 'User registered.', role: user.role });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await AdminUser.findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });
  const token = jwt.sign({ 
    id: user._id, 
    email: user.email,
    role: user.role 
  }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, role: user.role });
};

exports.verify = (req, res) => {
  res.json({ ok: true, user: req.user });
};
