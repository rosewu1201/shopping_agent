const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { log } = require('../utils/logger');
const config = require('../config');

const USERS_FILE = path.join(__dirname, 'users.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');

// ─── File helpers ───

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    log('AUTH', `Failed to load ${path.basename(filePath)}: ${e.message}`);
    return {};
  }
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    log('AUTH', `Failed to save ${path.basename(filePath)}: ${e.message}`);
  }
}

// ─── Password hashing (SHA-256 with salt) ───

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const result = hashPassword(password, salt);
  return result.hash === hash;
}

// ─── Verification code ───

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

// ─── JWT helpers ───

function generateToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name, role: user.role || 'user' },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// ─── User operations ───

function findUserByEmail(email) {
  const users = loadJSON(USERS_FILE);
  const key = email.toLowerCase().trim();
  return users[key] || null;
}

function createPendingUser(name, email, password) {
  const pending = loadJSON(PENDING_FILE);
  const key = email.toLowerCase().trim();

  // Check if already a verified user
  const existing = findUserByEmail(email);
  if (existing && existing.verified) {
    return { error: 'An account with this email already exists. Please log in.' };
  }

  const { hash, salt } = hashPassword(password);
  const code = generateVerificationCode();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  pending[key] = {
    name: name.trim(),
    email: key,
    passwordHash: hash,
    passwordSalt: salt,
    verificationCode: code,
    codeExpiresAt: expiresAt,
    createdAt: Date.now(),
    attempts: 0,
  };

  saveJSON(PENDING_FILE, pending);
  log('AUTH', `Pending user created: ${key} (code: ${code})`);

  return { success: true, code, email: key };
}

function verifyUser(email, code) {
  const pending = loadJSON(PENDING_FILE);
  const key = email.toLowerCase().trim();
  const entry = pending[key];

  if (!entry) {
    return { error: 'No pending verification found. Please sign up again.' };
  }

  // Check expiry
  if (Date.now() > entry.codeExpiresAt) {
    delete pending[key];
    saveJSON(PENDING_FILE, pending);
    return { error: 'Verification code has expired. Please sign up again.' };
  }

  // Check attempts (max 5)
  if (entry.attempts >= 5) {
    delete pending[key];
    saveJSON(PENDING_FILE, pending);
    return { error: 'Too many failed attempts. Please sign up again.' };
  }

  // Check code
  if (entry.verificationCode !== code.trim()) {
    entry.attempts++;
    saveJSON(PENDING_FILE, pending);
    return { error: `Invalid code. ${5 - entry.attempts} attempt(s) remaining.` };
  }

  // Move to verified users
  const users = loadJSON(USERS_FILE);
  const role = config.ADMIN_EMAILS.includes(key) ? 'admin' : 'user';
  users[key] = {
    name: entry.name,
    email: entry.email,
    passwordHash: entry.passwordHash,
    passwordSalt: entry.passwordSalt,
    verified: true,
    role,
    createdAt: entry.createdAt,
    verifiedAt: Date.now(),
  };
  saveJSON(USERS_FILE, users);

  // Clean up pending
  delete pending[key];
  saveJSON(PENDING_FILE, pending);

  const userObj = { name: entry.name, email: entry.email, role };
  const token = generateToken(userObj);
  log('AUTH', `User verified: ${key}`);
  return { success: true, user: userObj, token };
}

function loginUser(email, password) {
  const user = findUserByEmail(email);

  if (!user) {
    return { error: 'No account found with this email. Please sign up first.' };
  }

  if (!user.verified) {
    return { error: 'Your account has not been verified. Please check your email for the verification code.' };
  }

  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return { error: 'Incorrect password. Please try again.' };
  }

  const userObj = { name: user.name, email: user.email, role: user.role || 'user' };
  const token = generateToken(userObj);
  log('AUTH', `User logged in: ${email.toLowerCase().trim()}`);
  return { success: true, user: userObj, token };
}

function resendCode(email) {
  const pending = loadJSON(PENDING_FILE);
  const key = email.toLowerCase().trim();
  const entry = pending[key];

  if (!entry) {
    return { error: 'No pending verification found. Please sign up again.' };
  }

  // Generate new code
  const code = generateVerificationCode();
  entry.verificationCode = code;
  entry.codeExpiresAt = Date.now() + 15 * 60 * 1000;
  entry.attempts = 0;
  saveJSON(PENDING_FILE, pending);

  log('AUTH', `Verification code resent for: ${key} (code: ${code})`);
  return { success: true, code, email: key };
}

// ─── Admin operations ───

function getAllUsers() {
  const users = loadJSON(USERS_FILE);
  return Object.values(users).map(u => ({
    name: u.name,
    email: u.email,
    role: u.role || 'user',
    verified: u.verified || false,
    createdAt: u.createdAt,
    verifiedAt: u.verifiedAt,
  }));
}

function getPendingUsers() {
  const pending = loadJSON(PENDING_FILE);
  return Object.values(pending).map(u => ({
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    codeExpiresAt: u.codeExpiresAt,
  }));
}

function updateUserRole(email, role) {
  const users = loadJSON(USERS_FILE);
  const key = email.toLowerCase().trim();
  if (!users[key]) return { error: 'User not found.' };
  if (!['user', 'admin'].includes(role)) return { error: 'Invalid role. Must be "user" or "admin".' };
  users[key].role = role;
  saveJSON(USERS_FILE, users);
  log('AUTH', `Role updated: ${key} → ${role}`);
  return { success: true, email: key, role };
}

function deleteUser(email) {
  const users = loadJSON(USERS_FILE);
  const key = email.toLowerCase().trim();
  if (!users[key]) return { error: 'User not found.' };
  const name = users[key].name;
  delete users[key];
  saveJSON(USERS_FILE, users);
  log('AUTH', `User deleted: ${key} (${name})`);
  return { success: true, email: key };
}

// ─── Auth middleware ───

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
  req.user = decoded;
  next();
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = {
  findUserByEmail,
  createPendingUser,
  verifyUser,
  loginUser,
  resendCode,
  generateToken,
  verifyToken,
  getAllUsers,
  getPendingUsers,
  updateUserRole,
  deleteUser,
  authMiddleware,
  adminMiddleware,
};
