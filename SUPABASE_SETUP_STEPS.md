# Supabase Setup Steps

Follow these steps after creating your Supabase project.

## Step 1: Run Database Schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open the file `supabase/schema.sql` from this project
4. Copy the **entire contents** of that file
5. Paste into the Supabase SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Verify success - you should see "Success. No rows returned"

**Verify tables were created:**
- Go to **Table Editor** (left sidebar)
- You should see tables: `users`, `projects`, `tracks`, `project_notes`, `track_notes`, `project_metrics`, `user_projects`, `track_plays`, `project_shares`

## Step 2: Create Storage Bucket

1. Go to **Storage** (left sidebar)
2. Click **New bucket**
3. Name: `hubba-files` (must be exact)
4. Check **Public bucket** (important - makes files publicly accessible)
5. Click **Create bucket**

## Step 3: Get Your Credentials

**⚠️ DO NOT SHARE THESE WITH ME OR COMMIT TO GIT**

1. Go to **Project Settings** (gear icon, bottom left)
2. Click **API** (under Configuration)
3. You'll see:

### ✅ Safe to Share (Public):
- **Project URL** - This is public anyway
  - Format: `https://xxxxxxxxxxxxx.supabase.co`
  - Goes in: `NEXT_PUBLIC_SUPABASE_URL`

- **anon public key** - This is the public anonymous key (has RLS restrictions)
  - Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long string)
  - Goes in: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - ✅ This is safe to use in client-side code

### 🔒 PRIVATE - Never Share:
- **service_role secret key** - ⚠️ KEEP SECRET
  - Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long string, different from anon)
  - Goes in: `SUPABASE_SERVICE_ROLE_KEY`
  - ❌ Never commit to git
  - ❌ Never share in chat
  - ❌ Only use server-side (not currently used in this app, but good to have)

## Step 4: Add to .env.local

Create/update your `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Replace `your-project-id`, `your_anon_key_here`, and `your_service_role_key_here` with your actual values.

## Step 5: Test the Connection

After setting up `.env.local`, test if it works:

```bash
npm run dev
```

The app should start. You can test by:
1. Going to the app
2. Trying to sign up/login
3. If you see Privy login (not Supabase errors), the connection works!

## What to Add to Railway (When Deploying)

When you set up Railway (or Vercel), add these same environment variables:

1. `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your anon key
3. `SUPABASE_SERVICE_ROLE_KEY` - Your service role key (keep secret!)
4. `NEXT_PUBLIC_PRIVY_APP_ID` - Your Privy App ID (once you get it)
5. `NEXT_PUBLIC_APP_URL` - Your Railway deployment URL

## Security Checklist

- ✅ Database schema ran successfully
- ✅ Storage bucket `hubba-files` created (public)
- ✅ `.env.local` file created with credentials
- ✅ `.env.local` is in `.gitignore` (won't be committed)
- ✅ Credentials added to Railway environment variables (when deploying)
- ✅ Never shared service_role key publicly

## Troubleshooting

**"relation does not exist" error:**
- Make sure you ran the complete `schema.sql` file
- Check Table Editor to verify tables exist

**"Bucket not found" error:**
- Make sure bucket is named exactly `hubba-files`
- Check it's set to Public

**"Invalid API key" error:**
- Double-check you copied the keys correctly
- Make sure there are no extra spaces
- Verify you're using the right key (anon vs service_role)

