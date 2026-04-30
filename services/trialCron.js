const cron = require("node-cron");
const User = require("../models/User");
const { sendEmail } = require("./email");

/**
 * Trial lifecycle cron jobs.
 * Call startTrialCronJobs() once at server startup.
 *
 * Schedule overview:
 *   - Every hour  → expire trials whose window has closed
 *   - Every day   → send 3-day warning email
 *   - Every day   → send 1-day (final) warning email
 */

function startTrialCronJobs() {
  // ── 1. Expire stale trials (every hour) ──────────────────────
  cron.schedule("0 * * * *", async () => {
    console.log("[cron] Running trial expiry sweep...");
    try {
      const expired = await User.findExpiredTrials();

      for (const user of expired) {
        await user.expireTrial();

        sendEmail({
          to: user.email,
          subject: "Your Pet Finder trial has ended",
          template: "trialExpired",
          data: {
            name: user.name,
            upgradeUrl: `${process.env.CLIENT_URL}/upgrade`,
          },
        }).catch(console.error);
      }

      if (expired.length > 0) {
        console.log(`[cron] Expired ${expired.length} trial(s).`);
      }
    } catch (err) {
      console.error("[cron] Trial expiry sweep failed:", err);
    }
  });

  // ── 2. 3-day warning email (daily at 10 AM UTC) ──────────────
  cron.schedule("0 10 * * *", async () => {
    console.log("[cron] Sending 3-day trial warning emails...");
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      // Users whose trial ends in the next 72–96 hours (catch window for daily run)
      const start = new Date(threeDaysFromNow);
      start.setHours(0, 0, 0, 0);
      const end = new Date(threeDaysFromNow);
      end.setHours(23, 59, 59, 999);

      const users = await User.find({
        plan: "trial",
        trialEndsAt: { $gte: start, $lte: end },
      });

      for (const user of users) {
        sendEmail({
          to: user.email,
          subject: "⏰ 3 days left in your Pet Finder trial",
          template: "trialWarning",
          data: {
            name: user.name,
            daysRemaining: 3,
            trialEndsAt: user.trialEndsAt.toDateString(),
            upgradeUrl: `${process.env.CLIENT_URL}/upgrade`,
          },
        }).catch(console.error);
      }

      console.log(`[cron] Sent 3-day warning to ${users.length} user(s).`);
    } catch (err) {
      console.error("[cron] 3-day warning job failed:", err);
    }
  });

  // ── 3. Final 1-day warning email (daily at 10 AM UTC) ────────
  cron.schedule("0 10 * * *", async () => {
    console.log("[cron] Sending 1-day trial warning emails...");
    try {
      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      const start = new Date(oneDayFromNow);
      start.setHours(0, 0, 0, 0);
      const end = new Date(oneDayFromNow);
      end.setHours(23, 59, 59, 999);

      const users = await User.find({
        plan: "trial",
        trialEndsAt: { $gte: start, $lte: end },
      });

      for (const user of users) {
        sendEmail({
          to: user.email,
          subject: "🚨 Last day of your Pet Finder trial",
          template: "trialWarning",
          data: {
            name: user.name,
            daysRemaining: 1,
            trialEndsAt: user.trialEndsAt.toDateString(),
            upgradeUrl: `${process.env.CLIENT_URL}/upgrade`,
          },
        }).catch(console.error);
      }

      console.log(`[cron] Sent 1-day warning to ${users.length} user(s).`);
    } catch (err) {
      console.error("[cron] 1-day warning job failed:", err);
    }
  });

  console.log("[cron] Trial lifecycle jobs registered.");
}

module.exports = { startTrialCronJobs };
