/**
 * Email service using Resend API.
 * In production, this sends actual emails.
 * In development, it logs to console.
 */

const resend = require('resend');

// Initialize Resend if API key is available
const resendClient = process.env.RESEND_API_KEY
  ? new resend.Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * Send an email using Resend API.
 * Falls back to console logging in development if no API key.
 */
async function sendEmail({ to, subject, template, data }) {
  const from = process.env.EMAIL_FROM || 'noreply@petfinder.app';

  // If no Resend API key, just log (development mode)
  if (!resendClient) {
    console.log('[EMAIL] Would send email:', { to, subject, template, data });
    return;
  }

  try {
    await resendClient.emails.send({
      from,
      to,
      subject,
      html: generateEmailHtml(template, data),
    });
    console.log('[EMAIL] Sent successfully to:', to);
  } catch (err) {
    console.error('[EMAIL] Failed to send:', err);
    throw err;
  }
}

/**
 * Send a lost pet alert email to a nearby user.
 * Called by the alert-neighbors route in pets.js.
 */
async function sendAlertEmail(toEmail, petName, publicUrl) {
  return sendEmail({
    to: toEmail,
    subject: `🚨 Lost Pet Nearby: ${petName}`,
    template: 'lostPetAlert',
    data: { petName, publicUrl },
  });
}

/**
 * Generate HTML email content based on template type.
 */
function generateEmailHtml(template, data) {
  const templates = {
    verifyEmail: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#D97706">Welcome to Pet Finder, ${data.name}!</h2>
        <p>Please verify your email address to start your ${data.trialDays}-day free trial.</p>
        <a href="${data.verifyUrl}" style="display:inline-block;background:#D97706;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px">
          Verify Email →
        </a>
        <p style="color:#999;margin-top:32px;font-size:12px">If you didn't create this account, you can ignore this email.</p>
      </div>
    `,

    resetPassword: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#D97706">Password Reset</h2>
        <p>Hi ${data.name},</p>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${data.resetUrl}" style="display:inline-block;background:#D97706;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px">
          Reset Password →
        </a>
        <p style="color:#999;margin-top:32px;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,

    trialExpired: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#D97706">Your Pet Finder trial has ended</h2>
        <p>Hi ${data.name},</p>
        <p>Your 7-day free trial has expired. Upgrade now to continue finding and reuniting pets.</p>
        <a href="${data.upgradeUrl}" style="display:inline-block;background:#D97706;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px">
          Upgrade Now →
        </a>
      </div>
    `,

    trialWarning: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#D97706">${data.daysRemaining === 1 ? '🚨 Last day of your trial!' : '⏰ 3 days left in your trial'}</h2>
        <p>Hi ${data.name},</p>
        <p>Your Pet Finder trial ends on <strong>${data.trialEndsAt}</strong>. Upgrade now to avoid losing access.</p>
        <a href="${data.upgradeUrl}" style="display:inline-block;background:#D97706;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px">
          Upgrade Now →
        </a>
      </div>
    `,

    subscriptionConfirmed: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
        <h2 style="color:#D97706">Welcome to Pet Finder ${data.plan}! 🎉</h2>
        <p>Hi ${data.name},</p>
        <p>Your subscription has been activated. Thank you for upgrading — you now have full access to all features.</p>
      </div>
    `,

    lostPetAlert: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff">
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:20px;margin-bottom:24px">
          <h2 style="color:#DC2626;margin:0 0 8px">🚨 Lost Pet Alert in Your Area</h2>
          <p style="color:#7F1D1D;margin:0">A pet has been reported lost near your location.</p>
        </div>
        <p><strong>Pet Name:</strong> ${data.petName}</p>
        <p>If you have spotted this pet, please click the link below to view their details and contact the owner directly.</p>
        <a href="${data.publicUrl}" style="display:inline-block;background:#DC2626;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px">
          View ${data.petName}'s Details →
        </a>
        <p style="color:#999;margin-top:32px;font-size:12px">You received this alert because you are within 5 miles of the last known location.</p>
      </div>
    `,

    trackerAlert: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff">
        <div style="background:#FEF2F2;border:2px solid #DC2626;border-radius:12px;padding:24px;margin-bottom:24px">
          <h2 style="color:#DC2626;margin:0 0 8px">🚨 URGENT: GPS Tracker Disconnected</h2>
          <p style="color:#7F1D1D;margin:0;font-size:16px">
            Hi ${data.name}, your pet <strong>${data.petName}</strong> has not sent a GPS signal 
            for <strong>${data.lastSignalMinutesAgo} minutes</strong>.
          </p>
        </div>
        <p style="font-size:16px">Please check on <strong>${data.petName}</strong> immediately. If your pet is missing, open the Pet Finder app and use the <strong>Report as Lost</strong> feature to alert nearby users.</p>
        <p style="color:#999;margin-top:32px;font-size:12px">This is an automated emergency alert from Pet Finder.</p>
      </div>
    `,
  };

  return templates[template] || `<p>${JSON.stringify(data)}</p>`;
}

module.exports = { sendEmail, sendAlertEmail };
