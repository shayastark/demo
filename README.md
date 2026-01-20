# Demo

Share music. Get tipped.

A platform for creators to share unreleased tracks and receive tips from listeners via card or crypto.

## Stack

- Next.js 16, React 19, TypeScript
- Supabase (database + storage)
- Privy (auth)
- Stripe Connect (card payments)
- Daimo Pay (crypto payments)

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add your API keys
npm run dev
```

## Environment Variables

```
NEXT_PUBLIC_PRIVY_APP_ID
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

## License

All rights reserved.
