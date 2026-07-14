# Flow Diagrams

## 1. Booking an appointment over WhatsApp

The customer's phone never talks to our server directly — every message goes through Meta's
webhook. The conversation engine only ever talks to ports (`CatalogPort`, `BookingService`,
`MessagingPort`, `ConversationSessionStore`); this diagram shows the adapter each port call
actually resolves to at runtime.

```mermaid
sequenceDiagram
    actor Customer
    participant Meta as Meta WhatsApp<br/>Cloud API
    participant Webhook as whatsapp/webhook.ts
    participant Engine as conversationEngine
    participant Session as Redis<br/>(ConversationSessionStore)
    participant Catalog as PrismaCatalogRepository
    participant Booking as bookingService
    participant DB as PostgreSQL

    Customer->>Meta: "menu"
    Meta->>Webhook: POST /webhook (signed payload)
    Webhook->>Webhook: verify X-Hub-Signature-256
    Webhook->>Engine: handleInboundMessage(phone, {text:"menu"})
    Engine->>Catalog: listOrganizations()
    Catalog->>DB: SELECT * FROM Organization
    Engine->>Meta: sendList(orgs)
    Meta->>Customer: "Which organization?"
    Engine->>Session: set(phone, {step: AWAITING_ORG})

    Customer->>Meta: taps an organization
    Meta->>Webhook: POST /webhook (list_reply)
    Webhook->>Engine: handleInboundMessage(phone, {replyId:"org:123"})
    Engine->>Session: get(phone)
    Engine->>Catalog: listServices(orgId)
    Engine->>Meta: sendList(services)
    Engine->>Session: set(phone, {step: AWAITING_SERVICE, ...})

    Note over Customer,Session: ...service → resource → slot selection<br/>follows the same pattern...

    Customer->>Meta: taps "Confirm"
    Meta->>Webhook: POST /webhook (button_reply "confirm:yes")
    Webhook->>Engine: handleInboundMessage(phone, {replyId:"confirm:yes"})
    Engine->>Booking: createAppointment({...})
    Booking->>DB: SERIALIZABLE transaction:<br/>check conflict, upsert customer, insert appointment
    DB-->>Booking: AppointmentWithRelations
    Engine->>Engine: look up approved CONFIRMATION template<br/>(TemplateLookupPort), resolve its variables
    Engine->>Meta: sendTemplate(...) or sendText(fallback)
    Meta->>Customer: "You're booked!"
    Engine->>Session: clear(phone)
```

## 2. Conversation state machine

`ConversationSession.step` drives which handler runs next. Two independent flows share state:
the "book something new" flow, and the "manage an existing appointment" flow — which can loop
back into slot selection when rescheduling.

```mermaid
stateDiagram-v2
    [*] --> AWAITING_ORG: "menu" / "hi"
    AWAITING_ORG --> AWAITING_SERVICE: org selected
    AWAITING_SERVICE --> AWAITING_RESOURCE: service selected
    AWAITING_RESOURCE --> AWAITING_SLOT: resource selected (or "any available")
    AWAITING_SLOT --> AWAITING_CONFIRMATION: time slot selected
    AWAITING_CONFIRMATION --> [*]: confirmed → booking created,<br/>template/fallback sent, session cleared
    AWAITING_CONFIRMATION --> [*]: declined → session cleared

    [*] --> AWAITING_MANAGE_SELECTION: "my appointments"
    AWAITING_MANAGE_SELECTION --> AWAITING_MANAGE_ACTION: appointment selected
    AWAITING_MANAGE_ACTION --> [*]: "Cancel" → appointment cancelled,<br/>CANCELLATION template/fallback sent
    AWAITING_MANAGE_ACTION --> AWAITING_SLOT: "Reschedule" → re-enters slot\nselection tagged with rescheduleAppointmentId
    AWAITING_CONFIRMATION --> [*]: reschedule confirmed → appointment\nmoved, CONFIRMATION template/fallback sent

    note right of AWAITING_SLOT
        Any unrecognized reply, or "menu" sent
        at any point, resets to [*] and shows
        the main organization list again.
    end note
```

## 3. Reminder scheduler sweep

Runs every 5 minutes regardless of API traffic. Each candidate's send/mark is independent — one
failure doesn't block the rest of the batch, and an unmarked reminder is naturally retried on the
next sweep instead of needing its own dead-letter queue.

```mermaid
sequenceDiagram
    participant BullMQ
    participant Worker as scheduler/worker.ts
    participant Reminder as reminderService
    participant Repo as PrismaReminderRepository
    participant Templates as TemplateLookupPort
    participant Messaging as MessagingPort (Meta)
    participant DB as PostgreSQL

    BullMQ->>Worker: repeatable job tick (every 5 min)
    Worker->>Reminder: sendDueReminders("24h")
    Reminder->>Repo: findAppointmentsNeedingReminder("24h", now)
    Repo->>DB: WHERE startsAt IN (now, now+24h] AND reminder24hSentAt IS NULL
    DB-->>Repo: candidates[]

    loop each candidate
        Reminder->>Templates: findApproved(orgId, "REMINDER")
        alt approved template exists
            Reminder->>Reminder: resolveTemplateParams(template.variables, context)
            Reminder->>Messaging: sendTemplate(phone, name, params)
        else no approved template yet
            Reminder->>Messaging: sendText(phone, fallback message)
        end
        alt send succeeded
            Reminder->>Repo: markReminderSent(appointmentId, "24h")
        else send threw
            Reminder->>Reminder: log error, leave unmarked<br/>(retried next sweep)
        end
    end

    Worker->>Reminder: sendDueReminders("1h")
    Note over Worker,Reminder: same sequence, 1h threshold
```

## 4. Template creation and Meta approval

Template CRUD is plain admin-facing data management; only the two Meta-integration steps
(submit, sync status) go through the `templateService` use case and its
`TemplateSubmissionPort`.

```mermaid
sequenceDiagram
    actor Admin
    participant Web as admin-web<br/>(RichTextEditor)
    participant API as routes/templates.ts
    participant TplSvc as templateService
    participant Submission as MetaTemplateSubmissionAdapter
    participant Meta as Meta Graph API
    participant DB as PostgreSQL

    Admin->>Web: formats body text, adds named variables
    Web->>Web: htmlToWhatsAppMarkup(editor HTML) → bodyText
    Admin->>Web: "Create draft"
    Web->>API: POST /api/templates {name, category, bodyText, variables}
    API->>API: countBodyPlaceholders(bodyText) === variables.length ?
    API->>DB: INSERT MessageTemplate (approvalStatus = DRAFT)

    Admin->>Web: "Submit for approval"
    Web->>API: POST /api/templates/:id/submit
    API->>TplSvc: submitForApproval(id)
    TplSvc->>Submission: submitTemplate({name, category, language, bodyText})
    Submission->>Meta: POST /{businessAccountId}/message_templates
    Meta-->>Submission: {id: metaTemplateId}
    TplSvc->>DB: UPDATE approvalStatus = PENDING, metaTemplateId = ...

    Admin->>Web: "Check status" (later)
    Web->>API: POST /api/templates/:id/sync-status
    API->>TplSvc: syncApprovalStatus(id)
    TplSvc->>Submission: getApprovalStatus(metaTemplateId)
    Submission->>Meta: GET /{metaTemplateId}?fields=status
    Meta-->>Submission: {status: "APPROVED" | "REJECTED" | "PENDING"}
    TplSvc->>DB: UPDATE approvalStatus
```
