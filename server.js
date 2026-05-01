require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const trialRoutes = require("./routes/trial");
const stripeRoutes = require("./routes/stripe");
const { startTrialCronJobs } = require("./services/trialCron");

const app = express();

// ── CORS ──────────────────────────────────────────────────────
// ALLOWED_ORIGINS is a comma-separated list in your .env so you
// can whitelist localhost, your Render URL, and your mobile app
// host all at once without changing code.
//
// Example .env value:
//   ALLOWED_ORIGINS=http://localhost:3000,https://pet-finder.onrender.com,http://localhost:8081
//
// Mobile (Expo Go / bare RN) sends requests from the device IP,
// not a browser origin, so we also allow requests that carry NO
// Origin header at all (the `!origin` branch below).

const RAW_ORIGINS = process.env.ALLOWED_ORIGINS ?? process.env.CLIENT_URL ?? "http://localhost:3000";
const ALLOWED_ORIGINS = RAW_ORIGINS.split(",").map(o => o.trim()).filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no Origin (native mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
      }
    },
    credentials: true, // required for cookies / Authorization headers
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Security ──────────────────────────────────────────────────
app.use(helmet());

// IMPORTANT: Stripe webhook needs the raw body — register BEFORE express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10kb" }));

// Rate limiting — stricter on auth endpoints
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
});

app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/trial", trialRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/pets", petRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok", ts: new Date() }));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Something went wrong." : err.message,
  });
});

// ── Database & Boot ───────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    startTrialCronJobs();

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
}

start();

module.exports = app; // for testing
