# 🛡️ AI Threat Detection

**AI-Powered Real-Time Safety & Threat Monitoring Platform**

AI Threat Detection is a full-stack, real-time threat detection system that leverages multi-provider AI vision models (OpenAI GPT-4.1, Anthropic Claude, Google Gemini) to analyze video streams, webcam feeds, and images for safety threats. It supports both **physical surveillance** (violence, weapons, medical emergencies) and **online safety** (grooming, abuse, coercion) use cases — scoring, escalating, and alerting in real time.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Express](https://img.shields.io/badge/Express-4.x-000000)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-06B6D4)

---

## 📑 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Default Credentials](#default-credentials)
- [API Reference](#api-reference)
- [Real-Time Events (WebSocket)](#real-time-events-websocket)
- [External Ingestion API](#external-ingestion-api)
- [AI Providers](#ai-providers)
- [Threat Scoring & Escalation](#threat-scoring--escalation)
- [Alert System](#alert-system)
- [Screenshots](#screenshots)

---

## Overview

AI Threat Detection provides a unified platform for monitoring physical and digital environments for safety threats. The system processes media inputs through a multi-stage AI pipeline:

1. **Ingest** — Upload videos/images, stream from webcam/screen capture, or push via external API
2. **Process** — Videos are split into chunks and converted to GIFs; images are sent directly
3. **Analyze** — AI vision models analyze each frame/chunk with structured JSON output
4. **Score** — Configurable weighted scoring with per-source or global thresholds
5. **Escalate** — Pattern-based escalation rules detect sustained or recurring threats
6. **Alert** — Real-time notifications via WebSocket, webhooks (HMAC-signed), and browser push

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────────┐ │
│  │ Monitor  │ │ Dashboard │ │ Analytics │ │ Settings/Alerts  │ │
│  │  Page    │ │   Page    │ │   Page    │ │     Pages        │ │
│  └────┬─────┘ └─────┬─────┘ └─────┬─────┘ └───────┬──────────┘ │
│       │              │             │               │            │
│       └──────────────┴─────────────┴───────────────┘            │
│                          │ REST API + Socket.IO                 │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                   Backend (Express + Socket.IO)                 │
│                          │                                      │
│  ┌───────────────────────┴────────────────────────────────────┐ │
│  │                    Route Layer                              │ │
│  │  /api/auth  /api/sources  /api/jobs  /api/alerts           │ │
│  │  /api/dashboard  /api/ingest  /api/health                  │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                      │
│  ┌───────────────────────┴────────────────────────────────────┐ │
│  │                   Service Layer                             │ │
│  │  jobQueue → videoProcessor → aiAnalyzer/aiProviders        │ │
│  │  → threatScorer → contextMemory → escalation               │ │
│  │  → alertService → streamProcessor                          │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                      │
│  ┌───────────────────────┴────────────────────────────────────┐ │
│  │              Database Layer (Drizzle ORM)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │  PostgreSQL 16      │
                │  (Docker Container) │
                └─────────────────────┘
```

---

## Features

### 🔍 Dual-Mode Threat Detection

- **Physical Mode** — Analyzes video/webcam feeds for: violence, weapons, fire/smoke, medical emergencies, nudity/indecency, public disturbance, suspicious behavior, vandalism, trespassing
- **Online Mode** — Analyzes screenshots/images for: grooming, sexual content, abuse/bullying, coercion/threats, manipulation, self-harm, drug references, hate speech, personal info exposure

### 🤖 Multi-Provider AI Engine

- **OpenAI** GPT-4.1-mini (default) with structured JSON schema enforcement
- **Anthropic** Claude via direct HTTP API with automatic fallback
- **Google** Gemini via direct HTTP API with automatic fallback
- Hot-swappable provider selection from the UI (admin only)
- 3-attempt retry per provider with exponential backoff, plus cross-provider fallback

### 🎥 Video Processing Pipeline

- Automatic video splitting into configurable-length chunks (default: 5 seconds) via ffmpeg
- Chunk-to-GIF conversion (5 fps, 512px width) optimized for AI vision model input
- Concurrent job processing with configurable parallelism (`MAX_CONCURRENT_JOBS`)
- Supports `.mp4`, `.avi`, `.mkv`, `.mov`, `.webm`, `.gif`, `.png`, `.jpg`, `.jpeg`, `.webp`

### 📡 Real-Time Live Streaming

- **Webcam capture** — Browser `getUserMedia` → frame extraction every 3s → Socket.IO transport
- **Screen capture** — Browser `getDisplayMedia` → same pipeline
- **HLS/DASH streams** — URL-based ingestion via ffmpeg child process with configurable frame interval
- Live video preview in the browser with frame count tracking

### 📊 Configurable Threat Scoring

- Per-category weights stored in the database — fully editable from the UI
- Score calculation: sum of triggered category weights, capped at 100
- Four severity levels: **Safe** (0–39), **Low** (40–59), **Medium** (60–79), **High** (80–100)
- Per-source threshold overrides for fine-tuned sensitivity

### 🧠 Context Memory

- Sliding-window persistent context per source stored in PostgreSQL
- Configurable window size (default: 10 for video, 20 for images)
- Previous analysis summaries are injected into AI prompts, enabling the model to detect escalating patterns across consecutive frames/uploads

### ⚡ Escalation Engine

Three rule types for automatic escalation:

| Rule Type | Description |
|---|---|
| **Consecutive** | Triggers when N consecutive analyses exceed a threshold score |
| **Average** | Triggers when the rolling average of recent scores exceeds a threshold |
| **Category Repeat** | Triggers when a specific threat category appears N times in M analyses |

Rules can be **global** or **per-source**, and are togglable from the Settings page.

### 📈 Analytics Dashboard

- **Overview dashboard** with live stats: active sources, high-risk alerts, 5-min event count, avg latency
- **Threat trend chart** — time-series line chart (avg + max) with selectable time ranges (6h–7d)
- **Category breakdown** — bar chart showing frequency of each threat category
- **Per-source analytics** — table with source-level stats (event count, avg/max score, last event)
- **Latency stats** — processing time metrics including p95 percentile
- All charts powered by [Recharts](https://recharts.org/)

### 🔔 Alert System

- **Webhooks** — HMAC-SHA256 signed HTTP POST payloads to user-configured URLs
- **Browser Push Notifications** — Web Push (VAPID) integration
- **Socket.IO** — Real-time in-app alerts for connected clients
- Full delivery logging with status tracking (pending/sent/failed)
- Webhook test endpoint for verification

### 🔐 Authentication & RBAC

- JWT-based authentication with access + refresh token pairs
- Three roles with different permissions:

| Role | Capabilities |
|---|---|
| **Admin** | Full access — manage users, change AI provider, all config |
| **Operator** | Create/manage sources, upload media, manage webhooks |
| **Viewer** | Read-only dashboard and analytics access |

- Secure password hashing (bcrypt, 12 rounds)
- Session management with revocation support

### 📝 Audit Trail

- All configuration changes are logged with old/new values, user ID, and timestamp
- Accessible via the config audit log API

### 🔌 External Ingestion API

- Bearer-token authenticated endpoint (`POST /api/ingest`) for programmatic integration
- Each source generates a unique ingestion token on creation
- Compatible with cURL, scripts, IoT devices, and third-party systems

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js + Express** | HTTP server & REST API |
| **Socket.IO** | Real-time WebSocket communication |
| **TypeScript** | Type safety across the entire backend |
| **Drizzle ORM** | Type-safe PostgreSQL query builder |
| **PostgreSQL 16** | Primary database |
| **OpenAI SDK** | GPT-4.1-mini vision analysis |
| **ffmpeg** (fluent-ffmpeg) | Video splitting, GIF conversion, HLS frame extraction |
| **jsonwebtoken** | JWT authentication |
| **bcryptjs** | Password hashing |
| **web-push** | Browser push notifications (VAPID) |
| **Zod** | Environment variable validation |
| **multer** | File upload handling |

### Frontend

| Technology | Purpose |
|---|---|
| **React 19** | UI framework |
| **Vite 6** | Build tool & dev server |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Styling |
| **Recharts** | Charts & data visualization |
| **Socket.IO Client** | Real-time updates |
| **Lucide React** | Icon library |

### Infrastructure

| Technology | Purpose |
|---|---|
| **Docker Compose** | PostgreSQL container management |
| **ffmpeg** | Video/stream processing (must be installed on host) |

---

## Prerequisites

Before setting up AI Threat Detection, ensure you have the following installed:

- **Node.js** ≥ 18.x ([download](https://nodejs.org/))
- **npm** ≥ 9.x (comes with Node.js)
- **Docker** & **Docker Compose** ([download](https://www.docker.com/products/docker-desktop/))
- **ffmpeg** — required for video processing

### Installing ffmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
```bash
# Using Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

Verify installation:
```bash
ffmpeg -version
```

---

## Project Structure

```
voiddecksafety/
├── docker-compose.yml          # PostgreSQL container definition
├── main.py                     # Standalone OpenAI vision test script
├── .env                        # Environment variables (create this)
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts            # Express app entry point
│       ├── config/
│       │   └── env.ts          # Zod-validated environment config
│       ├── db/
│       │   ├── index.ts        # Drizzle ORM + pg pool setup
│       │   ├── schema.ts       # All 14 table definitions
│       │   └── seed.ts         # DB seeding (tables + defaults)
│       ├── middleware/
│       │   ├── auth.ts         # JWT auth + RBAC middleware
│       │   ├── errorHandler.ts # Global error handler
│       │   └── upload.ts       # Multer file upload config
│       ├── routes/
│       │   ├── alerts.ts       # Webhook & push subscription CRUD
│       │   ├── auth.ts         # Login, register, refresh, logout
│       │   ├── dashboard.ts    # Dashboard stats, config, analytics
│       │   ├── ingest.ts       # External API ingestion endpoint
│       │   ├── jobs.ts         # Job listing & detail
│       │   └── sources.ts      # Source CRUD + file upload
│       ├── services/
│       │   ├── aiAnalyzer.ts   # OpenAI vision analysis
│       │   ├── aiProviders.ts  # Multi-provider AI abstraction
│       │   ├── alertService.ts # Webhook + push dispatch
│       │   ├── auth.ts         # JWT + session management
│       │   ├── contextMemory.ts# Sliding-window context per source
│       │   ├── escalation.ts   # Escalation rule engine
│       │   ├── jobQueue.ts     # Concurrent job processing queue
│       │   ├── streamProcessor.ts # Live stream management
│       │   ├── threatScorer.ts # Weighted threat scoring
│       │   └── videoProcessor.ts  # ffmpeg video processing
│       ├── socket/
│       │   └── index.ts        # Socket.IO server + event handlers
│       └── types/
│           └── index.ts        # Shared TypeScript types
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx             # Root component with navigation
│       ├── main.tsx            # React entry point
│       ├── index.css           # Tailwind imports
│       ├── components/
│       │   ├── PipelineCard.tsx      # Per-source monitoring card
│       │   ├── PipelineEditModal.tsx # Source config modal
│       │   ├── SourceCard.tsx        # Alternative source display
│       │   ├── StatusBadge.tsx       # Status/severity badge
│       │   ├── StreamCapture.tsx     # Live stream capture UI
│       │   ├── ThreatGauge.tsx       # SVG circular threat gauge
│       │   └── UploadPanel.tsx       # New source creation form
│       ├── hooks/
│       │   ├── useAuth.tsx     # Auth context provider + hook
│       │   └── useSocket.ts    # Socket.IO connection hook
│       ├── pages/
│       │   ├── AlertsPage.tsx  # Webhook & alert management
│       │   ├── AnalyticsPage.tsx # Deep analytics & charts
│       │   ├── DashboardPage.tsx # Overview dashboard
│       │   ├── LoginPage.tsx   # Login/register page
│       │   └── SettingsPage.tsx# Global settings page
│       ├── services/
│       │   └── api.ts          # HTTP client with auto token refresh
│       └── types/
│           └── index.ts        # Frontend TypeScript types
│
└── data/                       # Generated data directory
    ├── chunks/                 # Video chunks (temp)
    ├── frames/                 # Stream frames
    ├── gifs/                   # Generated GIFs for AI analysis
    ├── hls/                    # HLS stream data
    └── uploads/                # Uploaded media files
```

---

## Setup & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/t-sibiraj/dlweek-brainfresh-threatdetection.git
cd dlweek-brainfresh-threatdetection
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

This starts a PostgreSQL 16 container with:
- **User:** `voiddecksafety`
- **Password:** `voiddecksafety`
- **Database:** `voiddecksafety`
- **Port:** `5432`
- Persistent volume for data durability

Verify it's running:
```bash
docker-compose ps
```

### 3. Configure Environment Variables

Create a `.env` file in the **project root**:

```bash
cp .env.example .env   # or create manually
```

```env
# ─── Required ───────────────────────────────────────────
OPENAI_API_KEY=sk-your-openai-api-key-here

# ─── Database (default works with docker-compose) ──────
DATABASE_URL=postgresql://voiddecksafety:voiddecksafety@localhost:5432/voiddecksafety

# ─── Server ─────────────────────────────────────────────
PORT=4000
NODE_ENV=development

# ─── Video Processing ──────────────────────────────────
VIDEO_CHUNK_SECONDS=5
MAX_CONCURRENT_JOBS=2

# ─── AI Context ────────────────────────────────────────
MAX_VIDEO_CONTEXT=10
MAX_IMAGE_CONTEXT=20
MODEL_NAME=gpt-4.1-mini

# ─── Threat Thresholds ─────────────────────────────────
THREAT_THRESHOLD_HIGH=70
THREAT_THRESHOLD_MEDIUM=40

# ─── Authentication ────────────────────────────────────
JWT_SECRET=your-secret-key-change-in-production
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ─── Multi-Provider AI (Optional) ─────────────────────
AI_PROVIDER=openai
ANTHROPIC_API_KEY=
GOOGLE_AI_KEY=

# ─── Web Push (Optional) ──────────────────────────────
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:admin@voiddecksafety.local
```

> **Note:** Only `OPENAI_API_KEY` is strictly required. All other values have sensible defaults.

### 4. Install Backend Dependencies

```bash
cd backend
npm install
```

### 5. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## Running the Application

### Start Everything (3 terminals)

**Terminal 1 — Database:**
```bash
docker-compose up -d
```

**Terminal 2 — Backend:**
```bash
cd backend
npm run dev
```

The backend will:
- Connect to PostgreSQL
- Create all tables automatically (idempotent)
- Seed default data (weights, escalation rules, admin user)
- Start the Express server on `http://localhost:4000`
- Initialize Socket.IO for real-time connections

**Terminal 3 — Frontend:**
```bash
cd frontend
npm run dev
```

The frontend dev server starts on `http://localhost:5173`.

### Access the Application

Open **http://localhost:5173** in your browser.

---

## Default Credentials

The database seeder creates a default admin account:

| Field | Value |
|---|---|
| **Email** | `admin@voiddecksafety.local` |
| **Password** | `admin123` |
| **Role** | `admin` |

> ⚠️ **Change these credentials in production!**

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key for GPT-4.1-mini vision |
| `DATABASE_URL` | ❌ | `postgresql://voiddecksafety:voiddecksafety@localhost:5432/voiddecksafety` | PostgreSQL connection string |
| `PORT` | ❌ | `4000` | Backend server port |
| `NODE_ENV` | ❌ | `development` | Environment mode |
| `VIDEO_CHUNK_SECONDS` | ❌ | `5` | Duration of each video chunk (seconds) |
| `MAX_CONCURRENT_JOBS` | ❌ | `2` | Max parallel AI analysis jobs |
| `MAX_VIDEO_CONTEXT` | ❌ | `10` | Context memory window for video sources |
| `MAX_IMAGE_CONTEXT` | ❌ | `20` | Context memory window for image sources |
| `MODEL_NAME` | ❌ | `gpt-4.1-mini` | OpenAI model name |
| `THREAT_THRESHOLD_HIGH` | ❌ | `70` | Score threshold for "high" severity |
| `THREAT_THRESHOLD_MEDIUM` | ❌ | `40` | Score threshold for "medium" severity |
| `JWT_SECRET` | ❌ | dev default | Secret for signing JWT tokens |
| `JWT_ACCESS_EXPIRES` | ❌ | `15m` | Access token expiration |
| `JWT_REFRESH_EXPIRES` | ❌ | `7d` | Refresh token expiration |
| `AI_PROVIDER` | ❌ | `openai` | Active AI provider (`openai`, `anthropic`, `google`) |
| `ANTHROPIC_API_KEY` | ❌ | — | Anthropic API key (enables Claude) |
| `GOOGLE_AI_KEY` | ❌ | — | Google AI key (enables Gemini) |
| `VAPID_PUBLIC_KEY` | ❌ | — | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | ❌ | — | VAPID private key for Web Push |
| `VAPID_EMAIL` | ❌ | `mailto:admin@voiddecksafety.local` | VAPID contact email |

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Register a new user |
| `POST` | `/api/auth/login` | — | Login and receive token pair |
| `POST` | `/api/auth/refresh` | — | Refresh access token |
| `POST` | `/api/auth/logout` | 🔒 | Revoke refresh token |

### Sources

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sources` | 🔒 | List all sources |
| `POST` | `/api/sources` | 🔒 | Create a new source |
| `GET` | `/api/sources/:id` | 🔒 | Get source details + status |
| `PATCH` | `/api/sources/:id` | 🔒 | Update source settings |
| `DELETE` | `/api/sources/:id` | 🔒 | Delete a source |
| `POST` | `/api/sources/:id/upload` | 🔒 | Upload media file for analysis |

### Jobs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/jobs` | 🔒 | List jobs (filterable by `?source=id`) |
| `GET` | `/api/jobs/:id` | 🔒 | Get job detail with threat event |

### Dashboard & Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dashboard` | 🔒 | Dashboard summary stats |
| `GET` | `/api/threats` | 🔒 | Recent threat events |
| `GET` | `/api/analytics/trend` | 🔒 | Threat score trend over time |
| `GET` | `/api/analytics/sources` | 🔒 | Per-source analytics breakdown |
| `GET` | `/api/analytics/categories` | 🔒 | Category frequency breakdown |
| `GET` | `/api/analytics/latency` | 🔒 | Processing latency stats (avg/min/max/p95) |

### Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/config/weights` | 🔒 | Get threat weights |
| `PUT` | `/api/config/weights` | 🔒 Admin | Update threat weights |
| `GET` | `/api/config/thresholds` | 🔒 | Get severity thresholds |
| `PUT` | `/api/config/thresholds` | 🔒 Admin | Update thresholds |
| `GET` | `/api/config/system` | 🔒 | Get system configuration |
| `PUT` | `/api/config/system` | 🔒 Admin | Update system config |
| `GET` | `/api/config/escalation` | 🔒 | Get escalation rules |
| `PUT` | `/api/config/escalation` | 🔒 Admin | Update escalation rules |
| `GET` | `/api/config/ai-provider` | 🔒 | Get AI provider status |
| `PUT` | `/api/config/ai-provider` | 🔒 Admin | Switch AI provider |

### Alerts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/alerts/webhooks` | 🔒 | List user's webhooks |
| `POST` | `/api/alerts/webhooks` | 🔒 Operator+ | Create webhook endpoint |
| `PATCH` | `/api/alerts/webhooks/:id` | 🔒 | Update webhook |
| `DELETE` | `/api/alerts/webhooks/:id` | 🔒 | Delete webhook |
| `POST` | `/api/alerts/webhooks/:id/test` | 🔒 Operator+ | Send test webhook |
| `GET` | `/api/alerts/push/vapid-key` | — | Get VAPID public key |
| `POST` | `/api/alerts/push/subscribe` | 🔒 | Subscribe to push notifications |
| `DELETE` | `/api/alerts/push/subscribe/:id` | 🔒 | Unsubscribe from push |
| `GET` | `/api/alerts/log` | 🔒 | Alert delivery log |

### External Ingestion

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/ingest` | Bearer Token | Upload media via external API |

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |

---

## Real-Time Events (WebSocket)

AI Threat Detection uses Socket.IO for real-time bidirectional communication.

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `join_source` | `{ source_id }` | Subscribe to source-specific updates |
| `leave_source` | `{ source_id }` | Unsubscribe from a source |
| `stream:start` | `{ source_id, type }` | Start live stream (webcam/screen/hls) |
| `stream:frame` | `{ source_id, frame }` | Send a video frame (base64) |
| `stream:stop` | `{ source_id }` | Stop live stream |

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `job_queued` | `JobEvent` | New analysis job queued |
| `job_processing` | `JobEvent` | Job started processing |
| `job_completed` | `JobEvent` | Job completed with results |
| `job_error` | `JobEvent` | Job failed |
| `threat_alert` | `ThreatAlertEvent` | Escalation triggered |
| `stream_started` | `{ source_id }` | Stream started confirmation |
| `stream_stopped` | `{ source_id }` | Stream stopped confirmation |
| `stream:frame_ack` | `{ frameCount }` | Frame received acknowledgment |

---

## External Ingestion API

For programmatic integration (IoT devices, scripts, third-party systems):

```bash
# Upload an image for analysis
curl -X POST http://localhost:4000/api/ingest \
  -H "Authorization: Bearer YOUR_INGESTION_TOKEN" \
  -F "source_id=YOUR_SOURCE_ID" \
  -F "file=@/path/to/image.jpg"

# Upload a video for analysis
curl -X POST http://localhost:4000/api/ingest \
  -H "Authorization: Bearer YOUR_INGESTION_TOKEN" \
  -F "source_id=YOUR_SOURCE_ID" \
  -F "file=@/path/to/video.mp4"
```

The ingestion token is generated when a source is created and is displayed in the source's Pipeline Card.

---

## AI Providers

AI Threat Detection supports three AI vision providers:

| Provider | Model | Config Key |
|---|---|---|
| **OpenAI** (default) | GPT-4.1-mini | `OPENAI_API_KEY` |
| **Anthropic** | Claude | `ANTHROPIC_API_KEY` |
| **Google** | Gemini | `GOOGLE_AI_KEY` |

- The active provider can be switched at runtime from the Analytics page (admin only)
- If the active provider fails after 3 retries, the system automatically falls back to OpenAI
- Provider availability is auto-detected based on configured API keys

---

## Threat Scoring & Escalation

### Scoring

Each AI analysis returns a set of triggered threat categories. The final threat score is calculated as:

```
Score = min(100, Σ weight[category] for each triggered category)
```

Default weights are seeded for both physical and online modes and are fully configurable from the Settings page.

### Severity Levels

| Level | Default Score Range | Color |
|---|---|---|
| **Safe** | 0 – 39 | Gray |
| **Low** | 40 – 59 | Light |
| **Medium** | 60 – 79 | Medium |
| **High** | 80 – 100 | White/Bright |

Thresholds are configurable globally and per-source.

### Escalation Rules

| Rule | Parameters | Trigger |
|---|---|---|
| **Consecutive** | `count`, `threshold` | N consecutive scores above threshold |
| **Average** | `window`, `threshold` | Rolling average over N analyses exceeds threshold |
| **Category Repeat** | `category`, `count`, `window` | Same category appears N times in M analyses |

When escalation triggers, a `threat_alert` event is emitted via Socket.IO and dispatched to all configured webhook and push notification endpoints.

---

## Alert System

### Webhooks

- Create webhook endpoints from the Alerts page
- Payloads are signed with **HMAC-SHA256** using a per-webhook secret
- Signature is sent in the `X-VoidDeck-Signature` header as `sha256=<hex>`
- Event type is sent in the `X-VoidDeck-Event` header
- Test webhooks with the built-in test button

### Browser Push Notifications

- Requires VAPID key pair (generate with `npx web-push generate-vapid-keys`)
- Subscribe from the Alerts page
- Notifications are sent for threat alerts and escalation events

---

## Scripts

### Backend

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Build for production (tsup)
npm run start        # Run production build
npm run typecheck    # Run TypeScript type checking
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run Drizzle migrations
npm run db:push      # Push schema to database
```

### Frontend

```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

---

## License

This project was built for the DL Week hackathon by **Team BrainFresh**.
