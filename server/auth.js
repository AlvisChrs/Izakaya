require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'izakaya_fallback_secret_key_123!';

// Generate JWT token for a user
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Extract token from request (header or query)
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (req.headers['x-admin-token']) return req.headers['x-admin-token'];
  if (req.headers['x-kitchen-token']) return req.headers['x-kitchen-token'];
  if (req.query && req.query.token) return req.query.token;
  return null;
}

// Verify token and return payload
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Validate admin token
function validateAdminToken(token) {
  const payload = verifyToken(token);
  return payload && payload.role === 'admin';
}

// Validate kitchen token
function validateKitchenToken(token) {
  const payload = verifyToken(token);
  return payload && payload.role === 'kitchen';
}

function getStaffRole(token) {
  const payload = verifyToken(token);
  return payload ? payload.role : null;
}

// Secure compare for table tokens (keeps using old method)
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function validateTableToken(token, expectedToken) {
  return Boolean(token && expectedToken && secureCompare(token, expectedToken));
}

// Middleware: require admin token
function requireAdmin(req, res, next) {
  const token = extractToken(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Admin token required' });
  }
  next();
}

// Middleware: require kitchen token
function requireKitchen(req, res, next) {
  const token = extractToken(req);
  if (!validateKitchenToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Kitchen token required' });
  }
  next();
}

// Middleware: require either admin OR kitchen token
function requireStaff(req, res, next) {
  const token = extractToken(req);
  const role = getStaffRole(token);
  if (role === 'admin' || role === 'kitchen') {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Staff token required' });
}

// Socket.io middleware for admin namespace
function adminSocketMiddleware(socket, next) {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!validateAdminToken(token)) {
    return next(new Error('Unauthorized: Admin token required'));
  }
  socket.userRole = 'admin';
  next();
}

// Socket.io middleware for kitchen namespace
function kitchenSocketMiddleware(socket, next) {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!validateKitchenToken(token)) {
    return next(new Error('Unauthorized: Kitchen token required'));
  }
  socket.userRole = 'kitchen';
  next();
}

// Socket.io middleware for any staff
function staffSocketMiddleware(socket, next) {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  const role = getStaffRole(token);
  if (role === 'admin' || role === 'kitchen') {
    socket.userRole = role;
    return next();
  }
  next(new Error('Unauthorized: Staff token required'));
}

module.exports = {
  generateToken,
  verifyToken,
  validateAdminToken,
  validateKitchenToken,
  getStaffRole,
  validateTableToken,
  extractToken,
  requireAdmin,
  requireKitchen,
  requireStaff,
  adminSocketMiddleware,
  kitchenSocketMiddleware,
  staffSocketMiddleware,
};