# Design Patterns

A catalog of the patterns actually used in this codebase, why each was chosen, and where to find
it. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how they fit together.

## Ports & Adapters (Hexagonal Architecture)

Every bounded context (`booking/`, `whatsapp/`, `scheduler/`, `templates/`) splits into
`domain/` (pure use cases + port interfaces, zero infrastructure imports) and `adapters/`
(infrastructure-specific implementations of those interfaces). This is the umbrella pattern —
most of what follows is a specific technique used to make it work in practice.

- Ports: `apps/api/src/booking/domain/ports.ts`, `whatsapp/domain/ports.ts`,
  `scheduler/domain/ports.ts`, `templates/domain/ports.ts`
- Adapters: `apps/api/src/booking/adapters/prismaBookingRepository.ts`,
  `whatsapp/adapters/metaCloudApiClient.ts`, etc.

## Repository pattern

Persistence is abstracted behind an interface per bounded context
(`BookingRepository`, `ReminderRepository`, `TemplateRepository`, `CatalogPort`) rather than the
domain calling Prisma directly. Note this is deliberately **not** applied to the simple CRUD
routes (organizations/services/resources) — those have no business rules to protect, so the
Express route handlers call Prisma directly. Adding a repository interface there would be
ceremony with no payoff.

- `apps/api/src/booking/domain/ports.ts` (`BookingRepository`)
- `apps/api/src/booking/adapters/prismaBookingRepository.ts` (Prisma implementation)

## Composition Root

One file constructs every adapter and wires it to its port — nothing else in the codebase
constructs a repository, a `PrismaClient`, or a Meta API client. This is what makes swapping an
adapter (e.g. Meta Cloud API → Twilio) a one-file change.

- `apps/api/src/composition/container.ts`

## Factory functions instead of DI classes/containers

Each use-case module exports a `create*Service(deps)` factory that closes over its injected
ports and returns an object of methods — not a class, not a DI framework/decorator. This keeps
dependency injection explicit and framework-free: constructing `createBookingService(fakeRepo)`
in a test is the entire "mocking" story.

- `createBookingService` — `apps/api/src/booking/domain/bookingService.ts`
- `createConversationEngine` — `apps/api/src/whatsapp/domain/conversationEngine.ts`
- `createReminderService` — `apps/api/src/scheduler/domain/reminderService.ts`
- `createTemplateService` — `apps/api/src/templates/domain/templateService.ts`

## Adapter pattern (proper)

`MetaCloudApiClient` adapts Meta's Graph API HTTP shape (JSON bodies, bearer tokens, `/messages`
endpoint) to our own `MessagingPort` interface (`sendText`, `sendList`, `sendButtons`,
`sendTemplate`). `PrismaBookingRepository` similarly adapts Prisma's query builder API to
`BookingRepository`. Neither leaks its underlying library's types across the port boundary.

- `apps/api/src/whatsapp/adapters/metaCloudApiClient.ts`

## State machine (WhatsApp conversation flow)

`ConversationSession` is a discriminated union keyed by `step`
(`AWAITING_ORG` → `AWAITING_SERVICE` → `AWAITING_RESOURCE` → `AWAITING_SLOT` →
`AWAITING_CONFIRMATION`, plus the manage/reschedule branch). `handleInboundMessage` dispatches on
`session.step` with a `switch`, and each handler computes the next state. The state itself is
externalized to Redis (via `ConversationSessionStore`) with a TTL rather than kept in memory,
since a chat can span many separate HTTP webhook calls with no persistent connection.

- `apps/api/src/whatsapp/domain/ports.ts` (`ConversationSession` union)
- `apps/api/src/whatsapp/domain/conversationEngine.ts` (transitions)
- See [`FLOWS.md`](FLOWS.md) for the full state diagram.

## Shared pure predicate (single source of truth for "does this overlap?")

`rangesOverlap` is one pure function used both by the availability engine (deciding which slots
to *offer*) and by the booking repository's conflict check (deciding whether a slot is *still*
free at creation time). Two separate implementations of "do these time ranges overlap" would
risk silently disagreeing at the edges (exactly the kind of bug that causes phantom
double-bookings) — reusing one function makes that structurally impossible.

- `apps/api/src/booking/domain/timeOverlap.ts`

## Dynamic strategy resolution (template variables)

`resolveTemplateParams(variables, context)` takes an org-defined, arbitrarily-ordered list of
variable names and a context map of known values, and resolves them positionally — the same
function serves the reminder scheduler, booking confirmations, and cancellations, each building
its own `context` object. This replaced an earlier hardcoded 4-parameter array that silently
broke for any template with a different variable count.

- `apps/api/src/templates/domain/variables.ts`
- Callers: `apps/api/src/scheduler/domain/reminderService.ts`,
  `apps/api/src/whatsapp/domain/conversationEngine.ts` (`sendCategorizedMessage`)

## Fallback pattern (template-or-plain-text)

Every automatic sender tries an approved WhatsApp template first and falls back to plain text if
the organization hasn't had one approved yet — so the system is usable immediately after signup,
without blocking on Meta's template review process.

- `apps/api/src/scheduler/domain/reminderService.ts`
- `apps/api/src/whatsapp/domain/conversationEngine.ts` (`sendCategorizedMessage`)

## Optimistic concurrency + retry (no double-booking)

Booking creation/reschedule runs inside a `SERIALIZABLE` Postgres transaction; on a serialization
failure (Postgres error code `P2034`, meaning another concurrent transaction touched the same
data) it retries up to 3 times before giving up. This avoids pessimistic row locks while still
guaranteeing no two customers can book the same slot.

- `runWithSerializableRetry` in `apps/api/src/booking/adapters/prismaBookingRepository.ts`

## Fail-soft batch processing (reminder sweep)

`reminderService.sendDueReminders` wraps each candidate's send in its own `try/catch`: one
customer's delivery failure is logged and skipped rather than aborting the whole sweep, and a
failed send is **not** marked as sent — so it's naturally retried on the next sweep (idempotent
retry, not a queue of its own).

- `apps/api/src/scheduler/domain/reminderService.ts`

## Typed domain error hierarchy + centralized translation

Domain code throws plain typed errors (`NotFoundError`, `ValidationError`, `BookingConflictError`)
with no knowledge of HTTP. One Express middleware maps each type (plus Zod's `ZodError`) to the
right status code — the domain layer never imports Express.

- Errors: `apps/api/src/booking/domain/errors.ts`
- Translation: `apps/api/src/middleware/errorHandler.ts`

## Schema-derived validation at the boundary (Zod)

Request bodies are parsed with Zod schemas shared between backend and frontend
(`packages/shared`), so the wire format is validated once and its TypeScript type is inferred
rather than hand-maintained. `.omit()`/`.partial()` on a plain object schema (rather than a
`.refine()`-wrapped one) keeps it composable for create vs. update vs. cross-field validation.

- `packages/shared/src/schemas.ts`

## Uncontrolled component + remount-to-reset (frontend)

`RichTextEditor` intentionally does not feed React state back into the `contentEditable` div's
rendered content — it only reads the DOM on `input`/`blur`. Re-rendering `innerHTML` from state
on every keystroke is the classic cause of cursor-jumping bugs in contentEditable + React. To
clear the editor after a successful submit, the parent changes a `key` prop to force a full
remount instead of trying to imperatively reset a controlled value.

- `apps/admin-web/src/components/RichTextEditor.tsx`
- Reset via `key` — `apps/admin-web/src/pages/TemplatesPage.tsx`

## Recursive-descent tree conversion (visitor-style)

`htmlToWhatsAppMarkup` recursively walks the DOM produced by the rich-text editor and maps each
tag to WhatsApp's markup (`<b>` → `*..*`, `<li>` → `- ..`, etc.), rather than using regex against
the HTML string — correct nesting (e.g. `<b><i>x</i></b>` → `*_x_*`) falls out naturally from the
recursion instead of needing special-cased patterns.

- `apps/admin-web/src/components/htmlToWhatsAppMarkup.ts`
