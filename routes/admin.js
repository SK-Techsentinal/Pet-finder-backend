const express  = require('express');
const jwt      = require('jsonwebtoken');
const Feedback = require('../models/Feedback');
const User     = require('../models/User');
const Pet      = require('../models/Pet');
const { sendEmail } = require('../services/email');

const router = express.Router();

// ── Admin Auth Middleware ─────────────────────────────────────
function adminAuth(req, res, next) {
  try {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Admin token required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET + '_ADMIN');
    if (decoded.role !== 'admin') throw new Error('Not admin');
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired admin session' });
  }
}

// ── POST /api/admin/login ─────────────────────────────────────
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Incorrect admin password' });
  }
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET + '_ADMIN', { expiresIn: '12h' });
  res.json({ success: true, token });
});

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalUsers, totalPets, totalFeedback, pendingFeedback, lostPets, trialUsers] =
      await Promise.all([
        User.countDocuments(),
        Pet.countDocuments(),
        Feedback.countDocuments(),
        Feedback.countDocuments({ status: 'pending' }),
        Pet.countDocuments({ status: 'lost' }),
        User.countDocuments({ plan: 'trial' }),
      ]);
    res.json({ success: true, stats: { totalUsers, totalPets, totalFeedback, pendingFeedback, lostPets, trialUsers } });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch stats' });
  }
});

// ── GET /api/admin/feedback ───────────────────────────────────
router.get('/feedback', adminAuth, async (req, res) => {
  try {
    const { status, priority } = req.query;
    const query = {};
    if (status)   query.status   = status;
    if (priority) query.priority = priority;

    const feedback = await Feedback.find(query)
      .populate('user', 'name email plan')
      .sort({ createdAt: -1 });

    res.json({ success: true, feedback });
  } catch (err) {
    console.error('Admin feedback error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch feedback' });
  }
});

// ── POST /api/admin/feedback/:id/reply ────────────────────────
router.post('/feedback/:id/reply', adminAuth, async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ success: false, message: 'Reply message required' });

    const feedback = await Feedback.findById(req.params.id).populate('user', 'name email');
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found' });

    // Send reply email to the user
    await sendEmail({
      to:       feedback.user.email,
      subject:  `Re: ${feedback.subject} — PawFind Support`,
      template: 'adminReply',
      data: {
        name:            feedback.user.name,
        originalSubject: feedback.subject,
        originalMessage: feedback.message,
        adminReply:      reply,
      },
    });

    // Save reply and mark as completed
    feedback.adminReply     = reply;
    feedback.adminRepliedAt = new Date();
    feedback.status         = 'completed';
    await feedback.save();

    res.json({ success: true, message: 'Reply sent successfully' });
  } catch (err) {
    console.error('Admin reply error:', err);
    res.status(500).json({ success: false, message: 'Could not send reply' });
  }
});

// ── PATCH /api/admin/feedback/:id/status ─────────────────────
router.patch('/feedback/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'reviewed', 'in_progress', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const feedback = await Feedback.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!feedback) return res.status(404).json({ success: false, message: 'Feedback not found' });
    res.json({ success: true, feedback });
  } catch (err) {
    console.error('Admin status update error:', err);
    res.status(500).json({ success: false, message: 'Could not update status' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find()
      .select('name email plan isActive trialEndsAt subscriptionEndsAt createdAt lastLoginAt loginCount')
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch users' });
  }
});

// ── GET /api/admin/pets ───────────────────────────────────────
router.get('/pets', adminAuth, async (req, res) => {
  try {
    const pets = await Pet.find()
      .populate('reportedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, pets });
  } catch (err) {
    console.error('Admin pets error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch pets' });
  }
});

module.exports = router;
