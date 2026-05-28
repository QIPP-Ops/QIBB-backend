const jwt = require('jsonwebtoken');
const { hasPortalAdminAccess } = require('./superAdmin');
const { normalizeDecodedUser } = require('../utils/jwtAuth');

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return secret;
}

exports.protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, jwtSecret());
    req.user = normalizeDecodedUser(decoded);
    next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      message: expired ? 'Token expired.' : 'Invalid token.',
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }
};

exports.admin = (req, res, next) => {
  if (req.user && hasPortalAdminAccess(req)) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
  }
};
