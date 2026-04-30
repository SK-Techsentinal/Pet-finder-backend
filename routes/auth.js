const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authenticate } = require("../middleware/authenticate");
const { sendEmail } = require("../services/email");

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function sendTokenResponse(user, statusCode, res) {
  const token = signToken(user._id);

  // Strip sensitive fields before sending
  const safeUser = user.toObject();
  delete safeUser.password;
  delete safeUser.emailVerificationToken;
  delete safeUser.passwordResetToken;
  delete safeUser.passwordResetExpiresAt;

  res.status(statusCode).json({
    success: true,
    token,
    user: safeUser,
  });
}

// ── POST /api/auth/register ───────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: "An account with that email already exists." });
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      name,
      email,
      password,
      emailVerificationToken: crypto.createHash("sha256").update(verificationToken).digest("hex"),
    });

    // Start trial on registration
    await user.startTrial();

    // Fire-and-forget verification email
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    sendEmail({
      to: user.email,
      subject: "Verify your Pet Finder account",
      template: "verifyEmail",
      data: { name: user.name, verifyUrl, trialDays: 7 },
    }).catch(console.error);

    sendTokenResponse(user, 201, res);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Email already in use." });
    }
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Registration failed. Please try again." });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // Explicitly select password (excluded by default in schema)
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "This account has been deactivated. Please contact support." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    await user.recordLogin();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).populate("savedPets", "name species breed photos");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        isTrialActive: user.isTrialActive,
        trialDaysRemaining: user.trialDaysRemaining,
        hasAccess: user.hasAccess,
      },
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ success: false, message: "Could not fetch user." });
  }
});

// ── POST /api/auth/verify-email ───────────────────────────────
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Token is required." });

    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ emailVerificationToken: hashed }).select("+emailVerificationToken");

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification token." });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    await user.save();

    res.json({ success: true, message: "Email verified successfully." });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ success: false, message: "Email verification failed." });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always respond 200 to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    sendEmail({
      to: user.email,
      subject: "Reset your Pet Finder password",
      template: "resetPassword",
      data: { name: user.name, resetUrl },
    }).catch(console.error);

    res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Could not process request." });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Token and new password are required." });
    }

    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpiresAt: { $gt: Date.now() },
    }).select("+passwordResetToken +passwordResetExpiresAt");

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token." });
    }

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    res.json({ success: true, message: "Password updated successfully. Please log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Password reset failed." });
  }
});

module.exports = router;
