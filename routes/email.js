const nodemailer = require('nodemailer');


async function sendAlertEmail(toEmail, petName, publicUrl) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: `🚨 Lost Pet Nearby: ${petName}`,
    html: `
      <h2>🚨 Lost Pet Alert in Your Area</h2>
      <p>A pet named <strong>${petName}</strong> was reported lost near your location.</p>
      <p><a href="${publicUrl}">👉 View ${petName}'s details and contact the owner</a></p>
    `,
  });
}
