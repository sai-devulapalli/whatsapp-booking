# Architecture

The backend (`apps/api`) follows **hexagonal architecture (ports & adapters)** for its
domain-rich bounded contexts — booking, the WhatsApp conversation engine, the reminder
scheduler, and message templates. Simple CRUD (organizations, services, resources) is treated
as "adapter-only": there's no real business logic to protect there, so Express routes talk to
Prisma directly. Hexagonal architecture is about isolating business rules from infrastructure —
not wrapping every database table in a repository interface for its own sake.

## Why hexagonal here

- **The booking domain has real invariants to protect**: no double-booking, buffer/duration
  math, timezone-correct availability windows. These rules must not depend on which database or
  transaction mechanism enforces them.
- **The WhatsApp channel is meant to be swappable**: today it's Meta's Cloud API; a Twilio
  adapter implementing the same `MessagingPort` could replace it without touching the
  conversation engine.
- **Testability**: every use case (`bookingService`, `conversationEngine`, `reminderService`,
  `templateService`) is a plain function of its ports, so it's unit-tested with in-memory fakes —
  26 backend tests run in under a second with no database or network involved.

## Layer overview

```mermaid
flowchart TB
    subgraph Driving["Driving adapters (input)"]
        HTTP["Express routes\n(admin CRUD + auth)"]
        WH["WhatsApp webhook\n(Meta signature verify)"]
        WORKER["BullMQ worker\n(reminder sweep tick)"]
    end

    subgraph Core["Application core — no infra imports"]
        direction TB
        BOOKING["Booking domain\nbookingService.ts + availability.ts (pure)"]
        CONVO["Conversation engine\n(WhatsApp chat state machine)"]
        REMIND["Reminder service"]
        TPL["Template service"]
    end

    subgraph Ports["Ports (interfaces)"]
        direction TB
        P1["BookingRepository"]
        P2["MessagingPort"]
        P3["ConversationSessionStore"]
        P4["CatalogPort"]
        P5["ReminderRepository"]
        P6["TemplateLookupPort"]
        P7["TemplateRepository /\nTemplateSubmissionPort"]
    end

    subgraph Driven["Driven adapters (output)"]
        direction TB
        PRISMA["Prisma adapters"]
        META["MetaCloudApiClient"]
        REDIS["RedisConversationSessionStore"]
        METATPL["MetaTemplateSubmissionAdapter"]
    end

    CONTAINER["composition/container.ts\n(composition root — wires adapters to ports)"]

    HTTP --> BOOKING
    HTTP --> TPL
    WH --> CONVO
    WORKER --> REMIND

    BOOKING --> P1
    CONVO --> P2
    CONVO --> P3
    CONVO --> P4
    CONVO --> P6
    CONVO -.reuses.-> BOOKING
    REMIND --> P5
    REMIND --> P2
    REMIND --> P6
    TPL --> P7

    P1 --> PRISMA
    P2 --> META
    P3 --> REDIS
    P4 --> PRISMA
    P5 --> PRISMA
    P6 --> PRISMA
    P7 --> PRISMA
    P7 --> METATPL

    CONTAINER -.wires.-> P1
    CONTAINER -.wires.-> P2
    CONTAINER -.wires.-> P3
    CONTAINER -.wires.-> P4
    CONTAINER -.wires.-> P5
    CONTAINER -.wires.-> P6
    CONTAINER -.wires.-> P7

    PRISMA --> DB[("PostgreSQL")]
    REDIS --> CACHE[("Redis")]
    META --> METAAPI["Meta WhatsApp\nCloud API"]
    METATPL --> METAAPI
```

**Dependency rule**: arrows only point from driving adapters → core → ports ← driven adapters.
The core never imports Prisma, `ioredis`, `bullmq`, or `fetch`-based Meta clients directly —
only the interfaces in each module's `domain/ports.ts`.

## Bounded contexts

| Context | Path | Core use cases | Port(s) | Adapter(s) |
|---|---|---|---|---|
| Booking | `booking/` | create/reschedule/cancel appointment, list available slots | `BookingRepository` | `PrismaBookingRepository` (owns the serializable-transaction conflict check) |
| WhatsApp conversation | `whatsapp/` | handle inbound message, drive the chat state machine | `MessagingPort`, `ConversationSessionStore`, `CatalogPort` | `MetaCloudApiClient`, `RedisConversationSessionStore`, `PrismaCatalogRepository` |
| Reminder scheduler | `scheduler/` | sweep for due 24h/1h reminders and send them | `ReminderRepository` | `PrismaReminderRepository` |
| Templates | `templates/` | CRUD, submit for Meta approval, sync approval status | `TemplateRepository`, `TemplateSubmissionPort` | `PrismaTemplateRepository`, `MetaTemplateSubmissionAdapter` |

`TemplateLookupPort` (in `templates/domain/ports.ts`) is shared across contexts: the reminder
scheduler and the conversation engine's confirmation/cancellation messages both look up an
approved template through it, implemented once by `PrismaTemplateRepository`.

## Composition root

`apps/api/src/composition/container.ts` is the **only** place adapters are constructed and
wired to ports. Everything downstream (Express routes, the webhook, the BullMQ worker) imports
already-composed services (`bookingService`, `conversationEngine`, `reminderService`,
`templateService`) from there — never a repository class or `PrismaClient` directly.

```mermaid
flowchart LR
    ENV["lib/env.ts"] --> CONTAINER
    PRISMACLIENT["lib/prisma.ts"] --> CONTAINER
    REDISCLIENT["lib/redis.ts"] --> CONTAINER
    CONTAINER["composition/container.ts"] --> BS["bookingService"]
    CONTAINER --> CE["conversationEngine"]
    CONTAINER --> RS["reminderService"]
    CONTAINER --> TS["templateService"]
    BS --> ROUTES["routes/appointments.ts"]
    CE --> WEBHOOK["whatsapp/webhook.ts"]
    RS --> WORKER["scheduler/worker.ts"]
    TS --> TPLROUTES["routes/templates.ts"]
```

## Runtime processes

A single Node process (`apps/api`) runs the Express server, the WhatsApp webhook, and the BullMQ
reminder worker together — appropriate at this scale; splitting the worker into its own process
is a one-line change (`scheduler/worker.ts` already exports `createReminderQueue` /
`startReminderWorker` independently of `index.ts`) if reminder volume ever needs to scale apart
from the API.

```mermaid
flowchart LR
    subgraph API_PROCESS["apps/api (single Node process)"]
        EXPRESS["Express server\n:4000"]
        WEBHOOK2["/webhook route"]
        BULLWORKER["BullMQ worker\n(in-process)"]
    end
    ADMIN["apps/admin-web\n(Vite dev server / static build)\n:5173"] -- REST --> EXPRESS
    CUSTOMER["Customer's phone"] -- WhatsApp --> META2["Meta WhatsApp\nCloud API"]
    META2 -- webhook POST --> WEBHOOK2
    EXPRESS -- outbound send --> META2
    EXPRESS --> PG[("PostgreSQL\n:55432")]
    BULLWORKER --> PG
    EXPRESS --> RD[("Redis\n:56379")]
    BULLWORKER --> RD
```

See [`DESIGN_PATTERNS.md`](DESIGN_PATTERNS.md) for the specific patterns behind each piece, and
[`FLOWS.md`](FLOWS.md) for how a request actually moves through these layers.
