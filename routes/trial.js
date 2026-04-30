const express = require("express");
const User = require("../models/User");
const { authenticate } = require("../middleware/authenticate");
const { sendEmail } = require("../services/email");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ── GET /api/trial/status ─────────────────────────────────────
/**
 * Returns the caller's current trial/subscription status.
 * Used by the frontend to gate features and show upgrade prompts.
 */
router.get("/status", async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const now = new Date();

    const payload = {
      plan: user.plan,
      hasAccess: user.hasAccess,
      isTrialActive: user.isTrialActive,
      trialDaysRemaining: user.trialDaysRemaining,
      trialStartedAt: user.trialStartedAt,
      trialEndsAt: user.trialEndsAt,
      trialExtensions: user.trialExtensions,
      subscribedAt: user.subscribedAt,
      subscriptionEndsAt: user.subscriptionEndsAt,
      // Convenience flags for the frontend
      isExpired: user.plan === "expired",
      isSubscribed: ["basic", "pro", "enterprise"].includes(user.plan),
      isSubscriptionExpired:
        ["basic", "pro", "enterprise"].includes(user.plan) &&
        user.subscriptionEndsAt != null &&
        now > user.subscriptionEndsAt,
      // Nudge: show upgrade banner when ≤ 3 days left
      showUpgradeBanner: user.plan === "trial" && user.trialDaysRemaining <= 3,
    };

    res.json({ success: true, trial: payload });
  } catch (err) {
    console.error("Trial status error:", err);
    res.status(500).json({ success: false, message: "Could not retrieve trial status." });
  }
});

// ── POST /api/trial/extend ────────────────────────────────────
/**
 * Extends a user's trial by up to 3 days.
 * In production: gate this behind admin role or support tooling.
 * Max 2 extensions enforced on the model.
 */
router.post("/extend", async (req, res) => {
  try {
    const { days = 3, userId } = req.body;

    // Allow admins to extend any user; regular users can only extend their own
    const targetId = req.user.role === "admin" && userId ? userId : req.user.sub;
    const user = await User.findById(targetId);

    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.plan !== "trial") {
      return res.status(400).json({ success: false, message: "Trial extension only applies to trial accounts." });
    }

    await user.extendTrial(Number(days));

    res.json({
      success: true,
      message: `Trial extended by ${days} day(s).`,
      trialEndsAt: user.trialEndsAt,
      trialDaysRemaining: user.trialDaysRemaining,
      extensionsUsed: user.trialExtensions,
    });
  } catch (err) {
    // Model throws a descriptive error when max extensions exceeded
    if (err.message.includes("maximum")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("Extend trial error:", err);
    res.status(500).json({ success: false, message: "Could not extend trial." });
  }
});

// ── POST /api/trial/convert ───────────────────────────────────
/**
 * Simulates plan upgrade (in prod, called from Stripe webhook instead).
 * Transitions user from trial → paid plan.
 */
router.post("/convert", async (req, res) => {
  try {
    const { plan, stripeCustomerId, stripeSubscriptionId, subscriptionEndsAt } = req.body;

    const validPlans = ["basic", "pro", "enterprise"];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan. Must be one of: ${validPlans.join(", ")}.`,
      });
    }

    const user = await User.findById(req.user.sub).select("+stripeCustomerId +stripeSubscriptionId");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    await user.activateSubscription({
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt) : null,
    });

    // Send welcome-to-paid email
    sendEmail({
      to: user.email,
      subject: "Welcome to Pet Finder " + capitalize(plan) + "!",
      template: "subscriptionConfirmed",
      data: { name: user.name, plan },
    }).catch(console.error);

    res.json({
      success: true,
      message: `Account upgraded to ${plan}.`,
      plan: user.plan,
      subscribedAt: user.subscribedAt,
    });
  } catch (err) {
    console.error("Convert trial error:", err);
    res.status(500).json({ success: false, message: "Could not convert trial." });
  }
});

// ── POST /api/trial/cancel ────────────────────────────────────
/**
 * Lets a user voluntarily expire their trial early (e.g. "I don't want to upgrade").
 * Sets plan to "expired" immediately.
 */
router.post("/cancel", async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (user.plan !== "trial") {
      return res.status(400).json({ success: false, message: "Only trial accounts can be cancelled here." });
    }

    await user.expireTrial();

    res.json({
      success: true,
      message: "Trial cancelled. Your account is now in a limited state.",
      plan: "expired",
    });
  } catch (err) {
    console.error("Cancel trial error:", err);
    res.status(500).json({ success: false, message: "Could not cancel trial." });
  }
});

// ── Helpers ───────────────────────────────────────────────────
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = router;
