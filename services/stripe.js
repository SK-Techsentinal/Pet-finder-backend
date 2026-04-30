const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
  telemetry: false,
});

// ── Price IDs ─────────────────────────────────────────────────
// Set these in your .env — one per billing interval per plan
const PRICE_MAP = {
  basic: {
    monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
    yearly: process.env.STRIPE_PRICE_BASIC_YEARLY,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  },
};

/**
 * Resolve a Stripe Price ID from plan + interval.
 * Throws if the combination isn't configured.
 */
function resolvePriceId(plan, interval = "monthly") {
  const planPrices = PRICE_MAP[plan];
  if (!planPrices) throw new Error(`Unknown plan: "${plan}"`);

  const priceId = planPrices[interval];
  if (!priceId) throw new Error(`No Stripe price configured for ${plan}/${interval}`);

  return priceId;
}

/**
 * Find or create a Stripe Customer for a given user.
 * Caches the customer ID back onto the user document.
 */
async function getOrCreateCustomer(user) {
  if (user.stripeCustomerId) {
    return stripe.customers.retrieve(user.stripeCustomerId);
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user._id.toString() },
  });

  // Persist so we never create duplicates
  user.stripeCustomerId = customer.id;
  await user.save();

  return customer;
}

/**
 * Create a Checkout Session for a plan upgrade.
 * Returns the session URL to redirect the user to.
 */
async function createCheckoutSession({ user, plan, interval = "monthly", successUrl, cancelUrl }) {
  const customer = await getOrCreateCustomer(user);
  const priceId = resolvePriceId(plan, interval);

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      trial_end: "now", // end any Stripe-side trial immediately on upgrade
      metadata: {
        userId: user._id.toString(),
        plan,
      },
    },
    metadata: {
      userId: user._id.toString(),
      plan,
    },
  });

  return session;
}

/**
 * Create a Billing Portal session so users can manage/cancel their subscription.
 */
async function createPortalSession({ user, returnUrl }) {
  if (!user.stripeCustomerId) {
    throw new Error("User has no Stripe customer ID — they have not subscribed yet.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return session;
}

/**
 * Parse and verify an incoming Stripe webhook event.
 * Throws if the signature is invalid.
 */
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

/**
 * Retrieve a subscription with its latest invoice expanded.
 */
function getSubscription(subscriptionId) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice", "items.data.price"],
  });
}

module.exports = {
  stripe,
  resolvePriceId,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  getSubscription,
};
