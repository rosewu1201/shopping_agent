const express = require('express');
const router = express.Router();
const {
  authMiddleware,
  adminMiddleware,
  getAllUsers,
  getPendingUsers,
  updateUserRole,
  deleteUser,
} = require('../auth/userStore');
const { log } = require('../utils/logger');

// All admin routes require authentication + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/users — list all verified users
router.get('/users', (req, res) => {
  const users = getAllUsers();
  res.json({ users });
});

// GET /api/admin/pending — list pending (unverified) users
router.get('/pending', (req, res) => {
  const pending = getPendingUsers();
  res.json({ pending });
});

// GET /api/admin/stats — basic stats
router.get('/stats', (req, res) => {
  const users = getAllUsers();
  const pending = getPendingUsers();
  const admins = users.filter(u => u.role === 'admin');
  const regularUsers = users.filter(u => u.role === 'user');

  res.json({
    totalVerified: users.length,
    totalPending: pending.length,
    admins: admins.length,
    regularUsers: regularUsers.length,
  });
});

// PUT /api/admin/users/:email/role — update user role
router.put('/users/:email/role', (req, res) => {
  const { role } = req.body || {};
  const email = decodeURIComponent(req.params.email);

  if (!role) {
    return res.status(400).json({ error: 'Role is required.' });
  }

  // Prevent removing own admin role
  if (email.toLowerCase() === req.user.email.toLowerCase() && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own admin role.' });
  }

  const result = updateUserRole(email, role);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  log('ADMIN', `${req.user.email} changed role of ${email} to ${role}`);
  res.json(result);
});

// DELETE /api/admin/users/:email — delete a user
router.delete('/users/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);

  // Prevent self-deletion
  if (email.toLowerCase() === req.user.email.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const result = deleteUser(email);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  log('ADMIN', `${req.user.email} deleted user ${email}`);
  res.json(result);
});

module.exports = router;
