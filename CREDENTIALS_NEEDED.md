# Credentials & Services Needed

This document clarifies exactly what credentials you need to get the app running.

## Services Requiring Credentials

You only need credentials from **2 services**:

### 1. Privy (Authentication)
**What you need:**
- Privy App ID

**Where to get it:**
1. Sign up at [privy.io](https://privy.io)
2. Create a new app
3. Go to Settings → General
4. Copy your App ID

**Environment variable:**
```
NEXT_PUBLIC_PRIVY_APP_ID=your_app_id_here
```

### 2. Supabase (Database + Storage)
**What you need:**
- Supabase Project URL
- Supabase Anonymous Key
- Supabase Service Role Key (optional, for server-side operations)

**Where to get them:**
1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Project Settings → API
4. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

**Environment variables:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Setup steps:**
1. Run the database schema: `supabase/schema.sql` in Supabase SQL Editor
2. Create a storage bucket named `hubba-files` (make it public)

## What About Railway/Vercel?

**Railway, Vercel, Netlify, etc. are NOT services you need credentials for.**

These are **hosting platforms** where you deploy your app. You don't need API keys or credentials from them. You just:
1. Sign up for an account
2. Connect your GitHub repository
3. **Set the same environment variables** (Privy + Supabase credentials) in their dashboard
4. Deploy

It's the same app, just running on their servers instead of your local machine.

## App URL

You also need to set:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- **Development**: `http://localhost:3000`
- **Production**: Your actual domain (e.g., `https://hubba.vercel.app`)

## Summary

| Service | Credentials Needed? | Used For |
|---------|-------------------|----------|
| **Privy** | ✅ Yes - App ID | Authentication, embedded wallets |
| **Supabase** | ✅ Yes - URL + Keys | Database, file storage |
| **Railway** | ❌ No | Just hosting (deployment platform) |
| **Vercel** | ❌ No | Just hosting (deployment platform) |
| **Any hosting platform** | ❌ No | Just hosting (deployment platform) |

**Total: 2 services requiring credentials**

