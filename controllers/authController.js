const AdminUser = require('../models/AdminUser');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const { sendOtpEmail, sendResetEmail, sendTempPasswordEmail } = require('../services/emailService');

const AUTO_APPROVED_DOMAINS = ['acwapower.com', 'nomac.com'];

function getEmailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || '';
}

// ─── Register ────────────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  const { email, password, name, empId, crew, role, accessRole, color } = req.body;

  if (!email || !password || !name || !empId || !crew || !role) {
    return res.status(400).json({ message: 'All personnel fields are required.' });
  }

  try {
    const existing = await AdminUser.findOne({ $or: [{ email }, { empId }] });
    if (existing) {
      if (existing.email === email)   return res.status(409).json({ message: 'Email already registered.' });
      if (existing.empId === empId)   return res.status(409).json({ message: 'Employee ID already registered.' });
    }

    const domain       = getEmailDomain(email);
    const autoApproved = AUTO_APPROVED_DOMAINS.includes(domain);

    // Generate OTP
    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash   = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new AdminUser({
      email,
      passwordHash,
      name,
      empId,
      crew,
      role,
      color:          color || 'crew-grey',
      accessRole:     accessRole || 'viewer',
      isApproved:     autoApproved,   // auto-approve trusted domains
      emailVerified:  false,
      otpHash,
      otpExpiry,
      leaves:         []
    });

    await user.save();

    // Send OTP email (non-blocking — don't fail registration if email fails)
    try {
      await sendOtpEmail(email, name, otp);
    } catch (emailErr) {
      console.error('OTP email failed:', emailErr.message);
    }

    res.status(201).json({
      message:     autoApproved
        ? 'Registered successfully. Check your email for the OTP to verify your account.'
        : 'Registered. Verify your email, then await admin approval.',
      role:        user.accessRole,
      autoApproved,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering personnel.', error: error.message });
  }
};

// ─── Verify OTP ──────────────────────────────────────────────────────────────

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

  try {
    const user = await AdminUser.findOne({ email });
    if (!user)                          return res.status(404).json({ message: 'User not found.' });
    if (user.emailVerified)             return res.json({ message: 'Email already verified.' });
    if (!user.otpHash || !user.otpExpiry) return res.status(400).json({ message: 'No OTP found. Please register again.' });
    if (new Date() > user.otpExpiry)    return res.status(400).json({ message: 'OTP has expired. Request a new one.' });

    const valid = await bcrypt.compare(otp, user.otpHash);
    if (!valid) return res.status(401).json({ message: 'Invalid OTP.' });

    user.emailVerified = true;
    user.otpHash       = '';
    user.otpExpiry     = null;
    await user.save();

    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'OTP verification failed.', error: error.message });
  }
};

// ─── Resend OTP ──────────────────────────────────────────────────────────────

exports.resendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const user = await AdminUser.findOne({ email });
    if (!user)              return res.status(404).json({ message: 'User not found.' });
    if (user.emailVerified) return res.json({ message: 'Email already verified.' });

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash   = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otpHash   = otpHash;
    user.otpExpiry = otpExpiry;
    await user.save();

    await sendOtpEmail(email, user.name, otp);
    res.json({ message: 'OTP resent successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to resend OTP.', error: error.message });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });

    if (!user.emailVerified) return res.status(403).json({ message: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
    if (!user.isApproved)    return res.status(403).json({ message: 'Your account is pending admin approval.', code: 'PENDING_APPROVAL' });

    const token = jwt.sign({
      id:     user._id,
      email:  user.email,
      role:   user.accessRole,
      name:   user.name,
      empId:  user.empId,
      crew:   user.crew,
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, role: user.accessRole });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const user = await AdminUser.findOne({ email });
    // Always return 200 — don't reveal if email exists
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token       = crypto.randomBytes(32).toString('hex');
    const tokenHash   = crypto.createHash('sha256').update(token).digest('hex');
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetTokenHash   = tokenHash;
    user.resetTokenExpiry = tokenExpiry;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    try {
      await sendResetEmail(email, user.name, resetUrl);
    } catch (emailErr) {
      console.error('Reset email failed:', emailErr.message);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process request.', error: error.message });
  }
};

// ─── Reset Password (user via token) ─────────────────────────────────────────

exports.resetPassword = async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) return res.status(400).json({ message: 'All fields required.' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await AdminUser.findOne({
      email,
      resetTokenHash:   tokenHash,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link.' });

    user.passwordHash     = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash   = '';
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Password reset failed.', error: error.message });
  }
};

// ─── Admin Force-Reset Password ───────────────────────────────────────────────

exports.adminResetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await AdminUser.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Generate a random temp password
    const tempPassword = crypto.randomBytes(5).toString('hex'); // e.g. "a3f9c2e1b4"
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    await user.save();

    try {
      await sendTempPasswordEmail(user.email, user.name, tempPassword);
    } catch (emailErr) {
      console.error('Temp password email failed:', emailErr.message);
    }

    res.json({ message: `Password reset. Temporary password sent to ${user.email}.` });
  } catch (error) {
    res.status(500).json({ message: 'Admin reset failed.', error: error.message });
  }
};

// ─── Verify Token ─────────────────────────────────────────────────────────────

exports.verify = (req, res) => {
  res.json({ ok: true, user: req.user });
};
