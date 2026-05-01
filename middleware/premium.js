const User = require('../models/User');

/**
 * Middleware to check if user has premium access (pro or enterprise plan)
 */
const requirePremium = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.isPremium) {
      return res.status(403).json({ 
        success: false, 
        message: 'Premium subscription required. Please upgrade to Pro or Enterprise plan.' 
      });
    }
    
    next();
  } catch (err) {
    console.error('Premium check error:', err);
    res.status(500).json({ success: false, message: 'Could not verify subscription status' });
  }
};

/**
 * Middleware to check if user can access secret group
 */
const requireSecretGroupAccess = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (!user.canAccessSecretGroup) {
      return res.status(403).json({ 
        success: false, 
        message: 'Secret group access requires Pro or Enterprise subscription.' 
      });
    }
    
    next();
  } catch (err) {
    console.error('Secret group access check error:', err);
    res.status(500).json({ success: false, message: 'Could not verify access permissions' });
  }
};

module.exports = { requirePremium, requireSecretGroupAccess };
