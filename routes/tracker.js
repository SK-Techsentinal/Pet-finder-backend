const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { sendEmail }    = require('../services/email');
const Pet  = require('../models/Pet');
const User = require('../models/User');

router.use(authenticate);

// GET /api/tracker/status/:petId
router.get('/status/:petId', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.petId).select('updatedAt');
    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });
    res.json({ success: true, lastSignal: pet.updatedAt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tracker/alert
router.post('/alert', async (req, res) => {
  try {
    const { petName, lastSignalMinutesAgo } = req.body;
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await sendEmail({
      to: user.email,
      subject: `🚨 URGENT: ${petName}'s GPS tracker disconnected!`,
      template: 'trackerAlert',
      data: { name: user.name, petName, lastSignalMinutesAgo },
    });

    res.json({ success: true, message: 'Emergency alert sent' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
