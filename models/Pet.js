const mongoose = require('mongoose');

const petSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  species: {
    type: String,
    required: true,
    enum: ['dog', 'cat', 'bird', 'rabbit', 'other'],
  },
  breed:  String,
  age:    String,
  gender: {
    type: String,
    enum: ['male', 'female', 'unknown'],
  },
  color:  String,
  photos: [String], // Cloudinary HTTPS URLs

  // ── Location ───────────────────────────────────────────────
  // NO defaults on type — prevents geo index crash on incomplete objects
  location: {
    type: {
      type: String,
      enum: ['Point'],
      // ← no default
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
    },
  },
  address: String,
  city:    String,
  country: String,

  // ── Lost Mode fields ───────────────────────────────────────
  lastSeenAddress: String,
  lostAt: Date,

  // ── Status ─────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['lost', 'found', 'available', 'pending', 'adopted'],
    default: 'available',
  },

  // ── Priority ───────────────────────────────────────────────
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },

  // ── Secret group ───────────────────────────────────────────
  isSecretGroup: {
    type: Boolean,
    default: false,
  },

  // ── Reported by ────────────────────────────────────────────
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Contact info ───────────────────────────────────────────
  contactPhone: String,
  contactEmail: String,

  // ── Description ────────────────────────────────────────────
  description: String,

  // ── Date lost / found ──────────────────────────────────────
  dateLost:  Date,
  dateFound: Date,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ── Indexes ────────────────────────────────────────────────────
// sparse:true — skips pets with no location (prevents geo index crash)
petSchema.index({ location: '2dsphere' }, { sparse: true });
petSchema.index({ priority: 1, isSecretGroup: 1 });
petSchema.index({ status: 1 });

// ── Auto-update timestamp ──────────────────────────────────────
petSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Pet', petSchema);
