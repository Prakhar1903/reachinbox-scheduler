# ReachInbox Email Job Scheduler & Dashboard

A production-grade, distributed email scheduling service and analytics dashboard built for [ReachInbox.ai](https://reachinbox.ai). Engineered to handle high-throughput cold email campaigns with rock-solid durability, concurrency safety, atomic rate-limiting, and real-time observability.

---

## 🏗 System Architecture

```
                       ┌─────────────────────────────────────────┐
                       │     Next.js 14 Dashboard (Port 3001)    │
                       │     Tailwind CSS • TanStack Query       │
                       └────────────────────┬────────────────────┘
                                            │ REST API / JWT Cookie
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │      Express Backend API (Port 4000)    │
                       │     TypeScript • Passport • Bull Board  │
                       └───────┬────────────┬────────────┬───────┘
                               │            │            │
            ┌──────────────────┼────────────┼────────────┼──────────────────┐
            ▼                  ▼            ▼            ▼                  ▼
     ┌──────────────┐   ┌─────────────┐  ┌───────┐  ┌──────────────┐   ┌─────────┐
     │  PostgreSQL  │   │ Redis (AOF) │  │ Slack │  │Elasticsearch │   │Ethereal │
     │  (Port 5433) │   │ (Port 6379) │  │ OAuth │  │  (Port 9200) │   │  SMTP   │
     └──────────────┘   └──────┬──────┘  └───────┘  └──────────────┘   └────▲────┘
                               │                                            │
                               │ BullMQ delayed sorted set                  │
                               ▼                                            │
                       ┌─────────────────────────────────────────┐          │
                       │  BullMQ Workers (concurrency = 5)       ├──────────┘
                       │  • Per-sender interval mutex lock       │
                       │  • Atomic Lua hourly rate limiting      │
                       │  • Rescheduling over-limit jobs         │
                       └─────────────────────────────────────────┘
```

---

## ⚡ Key Reliability Pillars

### 1. Idempotency & Durable Recovery (No Duplicate Sends)
* **Layer 1: BullMQ `jobId` Deduplication**: Every email job is queued with `jobId = email.id`. Even if an enqueue operation is executed multiple times, BullMQ discards duplicates.
* **Layer 2: PostgreSQL Constraint**: `bullJobId` is uniquely indexed in PostgreSQL.
* **Layer 3: Optimistic State Fence**: Before invoking SMTP, the worker transitions the email from `SCHEDULED`/`RATE_LIMITED` to `SENDING` using an atomic conditional update (`updateMany ... status in [...]`). If another worker acquired the job concurrently, the second worker receives `count == 0` and exits silently.
* **Layer 4: Startup Recovery Scan**: If the server restarts or crashes, `recoverPendingScheduledEmails()` runs on startup, finds orphaned jobs, and re-arms them into BullMQ with `jobId = email.id` (safe no-op if already present in Redis).

### 2. Rate Limiting Without Job Loss (Atomic Rescheduling)
* **Per-Sender Hourly Limit**: Configurable per campaign (e.g. `200 emails/hour`).
* **Atomic Redis Lua Script**: Increments counter and sets 1-hour TTL atomically in a single network round-trip (`INCR + EXPIRE`), eliminating Time-of-Check to Time-of-Use (TOCTOU) race conditions across multiple workers.
* **Reschedule, Never Drop**: When the sender reaches the hourly threshold:
  1. The pre-incremented counter is rolled back.
  2. The email status transitions to `RATE_LIMITED`.
  3. The job is automatically re-enqueued with a delay equal to the milliseconds remaining until the start of the next hour window (`getMsUntilNextHour()`).
  4. Original sequence and order are preserved.
  5. A real Slack notification is dispatched to the user's connected workspace.

### 3. Concurrency Safety & Minimum Send Intervals
* **Worker Concurrency**: Workers process jobs in parallel (`WORKER_CONCURRENCY=5`).
* **Per-Sender Interval Mutex**: Uses Redis atomic `SET lock:sender:{id} 1 NX PX {minDelayMs}`. If two workers pick up emails for the same sender simultaneously, only one acquires the slot; the second yields with a short backoff jitter, guaranteeing that providers never see bursts that violate minimum spacing (e.g. 2 seconds between emails from the same sender).
* **BullMQ Global Limiter**: Enforces global throughput throttling across all workers.

### 4. Protected Administration & Multi-Tenant Security
* All email, schedule, and search endpoints require a verified JWT Bearer token or HttpOnly cookie.
* **BullMQ Live Dashboard (`/admin/queues`)** is strictly protected by the authentication middleware. Unauthorized requests receive `401 Unauthorized` or are redirected to login.

### 5. Elasticsearch Search Indexing
* All emails are indexed in Elasticsearch (`reachinbox_emails`) at creation and state change.
* Full-text fuzzy search searches across `subject`, `body`, `toAddress`, and `senderAddress` with sub-millisecond response times.

---

## 🚀 Quick Start Guide

### Prerequisites
* Docker & Docker Compose
* Node.js v18+ (Node 22 recommended)
* `pnpm` (`npm install -g pnpm`)

### 1. Start Infrastructure (PostgreSQL, Redis, Elasticsearch)
```bash
docker compose up -d
```
Verify containers are healthy:
```bash
docker ps
```
Services exposed:
* PostgreSQL: `localhost:5433` (DB: `reachinbox`, user: `reachinbox`, password: `reachinbox`)
* Redis: `localhost:6379` (AOF + RDB persistence enabled)
* Elasticsearch: `localhost:9200`

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Setup Backend Database
```bash
cd apps/backend
npx prisma db push
```

### 4. Run the Dev Servers
From the root directory:
```bash
# Run both backend and frontend concurrently:
pnpm dev

# Or run separately:
pnpm dev:backend   # Express API on http://localhost:4000
pnpm dev:frontend  # Next.js on http://localhost:3001
```

---

## 🖥 Application Endpoints & Dashboards

| Service | URL | Description |
|---|---|---|
| **Frontend Dashboard** | `http://localhost:3001` | Full UI matching the Figma designs |
| **Login Screen** | `http://localhost:3001/login` | Google OAuth & 1-click test sign-in |
| **Scheduled Tab** | `http://localhost:3001/dashboard/scheduled` | List of upcoming scheduled emails |
| **Sent Tab** | `http://localhost:3001/dashboard/sent` | List of sent emails + Ethereal preview links |
| **Compose View** | `http://localhost:3001/dashboard/compose` | Compose, CSV Lead Uploader, Send Later Popover |
| **BullMQ Live Board** | `http://localhost:4000/admin/queues` | Queue metrics, delayed, active, completed jobs |
| **Backend Health** | `http://localhost:4000/health` | Health checks for DB, Redis, and Elasticsearch |

---

## 🧪 Testing & Verification

### Run Automated Unit Tests (Vitest)
Tests atomic rate limiting, rollback behavior, per-sender interval mutexes, and BullMQ deduplication:
```bash
cd apps/backend
pnpm test
```

### Run 1,000 Email Scheduler Load Test
Simulates scheduling 1,000 lead emails at scale under rate constraints:
```bash
cd apps/backend
pnpm test:load
```

---

## ⚙️ Environment Variables

### Backend (`apps/backend/.env`)
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# Databases
DATABASE_URL=postgresql://reachinbox:reachinbox@localhost:5433/reachinbox?schema=public
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200

# Authentication
JWT_SECRET=reachinbox_super_secret_jwt_key_2026_production_grade
JWT_EXPIRES_IN=7d

# Google OAuth 2.0 (Optional: fallback provided for instant evaluation)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Slack OAuth 2.0 (For real-time rate limit notifications)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/slack/oauth_redirect

# Worker Configuration
WORKER_CONCURRENCY=5
DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

### Frontend (`apps/frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
PORT=3001
```

---

## 📁 Monorepo Structure

```
.
├── apps/
│   ├── backend/
│   │   ├── prisma/             # PostgreSQL database schema & migrations
│   │   ├── src/
│   │   │   ├── config/         # Zod env, Redis connection, Prisma, Elasticsearch
│   │   │   ├── middleware/     # JWT authentication & Bull Board guard
│   │   │   ├── queues/         # BullMQ queue, worker, rate limiter, sender lock
│   │   │   ├── routes/         # Auth, Emails, Senders, Slack, Health
│   │   │   ├── services/       # Ethereal SMTP, Elasticsearch indexing, Slack
│   │   │   └── index.ts        # Server entrypoint & recovery bootstrap
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── app/            # Next.js 14 App Router pages (Figma match)
│       │   ├── components/     # UI components, Sidebar, TopBar, Compose, Popover
│       │   ├── hooks/          # TanStack query hooks for emails, auth, senders
│       │   └── lib/            # Axios API client & date utilities
│       └── package.json
├── docker-compose.yml          # PostgreSQL 16, Redis 7 (AOF), Elasticsearch 8.13
├── leads_sample.csv            # Sample lead file for CSV upload testing
├── pnpm-workspace.yaml
└── README.md
```
