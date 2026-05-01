# Pet Finder Backend

A Node.js/Express backend API for the Pet Finder application with user authentication, 7-day trial system, Stripe subscription management, and premium pet tracking features.

## Features

- **User Authentication**: Register, login, email verification, password reset
- **7-Day Trial System**: Automatic trial activation on registration with expiry tracking
- **Subscription Management**: Stripe integration for paid plans (Basic, Pro, Enterprise) with recurring payments
- **Trial Lifecycle**: Automated cron jobs for trial expiry and warning emails
- **Email Service**: Resend API integration for transactional emails
- **Pet Reporting**: Report lost/found pets with geolocation
- **Priority System**: Low, Medium, High, Critical priority levels for pet alerts
- **Secret Group**: Premium-only access to high-priority lost pet alerts (Pro/Enterprise only)
- **Geospatial Queries**: Find pets nearby using MongoDB geospatial indexing
- **Security**: Helmet, rate limiting, JWT authentication, CORS configuration, premium access control

## Project Structure

```
pet-finder-backend/
├── models/
│   └── User.js              # User schema with trial/subscription methods
├── middleware/
│   └── authenticate.js      # JWT authentication middleware
├── routes/
│   ├── auth.js              # Registration, login, password reset
│   ├── trial.js             # Trial status, extend, convert, cancel
│   └── stripe.js            # Stripe checkout, portal, webhooks
├── services/
│   ├── email.js             # Email service using Resend
│   ├── stripe.js            # Stripe helper functions
│   └── trialCron.js         # Cron jobs for trial lifecycle
├── server.js                # Express app setup and server startup
├── package.json
├── .env.example
└── README.md
```

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or MongoDB Atlas)
- Stripe account (for subscriptions)
- Resend account (for emails)

## Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd pet-finder-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your values:
   - `MONGO_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A long random string (min 64 chars)
   - `STRIPE_SECRET_KEY`: Your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook secret
   - `RESEND_API_KEY`: Your Resend API key
   - `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend URLs

4. **Run the server**
   ```bash
   # Development (with auto-reload)
   npm run dev

   # Production
   npm start
   ```

The server will start on port 4000 (or the PORT specified in .env).

## API Endpoints

### Authentication (`/api/auth`)

- `POST /api/auth/register` - Register new user (starts 7-day trial)
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/verify-email` - Verify email address
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Trial (`/api/trial`)

- `GET /api/trial/status` - Get trial/subscription status
- `POST /api/trial/extend` - Extend trial (max 2 extensions)
- `POST /api/trial/convert` - Convert trial to paid plan
- `POST /api/trial/cancel` - Cancel trial early

### Stripe (`/api/stripe`)

- `POST /api/stripe/create-checkout-session` - Create Stripe checkout (requires authentication)
- `POST /api/stripe/create-portal-session` - Create billing portal (requires authentication)
- `POST /api/stripe/webhook` - Handle Stripe webhooks (recurring payments, subscription updates)

### Pets (`/api/pets`)

- `POST /api/pets` - Report a new lost/found pet (requires authentication)
- `GET /api/pets` - Get all pets (excludes secret group for non-premium users)
- `GET /api/pets/nearby` - Get pets near a location (for map view)
- `GET /api/pets/secret-group` - Get secret group pets (Pro/Enterprise only)
- `GET /api/pets/high-priority` - Get high-priority and critical pets (Pro/Enterprise only)
- `GET /api/pets/:id` - Get a specific pet by ID
- `PUT /api/pets/:id` - Update a pet report (only by reporter)
- `DELETE /api/pets/:id` - Delete a pet report (only by reporter)

### Health

- `GET /api/health` - Health check endpoint

## MongoDB Schema

### User Model

```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required, hashed),
  isEmailVerified: Boolean (default: false),
  isActive: Boolean (default: true),
  
  // Trial/Subscription
  plan: String (enum: free, trial, basic, pro, enterprise, expired),
  trialStartedAt: Date,
  trialEndsAt: Date,
  trialExtensions: Number (default: 0),
  subscribedAt: Date,
  subscriptionEndsAt: Date,
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripeSubscriptionStatus: String (active, past_due, canceled, unpaid),
  
  // Login tracking
  lastLoginAt: Date,
  loginCount: Number,
  
  // Virtual properties
  isTrialActive: Boolean,
  trialDaysRemaining: Number,
  hasAccess: Boolean,
  isPremium: Boolean (pro or enterprise),
  canAccessSecretGroup: Boolean
}
```

### Pet Model

```javascript
{
  name: String (required),
  species: String (enum: dog, cat, bird, other),
  breed: String,
  age: String,
  gender: String (enum: male, female, unknown),
  color: String,
  photos: [String],
  
  // Location (geospatial)
  location: {
    type: Point,
    coordinates: [longitude, latitude]
  },
  address: String,
  city: String,
  country: String,
  
  // Status
  status: String (enum: lost, found, adopted),
  priority: String (enum: low, medium, high, critical),
  
  // Secret group (premium feature)
  isSecretGroup: Boolean (default: false),
  
  // Reporter
  reportedBy: ObjectId (ref: User),
  
  // Contact info
  contactPhone: String,
  contactEmail: String,
  description: String,
  
  // Dates
  dateLost: Date,
  dateFound: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## Deployment to Render

### Step 1: Prepare MongoDB Atlas

1. Create a free MongoDB Atlas account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a new cluster (free tier)
3. Create a database user with read/write permissions
4. Whitelist all IPs (0.0.0.0/0) for testing
5. Get your connection string (format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>`)

### Step 2: Prepare Stripe

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your API keys from the Dashboard
3. Create products and prices for your plans
4. Copy the Price IDs to your .env

### Step 3: Prepare Resend (Optional)

1. Create a Resend account at [resend.com](https://resend.com)
2. Get your API key
3. Verify your sender domain

### Step 4: Deploy to Render

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Create Render Web Service**
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: pet-finder-backend
     - **Region**: Nearest to your users
     - **Branch**: main
     - **Runtime**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
   - Click "Create Web Service"

3. **Add Environment Variables**
   - In your Render dashboard, go to your service
   - Click "Environment" tab
   - Add all variables from `.env.example` with your actual values
   - Important: Set `NODE_ENV=production`
   - Update `ALLOWED_ORIGINS` to include your Render URL

4. **Get Your Render URL**
   - Render will provide a URL like: `https://pet-finder-backend.onrender.com`
   - Add this to your `ALLOWED_ORIGINS` in environment variables

### Step 5: Set Up Stripe Webhook

1. In your Render service, copy the URL
2. Go to Stripe Dashboard → Webhooks → Add endpoint
3. Enter: `https://your-render-url.onrender.com/api/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `invoice.upcoming` (optional, for payment reminders)
5. Copy the webhook signing secret and add to Render environment as `STRIPE_WEBHOOK_SECRET`

### Step 6: Configure Stripe Products for Recurring Payments

1. In Stripe Dashboard, create products for each plan:
   - Basic (monthly & yearly)
   - Pro (monthly & yearly) - enables secret group access
   - Enterprise (monthly & yearly) - enables secret group access
2. Set them as **Recurring** subscriptions
3. Copy the Price IDs and add to your environment:
   - `STRIPE_PRICE_BASIC_MONTHLY`
   - `STRIPE_PRICE_BASIC_YEARLY`
   - `STRIPE_PRICE_PRO_MONTHLY`
   - `STRIPE_PRICE_PRO_YEARLY`
   - `STRIPE_PRICE_ENTERPRISE_MONTHLY`
   - `STRIPE_PRICE_ENTERPRISE_YEARLY`

## Testing

```bash
# Run tests (if configured)
npm test

# Manual testing with curl
curl http://localhost:4000/api/health

# Register a user
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

## Troubleshooting

### MongoDB Connection Issues
- Ensure your IP is whitelisted in MongoDB Atlas
- Check that your connection string is correct
- Verify database user permissions

### Stripe Webhook Failures
- Ensure webhook secret matches in environment variables
- Check that the webhook endpoint URL is correct
- Verify the webhook is receiving events from Stripe
- Make sure `STRIPE_WEBHOOK_SECRET` is set in Render environment

### CORS Errors
- Add your frontend URL to `ALLOWED_ORIGINS`
- For React Native/Expo, requests without Origin header are automatically allowed

### Premium/Secret Group Access Issues
- Verify user has `pro` or `enterprise` plan
- Check `stripeSubscriptionStatus` is `active`
- Ensure subscription hasn't expired (`subscriptionEndsAt`)
- Verify webhook events are updating user subscription status

### Geospatial Queries Not Working
- Ensure MongoDB collection has 2dsphere index on location field
- Verify coordinates are in [longitude, latitude] format
- Check that location data is being saved correctly

## License

MIT
