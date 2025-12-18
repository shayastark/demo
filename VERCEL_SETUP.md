# Vercel Deployment Guide

This guide walks you through deploying Hubba to Vercel and setting up environment variables.

## Step 1: Deploy to Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository (`shayastark/hubba`)
4. Vercel will auto-detect Next.js and configure build settings
5. **Don't deploy yet** - we need to add environment variables first

### Option B: Via Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts to link your project.

## Step 2: Add Environment Variables

**Before your first deployment**, add all environment variables:

1. In your Vercel project dashboard, go to **Settings** → **Environment Variables**
2. Add each variable:

### Required Variables:

```
NEXT_PUBLIC_PRIVY_APP_ID
```
- Value: Your Privy App ID
- Environments: Production, Preview, Development (check all three)

```
NEXT_PUBLIC_SUPABASE_URL
```
- Value: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- Environments: Production, Preview, Development (check all three)

```
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
- Value: Your Supabase Publishable key
- Environments: Production, Preview, Development (check all three)

```
SUPABASE_SERVICE_ROLE_KEY
```
- Value: Your Supabase service role key
- Environments: Production, Preview, Development (check all three)
- ⚠️ Keep this secret!

```
NEXT_PUBLIC_APP_URL
```
- Value: Your Vercel deployment URL (e.g., `https://hubba.vercel.app`)
- Environments: Production, Preview, Development (check all three)
- ⚠️ **Important**: Update this after first deployment with your actual Vercel URL

## Step 3: Deploy

1. After adding all environment variables, go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment (or trigger a new deployment)
3. Wait for deployment to complete

## Step 4: Update NEXT_PUBLIC_APP_URL (After First Deployment)

After your first successful deployment:

1. Vercel will give you a URL like: `https://hubba-xxxxx.vercel.app` or `https://hubba.vercel.app`
2. Go back to **Settings** → **Environment Variables**
3. Update `NEXT_PUBLIC_APP_URL` with your actual Vercel deployment URL
4. Redeploy (or it will auto-redeploy on next push)

## Environment Variables Checklist

Make sure all these are set in Vercel (same values as your `.env.local`):

- ✅ `NEXT_PUBLIC_PRIVY_APP_ID`
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `NEXT_PUBLIC_APP_URL` (update after first deploy)

## Custom Domain (Optional)

If you want a custom domain:

1. Go to **Settings** → **Domains**
2. Add your domain
3. Update `NEXT_PUBLIC_APP_URL` to match your custom domain
4. Redeploy

## Troubleshooting

**"Environment variable not found" errors:**
- Make sure variables are added in Vercel dashboard
- Check that variable names match exactly (case-sensitive)
- Redeploy after adding variables

**Supabase connection errors:**
- Verify Supabase credentials are correct
- Check Supabase CORS settings allow your Vercel domain
- Check Supabase project is active

**Privy authentication errors:**
- Verify Privy App ID is correct
- Check Privy app settings allow your Vercel domain

## Automatic Deployments

Once set up:
- **Git push to `main` branch** → Auto-deploys to Production
- **Git push to other branches** → Auto-deploys Preview deployments
- **Pull requests** → Auto-creates Preview deployments

## Quick Reference

**Where to find Vercel settings:**
- Environment Variables: Project → Settings → Environment Variables
- Deployments: Project → Deployments
- Domains: Project → Settings → Domains

