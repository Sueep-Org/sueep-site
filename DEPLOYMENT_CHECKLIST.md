# Firebase & Vercel Deployment Checklist

## Pre-Deployment Checklist

- [ ] Firebase project created and web app configured
- [ ] All Firebase credentials obtained from Firebase Console
- [ ] `.env.local` file created with all Firebase variables filled in
- [ ] All other environment variables configured (DATABASE_URL, DIRECT_URL, etc.)
- [ ] Local development tested: `npm run dev` works
- [ ] Local build tested: `npm run build` succeeds
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
  - [ ] DATABASE_URL
  - [ ] DIRECT_URL
  - [ ] ERP_SESSION_SECRET
  - [ ] ERP_ACCESS_PASSWORD
  - [ ] STRIPE_SECRET_KEY
  - [ ] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - [ ] Any other required env vars

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

- [ ] Deployment successful (check Vercel Dashboard)
- [ ] Website loads without 500 errors
- [ ] Firebase authentication working
- [ ] Database queries working
- [ ] Check Vercel logs for any errors
- [ ] Test main features of the application

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
- STRIPE_SECRET_KEY
- DATABASE_URL
- DIRECT_URL
- ERP_SESSION_SECRET
- ERP_ACCESS_PASSWORD
- HUBSPOT_ACCESS_TOKEN (if applicable)
- HUBSPOT_CLIENT_SECRET (if applicable)
