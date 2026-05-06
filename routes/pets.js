const { sendAlertEmail } = require('../services/email');
const express = require('express');
const Pet  = require('../models/Pet');
const User = require('../models/User');
const { authenticate } = require('../middleware/authenticate');
const { requireSecretGroupAccess } = require('../middleware/premium');
const upload = require('../services/upload');

const router = express.Router();

// All pet routes require authentication
router.use(authenticate);

// ── POST /api/pets ───────────────────────────────────────────
/**
 * Report a new lost/found pet.
 * Frontend sends: name, species, breed, color, description,
 * address, location: { type, coordinates: [lng, lat] }
 */
router.post('/', upload.array('photos', 5), async (req, res) => {
  try {
    const {
      name,
      species,
      breed,
      age,
      gender,
      color,
      location,
      address,
      city,
      country,
      status,
      priority,
      isSecretGroup,
      contactPhone,
      contactEmail,
      description,
      dateLost,
      dateFound,
      lastSeenAddress,
    } = req.body;

    // Validate location — must be GeoJSON Point
    const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    if (
      !parsedLocation ||
      !parsedLocation.coordinates ||
      parsedLocation.coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid location coordinates required: { type: "Point", coordinates: [lng, lat] }',
      });
    }

    // Only premium users can set isSecretGroup
    const user = await User.findById(req.user.sub);
    if (isSecretGroup && !user.isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Secret group feature requires Pro or Enterprise subscription',
      });
    }

    // Handle photo uploads — convert buffer to base64
    const photoData =
      req.files && req.files.length > 0
        ? req.files.map(
            (file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
          )
        : [];

    const pet = await Pet.create({
      name,
      species,
      breed,
      age,
      gender,
      color,
      photos: photoData,
      location: parsedLocation,
      address,
      lastSeenAddress: lastSeenAddress || address,
      city,
      country,
      status: status || 'lost',
      priority: priority || 'medium',
      isSecretGroup: isSecretGroup || false,
      reportedBy: req.user.sub,
      contactPhone,
      contactEmail,
      description,
      dateLost,
      dateFound,
    });

    res.status(201).json({ success: true, pet });
  } catch (err) {
    console.error('Create pet error:', err);
    res.status(500).json({ success: false, message: 'Could not create pet report' });
  }
});

// ── GET /api/pets ────────────────────────────────────────────
/**
 * Get all pets (excluding secret group pets for non-premium users).
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    const query = user.canAccessSecretGroup ? {} : { isSecretGroup: false };

    if (req.query.status)   query.status   = req.query.status;
    if (req.query.species)  query.species  = req.query.species;
    if (req.query.priority) query.priority = req.query.priority;

    const pets = await Pet.find(query)
      .populate('reportedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error('Get pets error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch pets' });
  }
});

// ── GET /api/pets/nearby ─────────────────────────────────────
/**
 * Get pets near a GPS location (for map view).
 * Query params: lat, lng, maxDistance (meters, default 10km)
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
    }

    const user  = await User.findById(req.user.sub);
    const query = user.canAccessSecretGroup ? {} : { isSecretGroup: false };

    const pets = await Pet.find({
      ...query,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: parseInt(maxDistance),
        },
      },
    })
      .populate('reportedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error('Get nearby pets error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch nearby pets' });
  }
});

// ── GET /api/pets/secret-group ───────────────────────────────
/**
 * Get secret group pets — high-priority alerts for premium users only.
 */
router.get('/secret-group', requireSecretGroupAccess, async (req, res) => {
  try {
    const pets = await Pet.find({ isSecretGroup: true })
      .populate('reportedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error('Get secret group pets error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch secret group pets' });
  }
});

// ── GET /api/pets/high-priority ──────────────────────────────
/**
 * Get high-priority and critical pets (premium feature).
 */
router.get('/high-priority', requireSecretGroupAccess, async (req, res) => {
  try {
    const pets = await Pet.find({ priority: { $in: ['high', 'critical'] } })
      .populate('reportedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error('Get high priority pets error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch high priority pets' });
  }
});

// ── GET /api/pets/:id ────────────────────────────────────────
/**
 * Get a specific pet by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id).populate('reportedBy', 'name email phone');

    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found' });
    }

    // Secret group check
    if (pet.isSecretGroup) {
      const user = await User.findById(req.user.sub);
      if (!user.canAccessSecretGroup) {
        return res.status(403).json({
          success: false,
          message: 'This pet is in the secret group. Premium subscription required.',
        });
      }
    }

    res.json({ success: true, pet });
  } catch (err) {
    console.error('Get pet error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch pet' });
  }
});

// ── PUT /api/pets/:id ────────────────────────────────────────
/**
 * Update a pet report — only by the original reporter.
 */
router.put('/:id', upload.array('photos', 5), async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found' });
    }

    if (pet.reportedBy.toString() !== req.user.sub) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own pet reports',
      });
    }

    const user = await User.findById(req.user.sub);
    if (req.body.isSecretGroup && !user.isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Secret group feature requires Pro or Enterprise subscription',
      });
    }

    const updates = { ...req.body };
    delete updates.reportedBy;
    delete updates.createdAt;

    Object.assign(pet, updates);

    if (req.files && req.files.length > 0) {
      const newPhotos = req.files.map(
        (file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      );
      pet.photos = [...(pet.photos || []), ...newPhotos];
    }

    await pet.save();
    res.json({ success: true, pet });
  } catch (err) {
    console.error('Update pet error:', err);
    res.status(500).json({ success: false, message: 'Could not update pet' });
  }
});

// ── DELETE /api/pets/:id ──────────────────────────────────────
/**
 * Delete a pet report — only by the original reporter.
 */
router.delete('/:id', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found' });
    }

    if (pet.reportedBy.toString() !== req.user.sub) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own pet reports',
      });
    }

    await pet.deleteOne();
    res.json({ success: true, message: 'Pet report deleted successfully' });
  } catch (err) {
    console.error('Delete pet error:', err);
    res.status(500).json({ success: false, message: 'Could not delete pet' });
  }
});

// ── PATCH /api/pets/:id/lost ──────────────────────────────────
/**
 * Mark a pet as Lost and save its last known GPS location.
 * Called by the frontend "Report Lost" button.
 */
router.patch('/:id/lost', async (req, res) => {
  try {
    const { latitude, longitude, lastSeenAddress } = req.body;

    const pet = await Pet.findByIdAndUpdate(
      req.params.id,
      {
        status: 'lost',
        lastSeenAddress: lastSeenAddress || '',
        lostAt: new Date(),
        ...(latitude && longitude
          ? {
              location: {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)],
              },
            }
          : {}),
      },
      { new: true }
    );

    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found' });
    }

    res.json({ success: true, pet });
  } catch (err) {
    console.error('Mark lost error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/pets/:id/alert-neighbors ───────────────────────
/**
 * Send email alerts to all users within 5 miles of the pet's location.
 * Requires users to have their location saved in the database.
 */
router.post('/:id/alert-neighbors', async (req, res) => {
  try {
    const { latitude, longitude, radiusMiles = 5, petName, publicUrl } = req.body;
    const radiusMeters = radiusMiles * 1609.34;

    // Find all nearby users who have saved their location
    const nearbyUsers = await User.find({
      _id: { $ne: req.user.sub }, // exclude the pet owner
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: radiusMeters,
        },
      },
    }).select('email name');

    // Send alert email to each nearby user
    const emailPromises = nearbyUsers.map((user) =>
      sendAlertEmail(user.email, petName, publicUrl).catch((err) =>
        console.error(`Failed to send alert to ${user.email}:`, err)
      )
    );
    await Promise.all(emailPromises);

    console.log(`[alert-neighbors] Notified ${nearbyUsers.length} user(s) about ${petName}`);
    res.json({
      success: true,
      message: 'Alerts sent',
      usersNotified: nearbyUsers.length,
    });
  } catch (err) {
    console.error('Alert neighbors error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
