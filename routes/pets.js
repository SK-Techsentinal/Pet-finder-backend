const { sendAlertEmail } = require('../services/email');
const express = require('express');
const Pet  = require('../models/Pet');
const User = require('../models/User');
const { authenticate } = require('../middleware/authenticate');
const { requireSecretGroupAccess } = require('../middleware/premium');
const upload = require('../services/upload');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinary');

const router = express.Router();

// All pet routes require authentication
router.use(authenticate);

// ── Helper: upload all files in req.files to Cloudinary ──────
async function handlePhotoUploads(files) {
  if (!files || files.length === 0) return [];
  const urls = await Promise.all(
    files.map(file => uploadToCloudinary(file.buffer, file.mimetype))
  );
  return urls;
}

// ── POST /api/pets ───────────────────────────────────────────
router.post('/', upload.array('photos', 5), async (req, res) => {
  try {
    const {
      name, species, breed, age, gender, color,
      location, address, city, country, status, priority,
      isSecretGroup, contactPhone, contactEmail, description,
      dateLost, dateFound, lastSeenAddress,
    } = req.body;

    const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    if (!parsedLocation?.coordinates || parsedLocation.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Valid location coordinates required: { type: "Point", coordinates: [lng, lat] }',
      });
    }

    const user = await User.findById(req.user.sub);
    if (isSecretGroup && !user.isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Secret group feature requires Pro or Enterprise subscription',
      });
    }

    // Upload photos to Cloudinary — returns permanent HTTPS URLs
    const photoUrls = await handlePhotoUploads(req.files);

    const pet = await Pet.create({
      name, species, breed, age, gender, color,
      photos: photoUrls,
      location: parsedLocation,
      address,
      lastSeenAddress: lastSeenAddress || address,
      city, country,
      status:        status        || 'lost',
      priority:      priority      || 'medium',
      isSecretGroup: isSecretGroup || false,
      reportedBy:    req.user.sub,
      contactPhone, contactEmail, description,
      dateLost, dateFound,
    });

    res.status(201).json({ success: true, pet });
  } catch (err) {
    console.error('Create pet error:', err);
    res.status(500).json({ success: false, message: 'Could not create pet report' });
  }
});

// ── GET /api/pets ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const user  = await User.findById(req.user.sub);
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
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
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
router.get('/:id', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id).populate('reportedBy', 'name email phone');

    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });

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
router.put('/:id', upload.array('photos', 5), async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });

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

    // Upload new photos to Cloudinary and append to existing
    if (req.files && req.files.length > 0) {
      const newUrls = await handlePhotoUploads(req.files);
      pet.photos = [...(pet.photos || []), ...newUrls];
    }

    await pet.save();
    res.json({ success: true, pet });
  } catch (err) {
    console.error('Update pet error:', err);
    res.status(500).json({ success: false, message: 'Could not update pet' });
  }
});

// ── DELETE /api/pets/:id ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });

    if (pet.reportedBy.toString() !== req.user.sub) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own pet reports',
      });
    }

    // Delete photos from Cloudinary so you don't waste storage
    if (pet.photos && pet.photos.length > 0) {
      await Promise.all(pet.photos.map(url => deleteFromCloudinary(url)));
    }

    await pet.deleteOne();
    res.json({ success: true, message: 'Pet report deleted successfully' });
  } catch (err) {
    console.error('Delete pet error:', err);
    res.status(500).json({ success: false, message: 'Could not delete pet' });
  }
});

// ── PATCH /api/pets/:id/lost ──────────────────────────────────
router.patch('/:id/lost', async (req, res) => {
  try {
    const { latitude, longitude, lastSeenAddress } = req.body;

    const pet = await Pet.findByIdAndUpdate(
      req.params.id,
      {
        status: 'lost',
        lastSeenAddress: lastSeenAddress || '',
        lostAt: new Date(),
        ...(latitude && longitude ? {
          location: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
        } : {}),
      },
      { new: true }
    );

    if (!pet) return res.status(404).json({ success: false, message: 'Pet not found' });

    res.json({ success: true, pet });
  } catch (err) {
    console.error('Mark lost error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/pets/:id/alert-neighbors ───────────────────────
router.post('/:id/alert-neighbors', async (req, res) => {
  try {
    const { latitude, longitude, radiusMiles = 5, petName, publicUrl } = req.body;
    const radiusMeters = radiusMiles * 1609.34;

    const nearbyUsers = await User.find({
      _id: { $ne: req.user.sub },
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

    const emailPromises = nearbyUsers.map(user =>
      sendAlertEmail(user.email, petName, publicUrl).catch(err =>
        console.error(`Failed to send alert to ${user.email}:`, err)
      )
    );
    await Promise.all(emailPromises);

    console.log(`[alert-neighbors] Notified ${nearbyUsers.length} user(s) about ${petName}`);
    res.json({ success: true, message: 'Alerts sent', usersNotified: nearbyUsers.length });
  } catch (err) {
    console.error('Alert neighbors error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
