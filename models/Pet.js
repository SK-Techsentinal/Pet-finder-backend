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
  breed: String,
  age:   String,
  gender: {
    type: String,
    enum: ['male', 'female', 'unknown'],
  },
  color:  String,
  photos: [String],

  // ── Location ───────────────────────────────────────────────
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  address: String,
  city:    String,
  country: String,

  // ── Lost Mode fields ───────────────────────────────────────
  // lastSeenAddress: human-readable address where pet was last seen
  // lostAt: timestamp when the pet was marked as lost
  lastSeenAddress: String,
  lostAt: Date,

  // ── Status ─────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['lost', 'found', 'available', 'pending', 'adopted'],
    default: 'available',
  },

  // ── Priority (for secret group feature) ───────────────────
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },

  // ── Secret group — only visible to premium users ──────────
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

  // ── Timestamps ─────────────────────────────────────────────
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ── Indexes ────────────────────────────────────────────────────

// Geospatial index — required for $near queries (map + nearby pets)
petSchema.index({ location: '2dsphere' });

// Priority-based queries for secret group
petSchema.index({ priority: 1, isSecretGroup: 1 });

// Status filter queries
petSchema.index({ status: 1 });

// ── Auto-update timestamp ──────────────────────────────────────
petSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Pet', petSchema);
