# TikDL — TikTok Video Downloader

A production-ready SaaS application for downloading TikTok videos without watermarks. Built with Next.js 16, TypeScript, Tailwind CSS 4, and Prisma ORM.

## Features

- **No Watermark Downloads** — Clean, original-quality TikTok videos
- **Multiple Formats** — MP4 HD video, MP3 audio, cover image extraction
- **Unlimited & Free** — No signup, no caps, no paywalls
- **Mobile Friendly** — Fully responsive design for any device
- **Ad-Supported Interstitial** — Configurable countdown timer with auto-download
- **Admin Dashboard** — Stats, provider management, interstitial/ads configuration
- **Health Monitoring** — Database connectivity and service status checks
- **Analytics** — Download logs, success rates, response time tracking
- **Provider Fallback** — TikHub primary + RapidAPI redundancy

## Quick Start

### Prerequisites

- Node.js 18+ or Bun
- SQLite (bundled with Prisma)

### Installation

```bash
# Clone the repository
git clone <repo-url> && cd tikdl

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Initialize the database
bun run db:push
bun run db:generate

# Start development server
bun run dev
```

The app runs on `http://localhost:3000` by default.

### Production Build

```bash
bun run build
bun run start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite connection string (`file:./dev.db`) |
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Yes | Password for admin dashboard access |
| `TIKHUB_API_KEY` | Yes* | TikHub API key (primary provider) |
| `RAPIDAPI_KEY` | No | RapidAPI key (fallback provider) |
| `PROVIDER_NAME` | No | Default provider: `tikhub` or `rapidapi` |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL (optional auth/analytics) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key (optional auth/analytics) |

\* At least one provider API key is required for downloads to work.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Main downloader UI
│   ├── admin/page.tsx        # Admin dashboard
│   ├── api/
│   │   ├── download/route.ts # Video fetch endpoint
│   │   ├── config/ads/       # Public interstitial config
│   │   ├── admin/config/     # Admin config CRUD
│   │   ├── analytics/        # Analytics data
│   │   └── health/           # Health check
│   └── providers/            # Download provider modules
├── lib/
│   └── db.ts                 # Prisma client singleton
prisma/
│   └── schema.prisma         # Database schema
```

## API Endpoints

- `POST /api/download` — Fetch TikTok video info
- `GET /api/config/ads` — Public interstitial + ad config
- `GET/POST /api/admin/config` — Admin configuration management
- `GET /api/analytics` — Analytics summary (7-day, today, providers)
- `GET /api/health` — Service health check

## Deployment

Deploy to Vercel or any Node.js-compatible platform:

1. Set environment variables in your deployment platform
2. Run `prisma db push` to initialize the database
3. Build and deploy with `next build`

For SQLite deployments, ensure the database file path is writable.

## License

MIT License — see [LICENSE](./LICENSE) for details.
