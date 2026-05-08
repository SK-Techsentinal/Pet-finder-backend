const cloudinary = require('cloudinary').v2;

// Configure using environment variables you'll add to Render
cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
  secure:      true,
});

/**
 * Upload a single file buffer to Cloudinary.
 * Returns the secure HTTPS URL of the uploaded image.
 *
 * @param {Buffer} buffer   - File buffer from multer memoryStorage
 * @param {string} mimetype - e.g. 'image/jpeg'
 * @returns {Promise<string>} secure URL
 */
async function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
    cloudinary.uploader.upload(dataUri, {
      folder:         'pawfind/pets',      // organises photos in Cloudinary dashboard
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    }, (err, result) => {
      if (err) return reject(err);
      resolve(result.secure_url);
    });
  });
}

/**
 * Delete an image from Cloudinary by its URL.
 * Called when a pet report is deleted.
 *
 * @param {string} url - Cloudinary secure URL
 */
async function deleteFromCloudinary(url) {
  try {
    // Extract public_id from URL (everything after /upload/ and before the extension)
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    if (match) {
      await cloudinary.uploader.destroy(match[1]);
    }
  } catch (err) {
    console.error('Cloudinary delete error:', err);
    // Non-fatal — don't crash if delete fails
  }
}

module.exports = { uploadToCloudinary, deleteFromCloudinary };
