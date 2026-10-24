# ReachInbox Full-Stack Email Job Scheduler & Dashboard

A production-grade, distributed cold email scheduling service and analytics dashboard built for **Outbox Labs / ReachInbox**. Engineered to handle high-throughput email campaigns with rock-solid durability, concurrency safety, atomic rate-limiting, and real-time observability.

---

## 📑 Table of Contents
1. [Architecture Overview](#-architecture-overview)
   - [How Scheduling Works](#1-how-scheduling-works)
   - [How Persistence on Restart is Handled](#2-how-persistence-on-restart-is-handled)
   - [How Rate Limiting & Concurrency are Implemented](#3-how-rate-limiting--concurrency-are-implemented)
2. [Features Implemented](#-features-implemented)
   - [Backend Features](#backend-features)
   - [Frontend Features](#frontend-features)
3. [Prerequisites & Setup](#-prerequisites--setup)
4. [How to Run Backend](#-how-to-run-backend)
5. [How to Run Frontend](#-how-to-run-frontend)
6. [Ethereal Email & Environment Variables](#-ethereal-email--environment-variables)
7. [Testing & Verification](#-testing--verification)
8. [Directory Structure](#-directory-structure)

---

## 🏗 Architecture Overview

```
                       ┌─────────────────────────────────────────┐
                       │     Next.js 14 Dashboard (Port 3001)    │
                       │     Tailwind CSS • TanStack React Query │
                       └────────────────────┬────────────────────┘
                                            │ REST API (JWT Cookie / Bearer)
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │      Express Backend API (Port 4000)    │
                       │     TypeScript • Prisma • Bull Board    │
                       └───────┬────────────┬────────────┬───────┘
                               │            │            │
            ┌──────────────────┼────────────┼────────────┼──────────────────┐
            ▼                  ▼            ▼            ▼                  ▼
     ┌──────────────┐   ┌─────────────┐  ┌───────┐  ┌──────────────┐   ┌─────────┐
     │  PostgreSQL  │   │ Redis (AOF) │  │ Slack │  │Elasticsearch │   │Ethereal │
     │  (Port 5433) │   │ (Port 6379) │  │Webhook│  │  (Port 9200) │   │  SMTP   │
     └──────────────┘   └──────┬──────┘  └───────┘  └──────────────┘   └────▲────┘
                               │                                            │
                               │ BullMQ Delayed Queue (Redis ZSET)          │
                               ▼                                            │
                       ┌─────────────────────────────────────────┐          │
                       │  BullMQ Workers (concurrency = 5)       ├──────────┘
                       │  • Per-sender interval mutex lock       │
                       │  • Atomic Lua hourly rate limiting      │
                       │  • Rescheduling over-limit jobs         │
                       │  • Optimistic state fences (SENDING)    │
                       └─────────────────────────────────────────┘
```

### 1. How Scheduling Works
* **Job Creation**: When a user schedules an email (or bulk uploads a CSV list of leads):
  1. The API validates parameters using Zod schemas (`senderId`, `toAddresses`, `subject`, `body`, `scheduledAt`, `delaySeconds`, `hourlyLimit`, and `attachments`).
  2. Each recipient receives a dedicated row in PostgreSQL with initial status `SCHEDULED`.
  3. The API calculates delay in milliseconds: `delay = Math.max(0, scheduledAt.getTime() - Date.now())`.
  4. The job is queued into BullMQ with `jobId = email.id` and the calculated delay. BullMQ stores delayed jobs in a Redis Sorted Set (`zset`) scored by execution timestamp.
  5. The email is simultaneously indexed in Elasticsearch for instant searchability.
* **Job Processing**:
  - The BullMQ worker (`emailWorker.ts`) listens to the queue. When the delay timestamp arrives, BullMQ automatically moves the job from the delayed set into the active set.
  - The worker checks per-sender rate limits and concurrency locks before sending.
  - If allowed, the worker delivers the email via Nodemailer through Ethereal SMTP, captures the test preview URL, updates the status to `SENT` in PostgreSQL, and updates the Elasticsearch index.

### 2. How Persistence on Restart is Handled
The scheduler uses a **4-layer idempotency and crash-recovery architecture** to guarantee zero missed and zero duplicate sends across system restarts:

1. **Redis Persistence (AOF + RDB)**: Redis is configured with `appendonly yes` and standard snapshotting. All BullMQ delayed and waiting jobs survive Redis container restarts.
2. **Deterministic `jobId` Deduplication**: Every email job is queued using its database UUID (`jobId = email.id`). If an enqueue operation is executed twice for the same email, BullMQ ignores the duplicate job.
3. **Optimistic State Fencing**: Before invoking SMTP, the worker transitions the email from `SCHEDULED`/`RATE_LIMITED` to `SENDING` using an atomic conditional query:
   ```ts
   prisma.email.updateMany({
     where: { id: emailId, status: { in: ['SCHEDULED', 'RATE_LIMITED'] } },
     data: { status: 'SENDING' }
   });
   ```
   If another worker acquired the job concurrently or if the email was already sent, `count === 0` and the worker immediately bails out.
4. **Startup Recovery Scanner**: When the backend server boots up, `recoverPendingScheduledEmails()` runs before workers accept new traffic:
   - Queries PostgreSQL for all emails with status `SCHEDULED` or `RATE_LIMITED`.
   - Re-enqueues each email into BullMQ with `jobId = email.id`. If BullMQ already holds the job in Redis, it is a safe no-op. If Redis was wiped or crashed, the jobs are restored seamlessly.

### 3. How Rate Limiting & Concurrency are Implemented

#### Hourly Per-Sender Rate Limiting (Atomic Lua Script)
* **Atomic Window Counter**: Rate limits are enforced on a per-sender basis per 1-hour window using Redis:
  ```lua
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  if current > tonumber(ARGV[2]) then
    return 0 -- Limit exceeded
  else
    return 1 -- Allowed
  end
  ```
  The script performs counter increment and expiration in a single round-trip, eliminating Time-of-Check to Time-of-Use (TOCTOU) race conditions.
* **Rescheduling Without Job Loss**:
  When a sender reaches their hourly capacity:
  1. The pre-incremented counter is rolled back via `DECR`.
  2. The email status transitions to `RATE_LIMITED`.
  3. The job is automatically re-enqueued with a delay equal to the milliseconds remaining until the start of the next hour window (`getMsUntilNextHour()`).
  4. A Slack notification is dispatched to the user's workspace alerting them that rate limits were reached and remaining emails were rescheduled.

#### Minimum Send Interval & Concurrency Safety
* **Parallel Workers**: The BullMQ worker operates with `concurrency = 5`, allowing multiple senders' emails to be dispatched in parallel.
* **Per-Sender Interval Mutex**: Uses a Redis distributed lock (`SET lock:sender:{id} 1 NX PX {minDelayMs}`). If two workers pick up emails for the same sender simultaneously, only one worker acquires the lock; the second worker yields with a short backoff jitter, guaranteeing that providers never see bursts that violate minimum spacing (e.g. 2 seconds between emails from the same sender).

---

## 🎯 Features Implemented

### Backend Features
- **Job Scheduler**: BullMQ persistent delayed queue with Redis, supporting single schedules and bulk lead imports.
- **Persistence & Recovery**: PostgreSQL database managed via Prisma ORM; automatic scanner re-arms scheduled jobs on backend restart.
- **Atomic Rate Limiter**: Redis Lua script enforcing hourly limits per sender with automatic rescheduling to the next hour window.
- **Concurrency & Locking**: Per-sender Redis mutex locks enforcing minimum spacing interval (`delaySeconds`); worker concurrency pool (`concurrency = 5`).
- **Nodemailer + Ethereal SMTP**: Auto-provisions 3 test senders with real Ethereal SMTP credentials; generates clickable email preview URLs for every sent email.
- **MIME File Attachments**: Supports file attachments (images, PDFs, documents) encoded in base64 and delivered via SMTP.
- **Elasticsearch Full-Text Search**: Fuzzy multi-match search index (`reachinbox_emails`) across subject, body, recipient, and sender.
- **Authentication & Security**: Google OAuth 2.0 (Passport.js), JWT cookie/bearer validation, demo login fallback, and auth-protected Bull Board UI at `/admin/queues`.
- **Slack Alerts**: Pre-flight verified Incoming Webhook & OAuth integrations that deliver real-time notifications when sender rate limits are reached.
- **Health Probes**: `/health` endpoint checking PostgreSQL, Redis, and Elasticsearch connectivity.

### Frontend Features
- **Figma Design Fidelity**: Clean, airy layout matching the design specifications with generous vertical padding, responsive navigation, and ONB branding.
- **Authentication**: Google OAuth 2.0 sign-in button with a 1-click Demo Login fallback.
- **Scheduled & Sent Tabs**:
  - Displays emails in single-line spacious rows (`py-5 px-8`).
  - Formatted recipient names (`To: Sarah Wilson`).
  - Inline status badges (Scheduled with time pill, Sent, Rate Limited, Sending).
  - Hover actions for starring and Ethereal preview links.
- **Detail View (`/dashboard/[id]`)**:
  - Clean email reader with HTML body rendering.
  - Interactive attachment thumbnail cards matching Figma with file size and download button.
  - Action buttons: Star toggle (amber fill), Archive, and Delete with confirm dialog.
- **Compose Modal (`/dashboard/compose`)**:
  - Multi-recipient "To" field supporting keyboard input (`Enter`, `,`), blur, paste, and chip removal.
  - CSV Lead Uploader powered by PapaParse for bulk campaign scheduling.
  - Send Later date-time picker with quick presets (+2 min, tomorrow 10am/11am/3pm).
  - Rate limiting & interval controls (Delay between 2 emails in seconds; Hourly limit).
- **Interactive Rich-Text Editor**:
  - Full 14-function toolbar: Undo, Redo, Typography menu (Normal, H1, H2, H3), Bold, Italic, Underline, Strikethrough, Text Alignment cycle (Left/Center/Right), Numbered List, Bulleted List, Indent, Outdent, Blockquote, Code block.
  - Dynamic active indicator highlights in green (`#029E4D`).
  - `onMouseDown` preventDefault preservation of text selections.
- **Top Bar**:
  - Live Elasticsearch search input with loading spinner.
  - Filter & Sort dropdown: All Emails, Starred Only, Archived Only, Sort by Date (Newest/Oldest).
  - Refresh button with animated rotation and toast feedback.
- **Slack Integration Modal**:
  - Pre-flight verified Incoming Webhook and OAuth connection options.
  - "Send Test Notification" button to test delivery into Slack channels.

---

## 💻 Prerequisites & Setup

Ensure you have the following installed:
- **Docker** and **Docker Compose**
- **Node.js** (v18+ or v20+)
- **pnpm** (`npm install -g pnpm`)

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd "Outbox Labs"
pnpm install
```

### 2. Start Infrastructure via Docker Compose
From the repository root:
```bash
docker compose up -d
```
Verify that all 3 containers are healthy:
```bash
docker ps
```
The services exposed are:
| Container | Service | Host Port | Internal Port |
|---|---|---|---|
| `reachinbox_postgres` | PostgreSQL 16 | **5433** | 5432 |
| `reachinbox_redis` | Redis 7 (AOF) | **6379** | 6379 |
| `reachinbox_elasticsearch` | Elasticsearch 8.13 | **9200** | 9200 |

*(Note: PostgreSQL runs on host port `5433` to avoid conflicts with any local PostgreSQL instance on `5432`)*.

---

## 🚀 How to Run Backend

### 1. Configure Backend Environment
Navigate to `apps/backend/`:
```bash
cd apps/backend
```
Ensure `.env` contains the required database and service URLs (see [Environment Variables](#-ethereal-email--environment-variables)).

### 2. Push Database Schema
```bash
pnpm prisma db push
```

### 3. Start the Backend API & Queue Worker
```bash
pnpm dev
```
The Express server starts on **`http://localhost:4000`**:
- Initializes the Elasticsearch `reachinbox_emails` index.
- Auto-provisions 3 Ethereal SMTP test senders.
- Scans and recovers any pending scheduled emails into BullMQ.
- Starts the BullMQ worker pool (`concurrency = 5`).
- Mounts the authenticated Bull Board UI at `http://localhost:4000/admin/queues`.

---

## 🎨 How to Run Frontend

### 1. Configure Frontend Environment
In a new terminal window:
```bash
cd apps/frontend
```
Ensure `.env.local` contains:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
PORT=3001
```

### 2. Start Next.js Development Server
```bash
pnpm dev
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser.

---

## 📧 Ethereal Email & Environment Variables

### How Ethereal Email is Configured
This application uses **[Ethereal Email](https://ethereal.email/)** (a fake SMTP service provided by Nodemailer) so that no real emails are sent to actual inboxes, but full SMTP transactions are generated and verifiable:

1. **Auto-Provisioning**: On startup, `senderService.ts` checks if senders exist. If empty, it creates 3 Ethereal test accounts via `nodemailer.createTestAccount()` and stores their SMTP credentials in PostgreSQL.
2. **Preview Links**: When an email is sent, Nodemailer captures the message URL:
   ```ts
   const etherealUrl = nodemailer.getTestMessageUrl(info);
   ```
3. **One-Click Viewing**: Every sent email row and detail view displays a **"View in Ethereal"** / **"Preview"** link that opens the rendered HTML message, headers, and attachments in your browser.

### Environment Variable Reference

#### Backend (`apps/backend/.env`)
```env
# Application
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# PostgreSQL (Host port 5433)
DATABASE_URL=postgresql://reachinbox:reachinbox@localhost:5433/reachinbox?schema=public

# Redis (Host port 6379)
REDIS_URL=redis://localhost:6379

# Elasticsearch (Host port 9200)
ELASTICSEARCH_URL=http://localhost:9200

# Authentication (JWT)
JWT_SECRET=reachinbox_super_secret_jwt_key_2026_production_grade
JWT_EXPIRES_IN=7d

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Slack Integration (Optional for OAuth; Webhooks work out-of-the-box)
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:4000/slack/oauth_redirect

# Queue & Rate Limiting Defaults
WORKER_CONCURRENCY=5
DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

#### Frontend (`apps/frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
PORT=3001
```

---

## 🧪 Testing & Verification

### 1. Run Backend Unit Tests (Vitest)
Executes isolated tests for the Lua atomic rate limiter, per-sender interval mutexes, and BullMQ deduplication:
```bash
cd apps/backend
pnpm test
```

### 2. Run 1,000-Email Load Test Simulation
Tests bulk enqueueing throughput, PostgreSQL transactions, and queue persistence:
```bash
cd apps/backend
pnpm test:load
```

### 3. Verify Restart Idempotency
1. Schedule 5 emails for 2 minutes in the future from the UI.
2. Kill the backend process (`Ctrl + C`).
3. Restart the backend (`pnpm dev`).
4. Notice the recovery log: `[Recovery] Scanning database... Successfully verified/restored X jobs in BullMQ`.
5. Observe that emails dispatch at their scheduled times with **zero duplicate sends**.

---

## 📁 Directory Structure

```
.
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   └── schema.prisma           # Prisma schema (User, Sender, Email)
│   │   ├── src/
│   │   │   ├── config/                 # Zod env, Redis, Prisma, Elasticsearch clients
│   │   │   ├── middleware/             # JWT auth & Bull Board guard
│   │   │   ├── queues/
│   │   │   │   ├── emailQueue.ts       # BullMQ Queue instance & scheduleEmailJob
│   │   │   │   ├── emailWorker.ts      # BullMQ Worker, recovery scanner & state transitions
│   │   │   │   ├── rateLimiter.ts      # Atomic Redis Lua script rate limiter
│   │   │   │   └── senderLock.ts       # Per-sender interval mutex lock
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts             # Google OAuth, demo login & /auth/me
│   │   │   │   ├── emails.ts           # Schedule, list, detail, star, archive, delete
│   │   │   │   ├── senders.ts          # List & add SMTP senders
│   │   │   │   ├── slack.ts            # Slack OAuth, webhook connection & test routes
│   │   │   │   └── health.ts           # Health probe endpoint
│   │   │   ├── services/
│   │   │   │   ├── emailService.ts     # Nodemailer Ethereal SMTP transporter & sender
│   │   │   │   ├── searchService.ts    # Elasticsearch indexing & fuzzy search
│   │   │   │   ├── senderService.ts    # Ethereal auto-provisioning
│   │   │   │   └── slackService.ts     # Slack notification dispatch
│   │   │   └── index.ts                # Express app entrypoint & Bull Board mount
│   │   └── package.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── app/
│       │   │   ├── dashboard/
│       │   │   │   ├── [id]/page.tsx   # Email detail view with attachment cards
│       │   │   │   ├── compose/page.tsx# Compose view
│       │   │   │   ├── scheduled/      # Scheduled emails list & search
│       │   │   │   ├── sent/           # Sent emails list & search
│       │   │   │   └── layout.tsx      # Authenticated dashboard shell & sidebar
│       │   │   ├── login/page.tsx      # Google OAuth & Demo login
│       │   │   └── layout.tsx          # Providers & Sonner toast container
│       │   ├── components/
│       │   │   ├── compose/
│       │   │   │   ├── ComposeForm.tsx # Rich-text editor, chips, file picker
│       │   │   │   ├── CsvUploader.tsx # CSV lead parser (PapaParse)
│       │   │   │   └── SendLaterPopover.tsx # Date & time schedule selector
│       │   │   ├── email/
│       │   │   │   └── EmailRow.tsx    # Figma-accurate airy list rows
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx     # Navigation & Bull Board link
│       │   │   │   ├── TopBar.tsx      # Search, filter dropdown, animated refresh
│       │   │   │   └── SlackModal.tsx  # Pre-flight verified Slack connection modal
│       │   │   └── ui/                 # Buttons, Badges, Empty states
│       │   ├── hooks/                  # TanStack Query custom hooks
│       │   ├── lib/                    # Axios API instance & date formatters
│       │   └── types/                  # TypeScript interface definitions
│       └── package.json
│
├── docker-compose.yml                  # PostgreSQL (5433), Redis (6379), ES (9200)
├── leads_sample.csv                    # Sample CSV leads for import testing
├── pnpm-workspace.yaml
└── README.md
```
