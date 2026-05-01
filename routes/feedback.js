const express = require("express");
const Feedback = require("../models/Feedback");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ── POST /api/feedback ───────────────────────────────────────
/**
 * Submit feedback or feature request
 */
router.post("/", async (req, res) => {
  try {
    const { type, subject, message, priority } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "Subject and message are required." });
    }

    const feedback = await Feedback.create({
      user: req.user.sub,
      type: type || 'general_feedback',
      subject,
      message,
      priority: priority || 'medium',
    });

    res.status(201).json({ success: true, feedback });
  } catch (err) {
    console.error("Create feedback error:", err);
    res.status(500).json({ success: false, message: "Could not submit feedback." });
  }
});

// ── GET /api/feedback ────────────────────────────────────────
/**
 * Get all feedback (admin only - for now returns user's own feedback)
 */
router.get("/", async (req, res) => {
  try {
    const feedback = await Feedback.find({ user: req.user.sub })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, feedback });
  } catch (err) {
    console.error("Get feedback error:", err);
    res.status(500).json({ success: false, message: "Could not fetch feedback." });
  }
});

// ── GET /api/feedback/:id ───────────────────────────────────
/**
 * Get specific feedback
 */
router.get("/:id", async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id).populate('user', 'name email');
    
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found." });
    }

    // Check if user owns this feedback or is admin
    if (feedback.user._id.toString() !== req.user.sub) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    res.json({ success: true, feedback });
  } catch (err) {
    console.error("Get feedback error:", err);
    res.status(500).json({ success: false, message: "Could not fetch feedback." });
  }
});

module.exports = router;
