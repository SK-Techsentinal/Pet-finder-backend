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
    // In production, you'd use actual email templates
    // For now, we'll send a simple text email
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
 * Generate HTML email content based on template type.
 * In production, you'd use a proper template engine like Handlebars.
 */
function generateEmailHtml(template, data) {
  const templates = {
    verifyEmail: `
      <h2>Welcome to Pet Finder, ${data.name}!</h2>
      <p>Please verify your email address to start your ${data.trialDays}-day free trial.</p>
      <a href="${data.verifyUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
    `,
    resetPassword: `
      <h2>Password Reset</h2>
      <p>Hi ${data.name},</p>
      <p>Click the link below to reset your password:</p>
      <a href="${data.resetUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
    `,
    trialExpired: `
      <h2>Your Pet Finder trial has ended</h2>
      <p>Hi ${data.name},</p>
      <p>Your 7-day free trial has expired. Upgrade now to continue using Pet Finder.</p>
      <a href="${data.upgradeUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Now</a>
    `,
    trialWarning: `
      <h2>${data.daysRemaining === 1 ? 'Last day!' : '3 days left'}</h2>
      <p>Hi ${data.name},</p>
      <p>Your Pet Finder trial ends on ${data.trialEndsAt}. Upgrade now to avoid losing access.</p>
      <a href="${data.upgradeUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Now</a>
    `,
    subscriptionConfirmed: `
      <h2>Welcome to Pet Finder ${data.plan}!</h2>
      <p>Hi ${data.name},</p>
      <p>Your subscription has been activated. Thank you for upgrading!</p>
    `,
  };

  return templates[template] || `<p>${JSON.stringify(data)}</p>`;
}

module.exports = { sendEmail };
