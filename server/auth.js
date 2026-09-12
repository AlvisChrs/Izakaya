require('dotenv').config();
const crypto = require('crypto');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const KITCHEN_TOKEN = process.env.KITCHEN_TOKEN;

if (!ADMIN_TOKEN || !KITCHEN_TOKEN) {
  throw new Error('ADMIN_TOKEN and KITCHEN_TOKEN must be configured before starting the server');
}

// Secure compare to prevent timing attacks
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Validate admin token
function validateAdminToken(token) {
  return token && secureCompare(token, ADMIN_TOKEN);
}

// Validate kitchen token
function validateKitchenToken(token) {
  return token && secureCompare(token, KITCHEN_TOKEN);
}

function getStaffRole(token) {
  if (validateAdminToken(token)) return 'admin';
  if (validateKitchenToken(token)) return 'kitchen';
  return null;
}

function validateTableToken(token, expectedToken) {
  return Boolean(token && expectedToken && secureCompare(token, expectedToken));
}

// Extract token from request (header or query)
function extractToken(req) {
  // Check Authorization header: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Check custom header
  if (req.headers['x-admin-token']) return req.headers['x-admin-token'];
  if (req.headers['x-kitchen-token']) return req.headers['x-kitchen-token'];
  // Check query param (for WebSocket handshake)
  if (req.query && req.query.token) return req.query.token;
  return null;
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
  if (validateAdminToken(token) || validateKitchenToken(token)) {
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
  if (validateAdminToken(token)) {
    socket.userRole = 'admin';
    return next();
  }
  if (validateKitchenToken(token)) {
    socket.userRole = 'kitchen';
    return next();
  }
  next(new Error('Unauthorized: Staff token required'));
}

module.exports = {
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
  ADMIN_TOKEN,
  KITCHEN_TOKEN,
};