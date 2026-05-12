# Firebase & Vercel Deployment Checklist

## Pre-Deployment Checklist

- [ ] Firebase project created and web app configured
- [ ] All Firebase credentials obtained from Firebase Console
- [ ] Stripe API keys obtained (test or production)
- [ ] Database (Neon PostgreSQL) configured with pooled and direct URLs
- [ ] `.env.local` file created with all required variables:
  - [ ] All NEXT_PUBLIC_FIREBASE_* variables
  - [ ] STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - [ ] DATABASE_URL and DIRECT_URL
  - [ ] ERP_SESSION_SECRET and ERP_ACCESS_PASSWORD
  - [ ] (Optional) HUBSPOT_ACCESS_TOKEN, HUBSPOT_CLIENT_SECRET, HUBSPOT_PIPELINE_STAGE_MAP
- [ ] Local development tested: `npm run dev` works without errors
- [ ] Local build tested: `npm run build` succeeds (includes Prisma migrations & code generation)
- [ ] All features tested locally (Firebase auth, database queries, Stripe checkout, etc.)
- [ ] Code committed to git

## Vercel Setup Checklist

- [ ] Vercel account created
- [ ] GitHub repository connected to Vercel (or using Vercel CLI)
- [ ] Project created in Vercel Dashboard
- [ ] All environment variables added to Vercel:
  - [ ] NEXT_PUBLIC_FIREBASE_API_KEY
  - [ ] NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  - [ ] NEXT_PUBLIC_FIREBASE_PROJECT_ID
  - [ ] NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  - [ ] NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  - [ ] NEXT_PUBLIC_FIREBASE_APP_ID
  - [ ] DATABASE_URL (must use pooled connection for Neon)
  - [ ] DIRECT_URL (must use direct connection for Neon)
  - [ ] ERP_SESSION_SECRET
  - [ ] ERP_ACCESS_PASSWORD
  - [ ] STRIPE_SECRET_KEY
  - [ ] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - [ ] HUBSPOT_ACCESS_TOKEN (optional - only if using HubSpot sync)
  - [ ] HUBSPOT_CLIENT_SECRET (optional - only if using HubSpot sync)
  - [ ] HUBSPOT_PIPELINE_STAGE_MAP (optional - only if using HubSpot sync)

## Deployment Steps

1. **Option A - GitHub Integration (Automatic):**
   ```bash
   git add .
   git commit -m "Configure Firebase and Vercel"
   git push origin main
   # Vercel will auto-deploy from your GitHub repo
   ```

2. **Option B - Vercel CLI:**
   ```bash
   vercel --prod
   ```

## Post-Deployment Checks

- [ ] Deployment successful (check Vercel Dashboard - no build errors)
- [ ] Website loads without 500 errors
- [ ] Firebase authentication working (login/signup pages functional)
- [ ] Database queries working (check ERP dashboard if available)
- [ ] Stripe checkout working on painting/commercial cleaning lead forms
- [ ] All public routes loading (/, /painting, /commercial-cleaning, /referral, /blog, etc.)
- [ ] Check Vercel logs for any errors: `vercel logs`
- [ ] Monitor first 24 hours for unexpected errors
- [ ] Test on mobile devices
- [ ] Verify no sensitive data (API keys, secrets) exposed in browser console

## Rollback Plan

If something goes wrong:
```bash
# View previous deployments
vercel deployments

# Promote a previous deployment to production
vercel promote <deployment-url>

# Or redeploy with fixes
git push  # make fixes first
vercel --prod
```

## Environment Variables by Visibility

### Public (visible to browser, must have NEXT_PUBLIC_ prefix):
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

### Secret (server-side only):
- STRIPE_SECRET_KEY (required for payment processing)
- DATABASE_URL (must use pooled connection: "-pooler" in hostname)
- DIRECT_URL (must use direct connection: add "&channel_binding=require")
- ERP_SESSION_SECRET (32+ random characters)
- ERP_ACCESS_PASSWORD
- HUBSPOT_ACCESS_TOKEN (if using HubSpot integration)
- HUBSPOT_CLIENT_SECRET (if using HubSpot integration)
- HUBSPOT_PIPELINE_STAGE_MAP (if using HubSpot integration)
