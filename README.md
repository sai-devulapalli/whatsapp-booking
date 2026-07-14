# WhatsApp Booking Platform

Book appointments, browse staff/resource availability, and manage bookings entirely through
WhatsApp — for any kind of organization (clinics, salons, gyms, consultants, repair shops, etc.),
not just hospitals. Organizations manage their services, staff/resources, availability, and
WhatsApp message templates through a web admin dashboard.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the hexagonal architecture, module map, and
composition root; [`docs/DESIGN_PATTERNS.md`](docs/DESIGN_PATTERNS.md) for the patterns catalog;
and [`docs/FLOWS.md`](docs/FLOWS.md) for sequence/state diagrams of the main flows.

## Features

- **WhatsApp booking chat flow** — browse organization → service → staff/resource → open time
  slot → confirm, entirely via WhatsApp list/button messages
- **Manage bookings over WhatsApp** — "my appointments" lists upcoming bookings with
  reschedule/cancel actions
- **Conflict-safe scheduling** — serializable-transaction booking with automatic retry; no
  double-booking, even under concurrent requests
- **Availability engine** — recurring weekly hours, per-date exceptions/holidays, service
  duration + buffer, timezone-aware (DST-safe)
- **Reminder scheduler** — BullMQ job sends 24h/1h-before reminders, using an approved WhatsApp
  template if one exists, else falling back to plain text
- **Dynamic WhatsApp message templates** — admins define their own named variables (in any
  order) for confirmation/reminder/cancellation/custom templates, edited with a rich-text
  editor (bold/italic/strikethrough/lists) that's automatically converted to WhatsApp's own
  markup; submit to Meta for approval and track status
- **Admin dashboard** (React) — organization settings, services, staff/resources + weekly
  availability, appointments, and template management

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript, Express |
| Database | PostgreSQL via Prisma |
| Background jobs / sessions | Redis + BullMQ |
| WhatsApp | Meta WhatsApp Cloud API (official, direct integration) |
| Admin frontend | React + Vite + TanStack Query |
| Tests | Vitest (28 backend unit tests, 14 frontend unit tests — all against in-memory fakes, no DB/network needed) |

## Project structure

```
WhatsApp/
  apps/
    api/            Backend: REST API, WhatsApp webhook, booking/reminder/template domains
    admin-web/       React admin dashboard
  packages/
    shared/          Zod schemas + enums shared by api and admin-web
  prisma/            schema.prisma + migrations
  docs/              Architecture, design patterns, and flow diagrams
  docker-compose.yml Postgres + Redis for local dev
```

## Getting started

### 1. Prerequisites

- Node.js 20+
- Docker (for local Postgres/Redis)

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

`docker-compose.yml` maps Postgres/Redis to **55432**/**56379** (not the standard 5432/6379) to
avoid clashing with any Postgres/Redis you already have running locally — `.env.example` already
points at those ports.

### 3. Start Postgres + Redis and run migrations

```bash
npm run docker:up
npm run prisma:migrate
```

### 4. Run the apps

```bash
npm run dev:api      # API + WhatsApp webhook + reminder worker — http://localhost:4000
npm run dev:admin    # Admin dashboard — http://localhost:5173
```

Open http://localhost:5173, sign up an organization, add a service, a staff/resource with weekly
availability, and you have enough to test the WhatsApp flow (see below).

### 5. Connect a real WhatsApp Business number (optional, for the live chat flow)

Everything above works and is testable via the admin dashboard without WhatsApp credentials. To
actually receive/send WhatsApp messages, create a Meta WhatsApp Cloud API app and fill in:

```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=       # any string you choose; used in Meta's webhook verification handshake
WHATSAPP_APP_SECRET=
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

Point Meta's webhook at `https://<your-tunnel>/webhook` (e.g. via `ngrok http 4000` in dev) using
the same `WHATSAPP_VERIFY_TOKEN`.

### 6. Run tests

```bash
npm test -w apps/api          # 28 unit tests — availability engine, booking, conversation
                               # engine, reminder service, template service — all via
                               # in-memory fakes for each port, no DB needed
npm test -w apps/admin-web     # 14 unit tests — HTML → WhatsApp markup conversion
```

## Known limitations / next steps

- One shared WhatsApp Business number for the whole platform — the customer picks which
  organization they mean from a menu. Giving every organization its own number requires Meta's
  Tech Provider / Embedded Signup program (a separate, larger integration).
- No payments, no public self-serve org signup/billing, no non-WhatsApp channels, no
  multi-language support.
- No manual "send this CUSTOM template as a one-off broadcast" UI yet — CUSTOM templates can be
  created and approved, but nothing currently triggers sending one outside the automatic
  confirmation/reminder/cancellation flows.
- `document.execCommand` (used by the admin dashboard's rich-text editor) is a deprecated
  browser API; still broadly supported for the basic commands used here, but a library like
  TipTap/Lexical would be the long-term replacement.
