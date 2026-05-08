# PawFind Backend

A Node.js/Express backend API for the PawFind pet tracking application. Features user authentication, 7-day trial system, Stripe subscriptions, Cloudinary photo storage, and geospatial pet tracking.

## Features

- **User Authentication** — Register, login, email verification, password reset
- **7-Day Trial System** — Automatic trial on registration with cron-based expiry
- **Subscription Management** — Stripe integration (Basic, Pro, Enterprise) with recurring billing
- **Photo Storage** — Cloudinary integration for permanent pet photo storage
- **Pet Reporting** — Report lost/found pets with GPS coordinates and photos
- **Alert Neighbors** — Email nearby users when a pet goes missing
- **Secret Group** — Premium-only high-priority alerts (Pro/Enterprise)
- **Geospatial Queries** — Find nearby pets using MongoDB 2dsphere indexing
- **Security** — Helmet CSP, rate limiting, JWT auth, CORS, premium access control

## Project Structure

```
pet-finder-backend/
├── models/
│   ├── User.js              # User schema with trial/subscription methods
│   └── Pet.js               # Pet schema with geospatial index
├── middleware/
│   ├── authenticate.js      # JWT authentication middleware
│   └── premium.js           # Premium/secret group access middleware
├── routes/
│   ├── auth.js              # Register, login, password reset
│   ├── pets.js              # Pet CRUD, nearby, alert neighbors
│   ├── trial.js             # Trial status, extend, convert, cancel
│   ├── stripe.js            # Stripe checkout, portal, webhooks
│   ├── feedback.js          # User feedback
│   ├── tracker.js           # Pet tracker
│   └── public.js            # Public routes
├── services/
│   ├── cloudinary.js        # Cloudinary upload/delete helpers
│   ├── upload.js            # Multer memory storage config
│   ├── email.js             # Resend email service
│   ├── stripe.js            # Stripe helper functions
│   └── trialCron.js         # Cron jobs for trial lifecycle
├── server.js                # Express app setup
├── package.json
├── .env.example
└── README.md
```

## Prerequisites

- Node.js v18+
- MongoDB Atlas account
- Cloudinary account (free tier — 25GB storage)
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
   Fill in your actual values (see Environment Variables section below).

4. **Run the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default 4000) |
| `NODE_ENV` | `development` or `production` |
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Random string, minimum 64 characters |
| `JWT_EXPIRES_IN` | Token expiry e.g. `7d` |
| `FRONTEND_URL` | Your frontend Render URL |
| `CLIENT_URL` | Same as FRONTEND_URL |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_BASIC_MONTHLY` | Stripe Price ID |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Stripe Price ID |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender email address |
| `TRUST_PROXY` | Set to `true` on Render |

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register (starts 7-day trial) |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/location` | Update user GPS location |
| POST | `/api/auth/verify-email` | Verify email |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |

### Pets (`/api/pets`) — requires authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/pets` | Report new pet (with photos) |
| GET | `/api/pets` | Get all pets |
| GET | `/api/pets/nearby` | Get pets near GPS location |
| GET | `/api/pets/secret-group` | Secret group pets (Pro/Enterprise) |
| GET | `/api/pets/high-priority` | High priority pets (Pro/Enterprise) |
| GET | `/api/pets/:id` | Get single pet |
| PUT | `/api/pets/:id` | Update pet report |
| DELETE | `/api/pets/:id` | Delete pet report |
| PATCH | `/api/pets/:id/lost` | Mark pet as lost |
| POST | `/api/pets/:id/alert-neighbors` | Email nearby users |

### Trial (`/api/trial`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trial/status` | Get trial/subscription status |
| POST | `/api/trial/extend` | Extend trial (max 2x) |
| POST | `/api/trial/convert` | Convert to paid plan |
| POST | `/api/trial/cancel` | Cancel trial |

### Stripe (`/api/stripe`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/stripe/create-checkout-session` | Create checkout |
| POST | `/api/stripe/create-portal-session` | Billing portal |
| POST | `/api/stripe/webhook` | Stripe webhook handler |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check (used for wake-up ping) |

## Deployment to Render

### Step 1: Cloudinary Setup
1. Create free account at [cloudinary.com](https://cloudinary.com)
2. Go to Dashboard — copy **Cloud Name**, **API Key**, **API Secret**
3. Go to Settings → Upload → Add upload preset → set to **Unsigned** → name it `pawfind_pets`

### Step 2: MongoDB Atlas
1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create database user with read/write permissions
3. Whitelist all IPs: `0.0.0.0/0`
4. Copy connection string

### Step 3: Deploy to Render
1. Push to GitHub
2. Render → New → Web Service → connect repo
3. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add all environment variables from the table above
5. Set `NODE_ENV=production` and `TRUST_PROXY=true`

### Step 4: Stripe Webhook
1. Stripe Dashboard → Webhooks → Add endpoint
2. URL: `https://your-render-url.onrender.com/api/stripe/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`
4. Copy signing secret → add as `STRIPE_WEBHOOK_SECRET` in Render

## Troubleshooting

**Registration fails** — Check Render logs for `Register error:`. Usually a MongoDB geo index issue or missing environment variable.

**Photos not saving** — Verify all three Cloudinary env vars are set in Render. Check logs for `Cloudinary` errors.

**Buttons not clicking** — Check browser console (F12) for Content Security Policy errors. Make sure you're using the latest `server.js` with helmet CSP configured.

**Rate limit errors** — Ensure `TRUST_PROXY=true` is set in Render environment variables.

**CORS errors** — Make sure `FRONTEND_URL` in Render matches your exact frontend URL including `https://`.

## License

MIT

