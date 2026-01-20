# Security

## Environment Variables

**Never commit:**
- `.env.local` or any `.env*` files (gitignored)

**Safe to commit:**
- `.env.local.example` (template only)

### Variable Types

| Prefix | Scope | Use For |
|--------|-------|---------|
| `NEXT_PUBLIC_*` | Client + Server | Public keys, URLs |
| No prefix | Server only | Secrets, API keys |

## Supabase

- Row Level Security (RLS) enabled on all tables
- Anonymous key used client-side (safe with RLS)
- Service role key is server-only

## If Credentials Are Exposed

1. Regenerate immediately in respective dashboard
2. Redeploy with new values
