# ReachInbox - Full-Stack Email Job Scheduler

A full-stack email scheduling application built for the ReachInbox Software Development Intern assignment.

The application provides a dashboard for scheduling and tracking emails, with persistent background processing using BullMQ and Redis, PostgreSQL persistence through Prisma, Ethereal SMTP for test email delivery, and Google OAuth authentication.

---

## Features

### Backend

- TypeScript + Express.js API
- PostgreSQL database with Prisma ORM
- BullMQ job queue backed by Redis
- Persistent delayed email scheduling
- Ethereal Email SMTP integration
- Configurable worker concurrency
- Minimum delay between email sends
- Per-sender hourly rate limiting
- Redis-backed rate-limit counters
- Automatic rescheduling when hourly limits are reached
- Idempotency protection
- Retry handling with exponential backoff
- Server restart persistence
- Email attachments
- Scheduled and sent email APIs
- Soft delete and archive support

### Frontend

- React + TypeScript
- Vite
- Tailwind CSS
- Google OAuth login
- Email/password registration and login
- Dashboard with Scheduled and Sent tabs
- Compose email screen
- CSV/text recipient import
- Recipient count and validation
- Configurable start time
- Configurable delay between emails
- Configurable hourly limit
- File attachments
- Search
- Starred/archive/deleted filters
- Archive/unarchive
- Delete/restore
- Email detail view
- Loading and empty states
- Refresh and auto-refresh
- Responsive layout

---

## Tech Stack

### Backend

- TypeScript
- Express.js
- BullMQ
- Redis
- PostgreSQL
- Prisma
- Nodemailer
- Ethereal Email
- Google Auth Library
- JWT
- bcryptjs

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Axios
- Lucide React

### Infrastructure

- Docker
- PostgreSQL
- Redis

---

# Architecture

```text
                    ┌─────────────────────┐
                    │      React UI       │
                    │   Vite + Tailwind   │
                    └──────────┬──────────┘
                               │ HTTP / JWT
                               ▼
                    ┌─────────────────────┐
                    │   Express Backend   │
                    │      TypeScript     │
                    └───────┬─────┬───────┘
                            │     │
                 ┌──────────┘     └──────────┐
                 ▼                           ▼
        ┌─────────────────┐          ┌─────────────────┐
        │   PostgreSQL    │          │ Redis / BullMQ  │
        │     Prisma      │          │ Delayed Jobs    │
        └─────────────────┘          └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ BullMQ Worker   │
                                      │  Concurrency    │
                                      └────────┬────────┘
                                               │
                                  Rate limit + delay
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ Ethereal SMTP   │
                                      └─────────────────┘
```

---

# Project Structure

```text
reachinbox-assignment/
│
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   │
│   ├── src/
│   │   ├── auth/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── db/
│   │   ├── middleware/
│   │   ├── queues/
│   │   ├── routes/
│   │   ├── services/
│   │   └── workers/
│   │
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── ...
│   ├── .env
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml
└── README.md
```

---

# Requirements

Install the following before running the project:

- Node.js
- npm
- Docker Desktop
- A Google Cloud project for Google OAuth
- An Ethereal Email account

---

# 1. Start PostgreSQL and Redis

From the project root:

```bash
docker-compose up -d
```

This starts:

- PostgreSQL on port `5432`
- Redis on port `6379`

Check the containers:

```bash
docker-compose ps
```

---

# 2. Backend Setup

Open a terminal:

```bash
cd backend
npm install
```

Create:

```text
backend/.env
```

Example:

```env
DATABASE_URL="postgresql://reachinbox:reachinbox@localhost:5432/reachinbox"

REDIS_HOST=localhost
REDIS_PORT=6379

PORT=5000
FRONTEND_URL=http://localhost:5173

WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
DEFAULT_HOURLY_LIMIT=100

ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=your_ethereal_username
ETHEREAL_PASSWORD=your_ethereal_password

GOOGLE_CLIENT_ID=your_google_client_id
AUTH_SECRET=your_long_random_secret
```

Do not commit the real `.env` file to GitHub.

---

# 3. Database Setup

From `backend`:

```bash
npx prisma generate
```

Apply migrations:

```bash
npx prisma migrate dev
```

The database contains the main models:

```text
User
  │
  └── Sender
        │
        └── Campaign
              │
              └── Email
```

---

# 4. Start Backend API

From `backend`:

```bash
npm run dev
```

The API runs on:

```text
http://localhost:5000
```

---

# 5. Start BullMQ Worker

Open another terminal:

```bash
cd backend
npm run worker
```

The worker processes scheduled email jobs independently from the API server.

For a production-style run using compiled TypeScript:

```bash
npm run build
npm start
```

Worker:

```bash
npm run start:worker
```

---

# 6. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create:

```text
frontend/.env
```

Add:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

Start the frontend:

```bash
npm run dev
```

The Vite development server will display the URL in the terminal.

---

# Google OAuth Setup

Google login uses real Google OAuth / Google Identity Services.

Create a Google Cloud project and configure an OAuth client.

The frontend uses:

```env
VITE_GOOGLE_CLIENT_ID=...
```

The backend uses:

```env
GOOGLE_CLIENT_ID=...
```

The Google client ID must match between frontend and backend.

For local development, configure the appropriate localhost origin in the Google OAuth client.

The authentication flow is:

```text
User clicks Google Sign-In
        ↓
Google authenticates the user
        ↓
Google credential JWT returned to frontend
        ↓
Frontend sends credential to backend
        ↓
Backend verifies credential
        ↓
User is created/found in PostgreSQL
        ↓
Sender is created/found
        ↓
Backend returns authenticated session
        ↓
Frontend opens dashboard
```

The dashboard displays the authenticated user's:

- Name
- Email
- Avatar

Logout clears the local session.

---

# Email Scheduling Flow

When a user schedules emails:

```text
1. Frontend submits scheduling request
2. Backend validates request
3. Sender is verified
4. Campaign is created in PostgreSQL
5. Individual Email records are created
6. Each email receives a scheduledAt timestamp
7. BullMQ delayed jobs are created
8. Worker waits until the job becomes available
9. Worker checks rate limits
10. Worker enforces minimum send delay
11. Worker sends through Ethereal SMTP
12. Email is marked SENT or FAILED
```

The scheduler does **not** use cron.

BullMQ delayed jobs are used for scheduling.

---

# Persistence and Server Restart

Email scheduling state is stored in two places:

### PostgreSQL

Stores:

- Campaign
- Email
- Recipient
- Scheduled time
- Status
- Attempts
- Message ID
- Error information
- Archive/delete state

### Redis / BullMQ

Stores the background jobs and their delayed execution state.

Because scheduled jobs are persisted, restarting the API/worker does not require recreating the schedule from scratch.

The worker resumes processing pending jobs from Redis and the corresponding email state remains available in PostgreSQL.

---

# Worker Concurrency

Worker concurrency is configurable through:

```env
WORKER_CONCURRENCY=5
```

The BullMQ worker uses this configuration to process multiple jobs concurrently.

This allows the system to process multiple scheduled emails without creating a separate worker process for every email.

---

# Minimum Delay Between Emails

The minimum send delay is configurable:

```env
MIN_EMAIL_DELAY_MS=2000
```

The default is:

```text
2000 ms = 2 seconds
```

Redis-backed synchronization is used so multiple workers do not bypass the minimum delay.

Campaigns can also provide their own delay value through the scheduling API.

---

# Hourly Rate Limiting

The scheduler supports an hourly email limit.

The limit can be configured globally through:

```env
DEFAULT_HOURLY_LIMIT=100
```

A campaign can also provide its own hourly limit.

The rate limiter uses Redis-backed counters keyed by sender and hourly time window.

Conceptually:

```text
email-rate:<senderId>:<hour-window>
```

The flow is:

```text
Email job starts
      ↓
Check/increment Redis counter
      ↓
Under hourly limit?
   /           YES           NO
 ↓              ↓
Send         Reschedule
               ↓
       Next available hour
```

Jobs are not permanently failed or dropped when the hourly limit is reached.

---

# Handling Large Batches

The system is designed to handle large numbers of scheduled emails.

For example, if 1000 emails are scheduled around the same time:

```text
1000 Email DB records
        +
1000 BullMQ delayed jobs
        ↓
BullMQ worker
        ↓
Concurrency control
        ↓
Minimum delay
        ↓
Hourly rate limit
        ↓
SMTP sending
```

When the configured hourly limit is reached, remaining jobs are rescheduled into the next available hourly window.

This prevents the SMTP provider from being overloaded while keeping scheduled work persistent.

---

# Idempotency

Each campaign has an `idempotencyKey`.

The database enforces uniqueness on this value.

When a scheduling request is received:

```text
idempotencyKey already exists?
        │
    ┌───┴───┐
    │       │
   YES      NO
    │       │
Return    Create
existing  campaign
campaign
```

This prevents duplicate campaign creation when the same scheduling request is submitted more than once.

The worker also checks email state before sending so an already-sent email is not sent again.

---

# Retry Handling

Failed jobs use BullMQ retry behavior with exponential backoff.

This allows transient failures to be retried without immediately losing the email job.

Email state is persisted in PostgreSQL so attempts and failure information remain available.

---

# Ethereal Email

Ethereal Email is used as the fake SMTP provider for development and testing.

Configure:

```env
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=your_ethereal_username
ETHEREAL_PASSWORD=your_ethereal_password
```

Ethereal does not deliver emails to real recipients.

Instead, it provides a preview URL for inspecting the generated email.

This is useful for demonstrating:

- Subject
- Body
- Recipient
- Sender
- Attachments
- Message ID

---

# Attachments

The compose screen supports file attachments.

The frontend:

1. Accepts files from the user
2. Reads them locally
3. Shows attachment names and sizes
4. Sends attachment data with the scheduling request
5. Backend validates attachment count and size
6. Ethereal receives the attachments when the email is sent

Current limits:

```text
Maximum attachments: 10
Maximum combined size: 18 MB
```

---

# Dashboard

The dashboard provides:

### Scheduled Emails

Displays:

- Recipient
- Subject
- Scheduled time
- Status

### Sent Emails

Displays:

- Recipient
- Subject
- Sent time
- Status

### Email Detail

Displays the complete email information and available attachment/preview information.

### Search

Searches email information including recipient, subject and body.

### Filters

Supports:

- Starred
- Archived
- Deleted

### Archive

Archived emails can be restored/unarchived.

### Delete

Emails are soft-deleted rather than immediately removed from the database.

This allows deleted state to be tracked without losing the underlying record.

---

# API Overview

## Authentication

```text
POST /api/auth/google
POST /api/auth/login
POST /api/auth/register
GET  /api/auth/me
POST /api/auth/logout
```

## Email Scheduling

```text
POST /api/emails/schedule
GET  /api/emails/scheduled
GET  /api/emails/sent
```

The scheduling API accepts information including:

```text
senderId
subject
body
startTime
delayMs
hourlyLimit
recipients
idempotencyKey
attachments
```

---

# Example Scheduling Request

```json
{
  "senderId": "sender-id",
  "subject": "ReachInbox Test",
  "body": "This is a scheduled test email.",
  "startTime": "2026-08-20T10:00:00.000Z",
  "delayMs": 2000,
  "hourlyLimit": 20,
  "recipients": [
    "test@example.com",
    "another@example.com"
  ],
  "idempotencyKey": "campaign-test-001"
}
```

---

# Testing Workflow

1. Start Docker:

```bash
docker-compose up -d
```

2. Start backend:

```bash
cd backend
npm run dev
```

3. Start worker:

```bash
cd backend
npm run worker
```

4. Start frontend:

```bash
cd frontend
npm run dev
```

5. Sign in using Google.

6. Open Compose.

7. Add recipients.

8. Enter subject and body.

9. Set a future start time.

10. Configure delay and hourly limit.

11. Schedule the emails.

12. Open Scheduled.

13. Wait until the scheduled time.

14. Open Sent.

15. Open a sent email and inspect its Ethereal preview.

---

# Persistence Test

To demonstrate restart persistence:

1. Schedule an email for a few minutes in the future.
2. Stop the backend.
3. Stop the worker.
4. Keep PostgreSQL and Redis running.
5. Restart the backend.
6. Restart the worker.
7. Verify that the scheduled job remains available.
8. Verify that the email is eventually sent at the scheduled time.

This demonstrates that the scheduler does not depend on an in-memory timer or cron job.

---

# Build Verification

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```

Both should complete without TypeScript/build errors before submission.

---

# Environment Variables

## Backend

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `PORT` | Express server port |
| `FRONTEND_URL` | Frontend origin used by CORS |
| `WORKER_CONCURRENCY` | BullMQ worker concurrency |
| `MIN_EMAIL_DELAY_MS` | Minimum delay between sends |
| `DEFAULT_HOURLY_LIMIT` | Default hourly sender limit |
| `ETHEREAL_HOST` | Ethereal SMTP host |
| `ETHEREAL_PORT` | Ethereal SMTP port |
| `ETHEREAL_USER` | Ethereal SMTP username |
| `ETHEREAL_PASSWORD` | Ethereal SMTP password |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `AUTH_SECRET` | JWT/session signing secret |

## Frontend

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

---

# Assumptions and Trade-offs

- Ethereal Email is used instead of a production SMTP provider because the assignment requires fake SMTP for testing.
- PostgreSQL is used as the relational database.
- Redis is used for both BullMQ persistence and distributed rate-limit synchronization.
- Emails are represented individually in the database even when scheduled as part of one campaign.
- Rate-limit overflow is rescheduled rather than permanently failed.
- Rescheduled jobs may not preserve perfect ordering when multiple jobs compete across hourly windows.
- Email attachments are handled using the assignment's frontend/backend attachment flow and are subject to the configured size limits.
- Soft delete is used so deleted records remain available for state tracking.
- The frontend is kept organized around reusable React components while the current implementation remains centered around the main application file.

---

# Assignment Requirement Mapping

| Assignment Requirement | Implementation |
|---|---|
| TypeScript backend | TypeScript + Express |
| React frontend | React + TypeScript |
| PostgreSQL | Prisma + PostgreSQL |
| Redis | Redis |
| BullMQ | Delayed email jobs |
| No cron | BullMQ delayed jobs |
| Ethereal SMTP | Nodemailer + Ethereal |
| Persistence | PostgreSQL + Redis/BullMQ |
| Idempotency | Unique campaign idempotency key |
| Worker concurrency | Configurable BullMQ concurrency |
| Minimum delay | Redis-backed send lock |
| Hourly limit | Redis-backed sender counters |
| Rate-limit rescheduling | BullMQ job rescheduling |
| Google OAuth | Google Identity Services + backend verification |
| Compose | React compose screen |
| CSV/text recipients | Recipient parser |
| Scheduled emails | Scheduled API + dashboard |
| Sent emails | Sent API + dashboard |
| Loading states | Implemented |
| Empty states | Implemented |
| Search | Implemented |
| Filters | Implemented |
| Attachments | Implemented |
| Archive/unarchive | Implemented |
| Delete/restore | Implemented |
| Responsive UI | Tailwind responsive layout |

---

## License

This project was created as part of the ReachInbox Software Development Intern assignment.
