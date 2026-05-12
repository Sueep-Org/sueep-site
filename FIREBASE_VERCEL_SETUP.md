# Firebase & Vercel Setup Guide

## Step 1: Get Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click **Project Settings** (gear icon)
4. Under the "Your apps" section, select your web app
5. Copy the entire config object:
   ```javascript
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

## Step 2: Set Up Local Environment

1. Create `.env.local` in the project root (use `.env.local.example` as a template):
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your Firebase credentials:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

3. Fill in other required variables (DATABASE_URL, DIRECT_URL, ERP_SESSION_SECRET, etc.)

4. Test locally:
   ```bash
   npm install
   npm run dev
   ```

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy from project root:
   ```bash
   vercel
   ```
   - Answer prompts to link to your Vercel project
   - Choose environment (production/preview)

3. Set environment variables in Vercel:
   ```bash
   vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
   vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
   vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
   vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
   vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
   vercel env add NEXT_PUBLIC_FIREBASE_APP_ID
   vercel env add DATABASE_URL
   vercel env add DIRECT_URL
   vercel env add ERP_SESSION_SECRET
   vercel env add ERP_ACCESS_PASSWORD
   ```

4. Deploy to production:
   ```bash
   vercel --prod
   ```

### Option B: GitHub Integration (Recommended for CI/CD)

1. Push code to GitHub:
   ```bash
   git add .
   git commit -m "Add Firebase configuration"
   git push origin main
   ```

2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Add New..." → "Project"
4. Import your GitHub repository
5. Set environment variables in Vercel project settings
6. Click "Deploy" - automatic deployments on push to main

## Step 4: Configure Vercel Environment Variables

In Vercel Dashboard:
1. Navigate to your project
2. Go to **Settings** → **Environment Variables**
3. Add all variables from your `.env.local` file:
   - Mark Firebase variables as "Environments: Production, Preview, Development"
   - Mark sensitive keys as "Environments: Production" only

**Important:** The `NEXT_PUBLIC_` prefix variables will be exposed to the browser, so only use them for public Firebase config. Never put API keys without the prefix in these variables.

## Step 5: Database Migrations (if needed)

After deploying, run migrations on the production database:

```bash
# Via Vercel CLI
vercel env pull  # Downloads prod env vars to .env.local
npm run build    # This runs: prisma migrate deploy && next build
```

Or deploy and then run migrations via your hosting provider.

## Troubleshooting

**Firebase not connecting?**
- Verify all 6 environment variables are set correctly
- Check Firebase Console > Authentication > Sign-in method is enabled
- Check CORS settings if using Firebase Realtime Database or Storage

**Build fails on Vercel?**
- Check Build Logs in Vercel Dashboard
- Ensure DATABASE_URL and DIRECT_URL are correct
- Run `npm run build` locally to test

**Environment variables not loading?**
- Vercel env vars take 2-3 minutes to be available after setting
- Redeploy after adding/updating vars: `vercel --prod`
- Check that variable names match exactly (case-sensitive)

## Quick Commands

```bash
# Local development
npm run dev

# Local build test
npm run build

# Push to Vercel staging
vercel

# Push to Vercel production
vercel --prod

# Pull production env vars locally
vercel env pull

# View Vercel logs
vercel logs
```

## Security Notes

- Never commit `.env.local` or actual credentials
- Use different Firebase projects for dev/staging/production
- Rotate Firebase keys regularly in Firebase Console
- Use Firebase Security Rules to restrict access
- Keep `.env.example` updated with required variable names (but not values)
