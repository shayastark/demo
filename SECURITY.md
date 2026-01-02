# Security Best Practices

This document outlines security considerations for the Hubba project.

## Environment Variables

### Never Commit Secrets

**NEVER commit the following files:**
- `.env`
- `.env.local`
- `.env.development.local`
- `.env.test.local`
- `.env.production.local`
- Any file matching `.env*.local`

These files are automatically ignored by `.gitignore`.

### Safe to Commit

The following file is **safe to commit** as it contains no secrets:
- `.env.local.example` - Template file with placeholder values

### Environment Variables Guide

1. **Copy the template:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **Fill in your actual values** (never commit `.env.local`)

3. **Public vs Private Variables:**

   - **`NEXT_PUBLIC_*`** - These are exposed to the browser/client
     - ✅ Safe for: Public API keys, public URLs
     - ❌ Never use for: Secrets, private keys, service role keys
   
   - **Variables without `NEXT_PUBLIC_`** - Server-side only
     - ✅ Use for: Service role keys, API secrets
     - ⚠️ These are only available in Server Components and API routes

### Our Environment Variables

**Public (client-side accessible):**
- `NEXT_PUBLIC_PRIVY_APP_ID` - Public Privy app identifier
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anonymous key (has RLS restrictions)
- `NEXT_PUBLIC_APP_URL` - Public app URL

**Private (server-side only):**
- `SUPABASE_SERVICE_ROLE_KEY` - ⚠️ **KEEP SECRET** - Bypasses RLS, full database access

## Supabase Security

### Row Level Security (RLS)

Our database uses Row Level Security policies:
- Projects are publicly viewable
- Only creators can modify their own projects
- Notes are private to creators (enforced by application logic)
- Users can only manage their own saved projects

### Service Role Key

The `SUPABASE_SERVICE_ROLE_KEY` has full database access and bypasses RLS. 

**Important:**
- ⚠️ **Never use it in client-side code**
- ⚠️ **Only use in server-side code (API routes, Server Components)**
- ⚠️ **If exposed, regenerate it immediately in Supabase dashboard**

Currently, our app uses the anonymous key in client-side code, which is safe because RLS policies restrict access appropriately.

## Privy Security

- The Privy App ID is public and safe to expose
- User authentication is handled by Privy's secure infrastructure
- Embedded wallets are managed securely by Privy

## File Upload Security

### Supabase Storage

- Files are stored in Supabase Storage bucket `hubba-files`
- Consider implementing:
  - File size limits (enforced in Supabase or application)
  - File type validation (currently accepts MP3, WAV, M4A, FLAC, OGG and images)
  - Virus scanning for production (optional)

### Best Practices

1. **Validate file types** on both client and server
2. **Set file size limits** (Supabase has defaults)
3. **Sanitize file names** before upload
4. **Use signed URLs** for private files (if needed in future)

## API Security

### Current Implementation

- No custom API routes yet (using Supabase client directly)
- All database access goes through Supabase with RLS

### Future API Routes

When adding API routes:
- ✅ Validate user authentication
- ✅ Validate input data
- ✅ Use rate limiting
- ✅ Never expose service role keys
- ✅ Use environment variables for secrets

## Deployment Security

### Before Deploying to Production

1. ✅ Set environment variables in your hosting platform (Vercel, Railway, etc.)
2. ✅ Use production URLs for `NEXT_PUBLIC_APP_URL`
3. ✅ Configure CORS in Supabase for your production domain
4. ✅ Review and test RLS policies
5. ✅ Enable Supabase database backups
6. ✅ Set up monitoring/error tracking (e.g., Sentry)
7. ✅ Use HTTPS only (enforced by most hosting platforms)

### Platform-Specific

**Vercel:**
- Add environment variables in Project Settings → Environment Variables
- Never commit `.vercel` folder (already in .gitignore)

**Railway:**
- Add environment variables in project settings
- Never commit `.railway` folder (already in .gitignore)

## Regular Security Checks

- [ ] Review environment variables periodically
- [ ] Rotate service role keys if exposed
- [ ] Update dependencies regularly (`npm audit`)
- [ ] Review Supabase RLS policies
- [ ] Monitor for security advisories in dependencies

## If Credentials Are Exposed

If you accidentally commit credentials:

1. **Immediately revoke/regenerate the exposed credentials:**
   - Privy: Regenerate App ID in dashboard
   - Supabase: Regenerate service role key in dashboard

2. **Remove from Git history:**
   ```bash
   # Use git-filter-branch or BFG Repo-Cleaner
   # Or consider the file compromised and revoke credentials
   ```

3. **Force push** (if needed, coordinate with team)

4. **Monitor for unauthorized access**

## Additional Resources

- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [Privy Security Documentation](https://docs.privy.io/guide/react/security)

