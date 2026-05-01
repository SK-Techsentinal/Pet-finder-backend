const mongoose = require('mongoose');

const petSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  species: {
    type: String,
    required: true,
    enum: ['dog', 'cat', 'bird', 'other'],
  },
  breed: String,
  age: String,
  gender: {
    type: String,
    enum: ['male', 'female', 'unknown'],
  },
  color: String,
  photos: [String],
  
  // Location
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  address: String,
  city: String,
  country: String,
  
  // Status
  status: {
    type: String,
    enum: ['lost', 'found', 'adopted'],
    default: 'lost',
  },
  
  // Priority level (for secret group feature)
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  
  // Secret group - only visible to premium users
  isSecretGroup: {
    type: Boolean,
    default: false,
  },
  
  // Reported by
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Contact info
  contactPhone: String,
  contactEmail: String,
  
  // Description
  description: String,
  
  // Date lost/found
  dateLost: Date,
  dateFound: Date,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for geospatial queries
petSchema.index({ location: '2dsphere' });

// Index for priority-based queries
petSchema.index({ priority: 1, isSecretGroup: 1 });

// Update timestamp on save
petSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Pet', petSchema);
