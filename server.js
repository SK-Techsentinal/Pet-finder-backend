require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Route Imports
const authRoutes     = require("./routes/auth");
const trialRoutes    = require("./routes/trial");
const stripeRoutes   = require("./routes/stripe");
const petRoutes      = require("./routes/pets");
const feedbackRoutes = require("./routes/feedback");
const trackerRoutes  = require('./routes/tracker');
const publicRoutes   = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { startTrialCronJobs } = require("./services/trialCron");


const app = express();

// ── Trust Proxy (fixes rate-limit X-Forwarded-For warning on Render) ──
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:        ["*", "data:", "blob:"],
      connectSrc:    ["'self'", "https://pet-finder-backend-jkvi.onrender.com", "https://*.onrender.com"],
      mediaSrc:      ["'self'", "blob:", "data:"],
      workerSrc:     ["'self'", "blob:"],
      objectSrc:     ["'none'"],
      frameSrc:      ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://pet-finder-backend-jkvi.onrender.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.static('public'));

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date() }));

// Stripe webhook needs raw body, all others need JSON
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ── Rate Limiting ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Too many requests." },
});
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/trial",    trialRoutes);
app.use("/api/stripe",   stripeRoutes);
app.use("/api/pets",     petRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use('/api/tracker',  trackerRoutes);
app.use('/public',       publicRoutes);
app.use('/api/admin',    adminRoutes);

// ── Error Handling ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
  });
});

// ── Database & Startup ────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
    startTrialCronJobs();
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }
}

start();

module.exports = app;
