const express = require('express');
const router = express.Router();
const { createPendingUser, verifyUser, loginUser, resendCode } = require('../auth/userStore');
const { sendVerificationEmail } = require('../auth/emailService');
const { log } = require('../utils/logger');

// Rate limit tracking (simple in-memory)
const rateLimits = {};
function checkRateLimit(ip, action, maxPerMinute = 5) {
  const key = `${ip}:${action}`;
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = [];
  rateLimits[key] = rateLimits[key].filter(t => now - t < 60000);
  if (rateLimits[key].length >= maxPerMinute) return false;
  rateLimits[key].push(now);
  return true;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip, 'signup', 3)) {
    return res.status(429).json({ error: 'Too many sign-up attempts. Please wait a minute.' });
  }

  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }

  const result = createPendingUser(name, email, password);
  if (result.error) {
    return res.status(409).json({ error: result.error });
  }

  // Send verification email
  const emailResult = await sendVerificationEmail(email, result.code, name);

  if (emailResult.sent) {
    res.json({
      success: true,
      message: 'Verification code sent to your email. Please check your inbox.',
      needsVerification: true,
    });
  } else if (emailResult.reason === 'no_api_key') {
    // No email service configured — show code directly (dev/demo mode)
    res.json({
      success: true,
      message: 'Verification code generated.',
      needsVerification: true,
      devCode: result.code, // Only sent when no email service is configured
    });
  } else {
    // Email sending failed but user was created — return code for display
    log('AUTH', `Email send failed for ${email}, showing code in response`);
    res.json({
      success: true,
      message: 'We could not send the verification email. Please use the code shown below.',
      needsVerification: true,
      devCode: result.code,
    });
  }
});

// POST /api/auth/verify
router.post('/verify', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip, 'verify', 10)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
  }

  const { email, code } = req.body || {};

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  const result = verifyUser(email, code);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    message: 'Email verified! You can now log in.',
    user: result.user,
    token: result.token,
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip, 'login', 5)) {
    return res.status(429).json({ error: 'Too many login attempts. Please wait a minute.' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const result = loginUser(email, password);
  if (result.error) {
    return res.status(401).json({ error: result.error });
  }

  res.json({
    success: true,
    user: result.user,
    token: result.token,
  });
});

// POST /api/auth/resend-code
router.post('/resend-code', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip, 'resend', 2)) {
    return res.status(429).json({ error: 'Please wait before requesting another code.' });
  }

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const result = resendCode(email);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const emailResult = await sendVerificationEmail(email, result.code);

  if (emailResult.sent) {
    res.json({ success: true, message: 'New verification code sent to your email.' });
  } else if (emailResult.reason === 'no_api_key') {
    res.json({ success: true, message: 'New code generated.', devCode: result.code });
  } else {
    res.json({ success: true, message: 'Could not send email. Please use this code.', devCode: result.code });
  }
});

module.exports = router;
