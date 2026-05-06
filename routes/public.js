const express = require('express');
const router  = express.Router();
const Pet     = require('../models/Pet');

// ── GET /public/pet/:id ───────────────────────────────────────
/**
 * Public pet profile page — NO authentication required.
 * This is the URL shared when a pet is reported lost.
 * e.g. https://pet-finder-backend-jkvi.onrender.com/public/pet/abc123
 *
 * Returns: name, age, breed, description, photos,
 *          lastSeenAddress, location, lostAt, status
 * Does NOT return: owner contact details (protect privacy until
 *                  you add a contact-form feature).
 */
router.get('/pet/:id', async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id).select(
      'name age breed description photos lastSeenAddress location lostAt status species color'
    );

    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found' });
    }

    res.json({ success: true, pet });
  } catch (err) {
    console.error('Public pet page error:', err);
    res.status(500).json({ success: false, message: 'Could not load pet profile' });
  }
});

module.exports = router;
