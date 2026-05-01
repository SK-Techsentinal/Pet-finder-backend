const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  phone: String,
  profileImage: String,
  
  // Email verification
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: String,
  
  // Password reset
  passwordResetToken: String,
  passwordResetExpiresAt: Date,
  
  // Account status
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Subscription/Trial info
  plan: {
    type: String,
    enum: ['free', 'trial', 'basic', 'pro', 'enterprise', 'expired'],
    default: 'free',
  },
  trialStartedAt: Date,
  trialEndsAt: Date,
  trialExtensions: {
    type: Number,
    default: 0,
  },
  subscribedAt: Date,
  subscriptionEndsAt: Date,
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripeSubscriptionStatus: String, // active, past_due, canceled, unpaid
  
  // Login tracking
  lastLoginAt: Date,
  loginCount: {
    type: Number,
    default: 0,
  },
  
  // Saved pets (for future feature)
  savedPets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pet',
  }],
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ── Virtuals ─────────────────────────────────────────────────────

userSchema.virtual('isTrialActive').get(function() {
  if (this.plan !== 'trial' || !this.trialEndsAt) return false;
  return new Date() < this.trialEndsAt;
});

userSchema.virtual('trialDaysRemaining').get(function() {
  if (!this.trialEndsAt) return 0;
  const diff = this.trialEndsAt - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

userSchema.virtual('hasAccess').get(function() {
  if (['basic', 'pro', 'enterprise'].includes(this.plan)) {
    if (this.subscriptionEndsAt && new Date() > this.subscriptionEndsAt) {
      return false;
    }
    return true;
  }
  return this.isTrialActive;
});

userSchema.virtual('isPremium').get(function() {
  return ['pro', 'enterprise'].includes(this.plan) && this.hasAccess;
});

userSchema.virtual('canAccessSecretGroup').get(function() {
  return this.isPremium;
});

// ── Password hashing ───────────────────────────────────────────────

userSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  // Only hash password if it's modified
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance Methods ───────────────────────────────────────────────

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.recordLogin = async function() {
  this.lastLoginAt = new Date();
  this.loginCount = (this.loginCount || 0) + 1;
  await this.save();
};

userSchema.methods.startTrial = async function() {
  this.plan = 'trial';
  this.trialStartedAt = new Date();
  this.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  this.trialExtensions = 0;
  await this.save();
};

userSchema.methods.extendTrial = async function(days = 3) {
  const MAX_EXTENSIONS = 2;
  
  if (this.trialExtensions >= MAX_EXTENSIONS) {
    throw new Error('Maximum trial extensions reached (2).');
  }
  
  if (!this.trialEndsAt) {
    this.trialEndsAt = new Date();
  }
  
  this.trialEndsAt = new Date(this.trialEndsAt.getTime() + days * 24 * 60 * 60 * 1000);
  this.trialExtensions += 1;
  await this.save();
};

userSchema.methods.expireTrial = async function() {
  this.plan = 'expired';
  this.trialEndsAt = new Date();
  await this.save();
};

userSchema.methods.activateSubscription = async function({
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  subscriptionEndsAt,
  subscriptionStatus = 'active',
}) {
  this.plan = plan;
  this.subscribedAt = new Date();
  this.subscriptionEndsAt = subscriptionEndsAt;
  this.stripeSubscriptionStatus = subscriptionStatus;
  
  if (stripeCustomerId) this.stripeCustomerId = stripeCustomerId;
  if (stripeSubscriptionId) this.stripeSubscriptionId = stripeSubscriptionId;
  
  await this.save();
};

userSchema.methods.updateSubscriptionStatus = async function(status, subscriptionEndsAt) {
  this.stripeSubscriptionStatus = status;
  if (subscriptionEndsAt) {
    this.subscriptionEndsAt = new Date(subscriptionEndsAt);
  }
  
  // Handle subscription cancellation
  if (status === 'canceled' || status === 'unpaid') {
    this.plan = 'free';
  }
  
  await this.save();
};

// ── Static Methods ─────────────────────────────────────────────────

userSchema.statics.findExpiredTrials = async function() {
  return this.find({
    plan: 'trial',
    trialEndsAt: { $lt: new Date() },
  });
};

module.exports = mongoose.model('User', userSchema);
