# Hubba Setup Guide

This guide will walk you through setting up Hubba step by step.

## 1. Environment Variables

Create a `.env.local` file in the root directory with the following:

```env
# Privy Configuration
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 2. Supabase Setup

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Create a new project
3. Wait for the project to be fully provisioned

### Step 2: Run Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql`
4. Paste into the SQL editor
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Verify all tables were created by going to **Table Editor**

### Step 3: Create Storage Bucket

1. Go to **Storage** in your Supabase dashboard
2. Click **New bucket**
3. Name it: `hubba-files`
4. Make it **Public** (check the "Public bucket" checkbox)
5. Click **Create bucket**

### Step 4: Set Up Storage Policies (Optional but Recommended)

For better security, you can set up Row Level Security policies on the storage bucket:

1. Go to **Storage** > **hubba-files** > **Policies**
2. Create policies as needed for your use case

For now, a public bucket will work for development.

### Step 5: Get Your Supabase Credentials

1. Go to **Project Settings** > **API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## 3. Privy Setup

### Step 1: Create Privy Account

1. Go to [privy.io](https://privy.io) and sign up
2. Create a new application

### Step 2: Configure Login Methods

In your Privy dashboard:

1. Go to **Settings** > **Authentication**
2. Enable the login methods you want:
   - Email/Password
   - Wallets
   - SMS (optional)

### Step 3: Enable Embedded Wallets

1. Go to **Settings** > **Embedded Wallets**
2. Enable embedded wallets
3. Configure the wallet settings as needed

### Step 4: Get Your App ID

1. Go to **Settings** > **General**
2. Copy your **App ID** → `NEXT_PUBLIC_PRIVY_APP_ID`

## 4. Install Dependencies

```bash
npm install
```

## 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your app!

## 6. Test the Setup

1. **Create an Account**: Click "Get Started" and sign up using email or wallet
2. **Create a Project**: Go to Dashboard > New Project
3. **Upload Tracks**: Add some MP3 files (you can use test files)
4. **Share**: Copy the share link and test it in an incognito window

## Troubleshooting

### Database Errors

- Make sure you ran the complete `schema.sql` file
- Check that all tables exist in the Table Editor
- Verify RLS policies are enabled

### Storage Errors

- Ensure the `hubba-files` bucket exists and is public
- Check file size limits (Supabase free tier has limits)
- Verify CORS settings if uploading from a different domain

### Privy Errors

- Verify your App ID is correct
- Check that embedded wallets are enabled
- Ensure you're using the correct environment (development/production)

### Authentication Issues

- Clear browser cache and cookies
- Check browser console for errors
- Verify Privy app configuration matches your setup

## Next Steps

Once everything is working:

1. Test file uploads with actual MP3 files
2. Create a few test projects
3. Share links and test the listening experience
4. Check that metrics are tracking correctly

## Production Deployment

Before deploying to production:

1. Update `NEXT_PUBLIC_APP_URL` with your production domain
2. Configure CORS in Supabase for your production domain
3. Set up proper RLS policies for production
4. Consider setting up database backups
5. Configure rate limiting if needed

