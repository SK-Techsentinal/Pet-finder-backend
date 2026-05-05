const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/authenticate');
const nodemailer = require('nodemailer');

// GET tracker status for a pet
router.get('/status/:petId', authenticate, async (req, res) => {
  try {
    // If you have a Tracker model:
    // const tracker = await Tracker.findOne({ petId: req.params.petId });
    // res.json({ lastSignal: tracker?.lastSignal || null });

    // Temporary placeholder until you add a Tracker model:
    res.json({ lastSignal: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST emergency alert when tracker disconnects
router.post('/alert', authenticate, async (req, res) => {
  try {
    const { petName, lastSignalMinutesAgo } = req.body;
    const ownerEmail = req.user.email;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: ownerEmail,
      subject: `🚨 URGENT: ${petName}'s GPS tracker disconnected!`,
      html: `
        <h2>🚨 Tracker Disconnected Alert</h2>
        <p>Your pet <strong>${petName}</strong> has not sent a GPS signal 
        for <strong>${lastSignalMinutesAgo} minutes</strong>.</p>
        <p>Please check on your pet immediately.</p>
      `,
    });

    res.json({ ok: true, message: 'Emergency alert sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
