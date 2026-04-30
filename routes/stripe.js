const express = require("express");
const { stripe, constructWebhookEvent, getSubscription } = require("../services/stripe");
const User = require("../models/User");

const router = express.Router();

// ── POST /api/stripe/create-checkout-session ─────────────────
/**
 * Creates a Stripe Checkout session for plan upgrade.
 * Frontend redirects user to the returned URL.
 */
router.post("/create-checkout-session", async (req, res) => {
  try {
    const { plan, interval = "monthly" } = req.body;
    
    // For now, we'll skip authentication for testing
    // In production, you'd authenticate the user here
    const userId = req.body.userId || req.user?.sub;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { createCheckoutSession } = require("../services/stripe");
    const session = await createCheckoutSession({
      user,
      plan,
      interval,
      successUrl: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.CLIENT_URL}/pricing`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Create checkout session error:", err);
    res.status(500).json({ success: false, message: "Could not create checkout session" });
  }
});

// ── POST /api/stripe/create-portal-session ────────────────────
/**
 * Creates a Stripe Customer Portal session for managing subscriptions.
 */
router.post("/create-portal-session", async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.sub;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { createPortalSession } = require("../services/stripe");
    const session = await createPortalSession({
      user,
      returnUrl: `${process.env.CLIENT_URL}/account`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Create portal session error:", err);
    res.status(500).json({ success: false, message: "Could not create portal session" });
  }
});

// ── POST /api/stripe/webhook ───────────────────────────────────
/**
 * Handles Stripe webhook events for subscription lifecycle.
 * This endpoint must be registered BEFORE express.json() middleware.
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = constructWebhookEvent(req.body, sig);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata.userId;
        const plan = session.metadata.plan;

        const user = await User.findById(userId);
        if (user) {
          await user.activateSubscription({
            plan,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          });
          console.log(`[Webhook] User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        
        if (user) {
          if (event.type === "customer.subscription.deleted") {
            user.plan = "free";
            user.subscriptionEndsAt = new Date();
          } else {
            user.subscriptionEndsAt = new Date(subscription.current_period_end * 1000);
          }
          await user.save();
          console.log(`[Webhook] Subscription ${subscription.id} updated for user ${user._id}`);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          console.log(`[Webhook] Payment succeeded for user ${user._id}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          console.log(`[Webhook] Payment failed for user ${user._id}`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    res.status(400).json({ success: false, message: "Webhook error" });
  }
});

module.exports = router;
