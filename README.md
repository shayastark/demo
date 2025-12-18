# Hubba

A mobile-first web application for musicians to share demos and unreleased tracks. Creators can upload MP3 files and images, create shareable project links, and track engagement metrics.

## Features

- 🎵 **Project Management**: Create projects with multiple tracks and cover images
- 🔗 **Shareable Links**: Generate unique links to share projects with listeners
- 📊 **Analytics**: Track plays, shares, and project adds
- 📥 **Download Control**: Creators can enable/disable downloads per project
- 📝 **Private Notes**: Project and track-level notes visible only to creators
- 🔐 **Authentication**: Privy-powered authentication with embedded wallets (ready for crypto payments)
- 📱 **Mobile-Optimized**: Designed to work best on mobile devices

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Privy (with embedded wallets)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (for audio files and images)
- **Blockchain**: Wagmi (for wallet interactions)

## Security

⚠️ **Important**: This repository is public. Never commit secrets or credentials.

- ✅ `.env.local.example` is safe to commit (template file)
- ❌ `.env.local` and other `.env*` files are ignored and should never be committed
- See [SECURITY.md](./SECURITY.md) for detailed security guidelines

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Privy account (for authentication)
- A Supabase account (for database and storage)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

Copy `.env.local.example` to `.env.local` and fill in your credentials:

**⚠️ Important**: The `.env.local` file is gitignored and will NOT be committed. Only `.env.local.example` (the template) should be in the repository.

```bash
cp .env.local.example .env.local
```

Required environment variables:
- `NEXT_PUBLIC_PRIVY_APP_ID`: Your Privy App ID
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for server-side operations)
- `NEXT_PUBLIC_APP_URL`: Your app URL (e.g., `http://localhost:3000` for development)

### Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)

2. Run the database schema:

   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `supabase/schema.sql`
   - Execute the SQL to create all tables, indexes, and RLS policies

3. Set up Supabase Storage:

   - Go to Storage in your Supabase dashboard
   - Create a new bucket named `hubba-files`
   - Make it public (or configure RLS policies as needed)
   - Set up CORS if needed for your domain

### Privy Setup

1. Create a Privy account at [privy.io](https://privy.io)
2. Create a new app
3. Configure login methods (email, wallet, SMS as needed)
4. Enable embedded wallets
5. Copy your App ID to `.env.local`

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
hubba/
├── app/                    # Next.js app router pages
│   ├── dashboard/         # Creator dashboard pages
│   ├── share/             # Public shareable project pages
│   └── layout.tsx         # Root layout with Privy provider
├── components/            # React components
│   ├── AudioPlayer.tsx    # Audio playback component
│   ├── ClientDashboard.tsx
│   ├── SharedProjectPage.tsx
│   └── ...
├── lib/                   # Utilities and configurations
│   ├── supabase.ts        # Supabase client
│   └── types.ts           # TypeScript types
├── supabase/              # Database schema
│   └── schema.sql         # Database schema SQL
└── public/                # Static assets
```

## Database Schema

The app uses the following main tables:

- `users`: User accounts linked to Privy IDs
- `projects`: Music projects created by creators
- `tracks`: Individual tracks within projects
- `project_notes`: Private notes at the project level
- `track_notes`: Private notes at the track level
- `project_metrics`: Aggregated metrics (plays, shares, adds)
- `user_projects`: User's saved projects (for "Add to project" feature)
- `track_plays`: Individual play tracking events
- `project_shares`: Share tracking events

## Key Features in Detail

### Project Creation

Creators can:
- Upload cover images
- Add multiple MP3 tracks
- Set track titles and optional track images
- Configure download permissions
- Add private notes (project and track level)

### Shareable Links

Each project gets a unique share token that generates a URL like:
```
https://yourdomain.com/share/{share_token}
```

Anyone with the link can:
- View and listen to tracks
- Add the project to their saved projects (if logged in)
- Copy the link to share
- Download tracks (if enabled by creator)

### Metrics Tracking

The app automatically tracks:
- **Plays**: When a track is played
- **Shares**: When the share link is copied
- **Adds**: When a user adds the project to their saved projects

Metrics are visible to creators in the project dashboard.

## Future Enhancements

- 💰 Crypto payment integration for monetization
- 🎫 Tiered access control based on user support
- 📈 Advanced analytics dashboard
- 🎨 Customizable project themes
- 🔔 Notifications for creators
- 👥 Collaborator features

## Deployment

You only need credentials from **2 services** for the app to work:
- **Privy** (authentication)
- **Supabase** (database + storage)

Railway, Vercel, and other hosting platforms are just where you **deploy** the app - they don't require separate credentials. You'll just set the same environment variables in your hosting platform.

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Add the same environment variables from `.env.local` in Vercel dashboard:
   - `NEXT_PUBLIC_PRIVY_APP_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (if needed for server-side operations)
   - `NEXT_PUBLIC_APP_URL` (your Vercel deployment URL)
4. Deploy

### Railway (Alternative)

1. Create a new Railway project
2. Connect your GitHub repository
3. Add the same environment variables listed above
4. Deploy

### Other Platforms

You can deploy to any platform that supports Next.js (Netlify, AWS, etc.). Just make sure to:
- Set all environment variables in your hosting platform
- Update `NEXT_PUBLIC_APP_URL` with your production URL

## Contributing

This is a private project, but suggestions and improvements are welcome!

## License

Private project - All rights reserved
