# Deployed Link : https://leetrack-client.vercel.app/
# LeetTrack

A minimalist, dark-themed spaced-repetition tracker for LeetCode practice. Log a question by number — everything else (difficulty, topics, optimal complexity, pattern) is fetched and AI-enriched automatically, and fresh solves sync in on their own. Reviews land on calendar checkpoints (5th/10th/15th/20th of the month, with a Monthly Milestone Exam on the 30th), each with an auto-generated Milestone Exam mixing your own tracked questions with AI-suggested similar ones on the same topics.

## Features

- **One-field logging** — type a question number, LeetCode's own data (title, difficulty, topics) is fetched automatically, and a free LLM fills in optimal time/space complexity and the core pattern.
- **Automatic LeetCode sync** — connect your username once and freshly solved questions log themselves in the background; the Log page is reserved for backlog you haven't tracked yet.
- **AI code review** — paste your solution and get an estimated complexity + correctness feedback.
- **Calendar-based spaced repetition** — questions come due on the 5th/10th/15th/20th of the month, then a Monthly Milestone Exam on the 30th, advancing or resetting based on your logged confidence.
- **Milestone Exams** — each checkpoint auto-builds a topic-scoped exam from what you practiced since the last one (the monthly exam covers the whole month), mixing already-tracked questions with AI-suggested similar ones, skewed toward Medium difficulty.
- **Timely tracker & monthly timeline** — daily/monthly submission counts split into new vs. revised vs. backlog, plus a visual monthly schedule of every upcoming Milestone Exam.
- **Shuffled, timed tests** — build a test from due/overdue/all questions, filtered by difficulty or topic, with a per-question and total timer.
- **Scoring & history** — difficulty-weighted scores, accuracy by topic/difficulty, full test history (deletable).
- **Real LeetCode activity heatmap** — connect your username to pull your actual submission calendar, total solved counts, and streak.
- **Bulk import** — paste your notebook backlog, or pull your last 20 accepted submissions from LeetCode directly (deduped against what's already logged).
- **AI analysis page** — topic/difficulty distribution, confidence and score trends, topic accuracy, and an AI-generated plan (strengths, weak topics, suggested topics, and specific LeetCode question numbers — validated against the real API, not hallucinated).
- **Dark, minimalist UI** — Inter + JetBrains Mono, subtle depth, no clutter.

## Tech stack

- **Client**: React 18, Vite, TypeScript, Tailwind CSS v4, TanStack Query, React Router, Recharts, lucide-react
- **Server**: Express, TypeScript, Postgres (via [Supabase](https://supabase.com), using `postgres.js`)
- **AI**: [Groq](https://console.groq.com) (`llama-3.3-70b-versatile`) — free tier, no billing required
- **Data**: LeetCode's public GraphQL/REST endpoints (no login required; company tags and full submission history are LeetCode Premium/session-only and intentionally out of scope)

## Project structure

```
leetrack/
  client/   React + Vite frontend
  server/   Express + Postgres backend
```

npm workspaces tie the two together for local dev; they deploy as two separate services (see below).

## Local development

```bash
npm install                        # installs both workspaces
cp server/.env.example server/.env # then add GROQ_API_KEY and DATABASE_URL
npm run dev                        # runs client (5173) + server (4000) together
```

- Get a free Groq API key at [console.groq.com/keys](https://console.groq.com/keys). The app works without it — AI-derived fields just stay unset until it's added.
- Get a free Postgres database at [supabase.com](https://supabase.com): new project → Project Settings → Database → Connection string → copy the **Session pooler** URI into `DATABASE_URL`. The schema is created automatically on first boot.

## Deployment

The database lives on Supabase (always-on, independent of the backend process), so the backend itself just needs a host that keeps a long-running Node process — not a stateless serverless platform. This repo is set up for **backend on Render + frontend on Vercel**:

**Backend (Render)**
1. New → Blueprint → connect this repo (Render reads `render.yaml` at the repo root automatically)
2. Set the `GROQ_API_KEY` and `DATABASE_URL` environment variables on the service
3. Note the deployed URL (e.g. `https://leetrack-api.onrender.com`)

**Frontend (Vercel)**
1. Import this repo, set **Root Directory** to `client`
2. Add environment variable `VITE_API_URL` = your Render backend URL (no trailing slash)
3. Deploy — `client/vercel.json` already handles SPA routing

## License

MIT
