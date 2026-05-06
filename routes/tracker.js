const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { sendEmail }    = require('../services/email');
const Pet  = require('../models/Pet');
const User = require('../models/User');

// All tracker routes require authentication
router.use(authenticate);

// ── GET /api/tracker/status/:petId ───────────────────────────
/**
 * Returns the last known signal time for a pet's tracker.
 * Frontend polls this every 60 seconds and fires a disconnect
 * alert if no signal has been received for 10+ minutes.
 */
router.get('/status/:petId', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.petId).select('updatedAt name');
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found' });
    }
    res.json({ success: true, lastSignal: pet.updatedAt, petName: pet.name });
  } catch (err) {
    console.error('Tracker status error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/tracker/alert ───────────────────────────────────
/**
 * Called by the frontend when a pet's tracker has been silent
 * for more than 10 minutes. Sends an emergency email to the owner.
 */
router.post('/alert', async (req, res) => {
  try {
    const { petName, lastSignalMinutesAgo, petId } = req.body;

    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await sendEmail({
      to: user.email,
      subject: `🚨 URGENT: ${petName}'s GPS tracker disconnected!`,
      template: 'trackerAlert',
      data: {
        name: user.name,
        petName,
        lastSignalMinutesAgo,
      },
    });

    console.log(`[tracker] Emergency alert sent to ${user.email} for pet: ${petName}`);
    res.json({ success: true, message: 'Emergency alert sent to owner' });
  } catch (err) {
    console.error('Tracker alert error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
