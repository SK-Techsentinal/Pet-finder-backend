const express = require("express");
const Pet = require("../models/Pet");
const User = require("../models/User");
const { authenticate } = require("../middleware/authenticate");
const { requireSecretGroupAccess } = require("../middleware/premium");
const upload = require("../services/upload");


const router = express.Router();

// All pet routes require authentication
router.use(authenticate);

// ── POST /api/pets ───────────────────────────────────────────
/**
 * Report a new lost/found pet
 */
router.post("/", upload.array('photos', 5), async (req, res) => {
  try {
    const {
      name,
      species,
      breed,
      age,
      gender,
      color,
      photos,
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
    } = req.body;

    // Validate location
    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: "Valid location coordinates required" });
    }

    // Only premium users can set isSecretGroup
    const user = await User.findById(req.user.sub);
    if (isSecretGroup && !user.isPremium) {
      return res.status(403).json({
        success: false,
        message: "Secret group feature requires Pro or Enterprise subscription"
      });
    }

    const pet = new Pet({
      name,
      species,
      breed,
      age,
      gender,
      color,
      photos,
      location,
      address,
      city,
      country,
      status,
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
    console.error("Create pet error:", err);
    res.status(500).json({ success: false, message: "Could not create pet report" });
  }
});

// ── GET /api/pets ────────────────────────────────────────────
/**
 * Get all pets (excluding secret group pets for non-premium users)
 */
router.get("/", async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    const query = user.canAccessSecretGroup ? {} : { isSecretGroup: false };
    
    // Add filters
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.species) {
      query.species = req.query.species;
    }
    if (req.query.priority) {
      query.priority = req.query.priority;
    }

    const pets = await Pet.find(query)
      .populate('reportedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error("Get pets error:", err);
    res.status(500).json({ success: false, message: "Could not fetch pets" });
  }
});

// ── GET /api/pets/nearby ─────────────────────────────────────
/**
 * Get pets near a location (for map view)
 */
router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10000 } = req.query; // maxDistance in meters (default 10km)
    
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: "Latitude and longitude required" });
    }

    const user = await User.findById(req.user.sub);
    const query = user.canAccessSecretGroup ? {} : { isSecretGroup: false };

    const pets = await Pet.find({
      ...query,
      location: {
        $near: {
          $geometry: {
            type: "Point",
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
    console.error("Get nearby pets error:", err);
    res.status(500).json({ success: false, message: "Could not fetch nearby pets" });
  }
});

// ── GET /api/pets/secret-group ───────────────────────────────
/**
 * Get secret group pets (high-priority alerts for premium users only)
 */
router.get("/secret-group", requireSecretGroupAccess, async (req, res) => {
  try {
    const pets = await Pet.find({ isSecretGroup: true })
      .populate('reportedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error("Get secret group pets error:", err);
    res.status(500).json({ success: false, message: "Could not fetch secret group pets" });
  }
});

// ── GET /api/pets/high-priority ──────────────────────────────
/**
 * Get high-priority and critical pets (premium feature)
 */
router.get("/high-priority", requireSecretGroupAccess, async (req, res) => {
  try {
    const pets = await Pet.find({
      priority: { $in: ['high', 'critical'] },
    })
      .populate('reportedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 });

    res.json({ success: true, pets });
  } catch (err) {
    console.error("Get high priority pets error:", err);
    res.status(500).json({ success: false, message: "Could not fetch high priority pets" });
  }
});

// ── GET /api/pets/:id ────────────────────────────────────────
/**
 * Get a specific pet by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id).populate('reportedBy', 'name email phone');
    
    if (!pet) {
      return res.status(404).json({ success: false, message: "Pet not found" });
    }

    // Check if user can access secret group pets
    if (pet.isSecretGroup) {
      const user = await User.findById(req.user.sub);
      if (!user.canAccessSecretGroup) {
        return res.status(403).json({ 
          success: false, 
          message: "This pet is in the secret group. Premium subscription required." 
        });
      }
    }

    res.json({ success: true, pet });
  } catch (err) {
    console.error("Get pet error:", err);
    res.status(500).json({ success: false, message: "Could not fetch pet" });
  }
});

// ── PUT /api/pets/:id ────────────────────────────────────────
/**
 * Update a pet report (only by the reporter)
 */
router.put("/:id", upload.array('photos', 5), async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);
    
    if (!pet) {
      return res.status(404).json({ success: false, message: "Pet not found" });
    }

    // Check if user is the reporter
    if (pet.reportedBy.toString() !== req.user.sub) {
      return res.status(403).json({ success: false, message: "You can only update your own pet reports" });
    }

    // Prevent non-premium users from setting isSecretGroup
    const user = await User.findById(req.user.sub);
    if (req.body.isSecretGroup && !user.isPremium) {
      return res.status(403).json({ 
        success: false, 
        message: "Secret group feature requires Pro or Enterprise subscription" 
      });
    }

    const updates = req.body;
    delete updates.reportedBy; // Prevent changing the reporter
    delete updates.createdAt; // Prevent changing creation date

    Object.assign(pet, updates);
    await pet.save();

    // Handle new photo uploads
    if (req.files && req.files.length > 0) {
      const newPhotos = req.files.map(file =>
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      );
      pet.photos = [...(pet.photos || []), ...newPhotos];
    }
    res.json({ success: true, pet });
  } catch (err) {
    console.error("Update pet error:", err);
    res.status(500).json({ success: false, message: "Could not update pet" });
  }
});

// ── DELETE /api/pets/:id ──────────────────────────────────────
/**
 * Delete a pet report (only by the reporter)
 */
router.delete("/:id", async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);
    
    if (!pet) {
      return res.status(404).json({ success: false, message: "Pet not found" });
    }

    // Check if user is the reporter
    if (pet.reportedBy.toString() !== req.user.sub) {
      return res.status(403).json({ success: false, message: "You can only delete your own pet reports" });
    }

    await pet.deleteOne();

    res.json({ success: true, message: "Pet report deleted successfully" });
  } catch (err) {
    console.error("Delete pet error:", err);
    res.status(500).json({ success: false, message: "Could not delete pet" });
  }
});

module.exports = router;
