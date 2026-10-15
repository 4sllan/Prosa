---
description: Spec-Driven Development (SDD) workflow for Prosa. Enforces analyze-first, stop-and-ask approval between every phase.
---

# Spec-Driven Development (SDD) Workflow — Prosa

## Trigger

Use this workflow whenever the user asks to develop a new feature and explicitly requests the SDD flow, or when the feature is non-trivial and requires analysis before implementation.

## Core principle

**Analyze first. Stop. Ask for approval. Specify. Stop. Ask for approval. Create tasks. Stop. Ask for approval. Execute one task. Validate. Stop. Ask for approval.**

Never advance automatically between SDD phases. Each transition requires explicit user authorization.

---

## Phase 1 — Product analysis (`/analyze-product`)

### When to run

This is the **mandatory first step** for any new feature request under SDD. No code, specs, or tasks may be created before this phase completes and is explicitly approved.

### Constraints during analysis

- Do **NOT** create code.
- Do **NOT** modify existing code.
- Do **NOT** create implementation files.
- Do **NOT** create tasks.
- Do **NOT** create a Spec.
- Do **NOT** run migrations (schema changes in `server/src/db.js`).
- Do **NOT** install or update dependencies.
- Do **NOT** change configurations.
- Do **NOT** implement any part of the feature.
- **Only analyze.**

### Analysis checklist

1. **Project structure**
   - Directory layout (`server/`, `web/`, `data/`, `release/`).
   - Current architecture (Vue 3 + Vite + Electron frontend, Node 24 + Express + `ws` backend, `node:sqlite` persistence in WAL mode, WebRTC mesh for voice/video).
   - Framework and versions.
   - Dependencies (`package.json`, `web/package.json`, `server/package.json`, `package-lock.json` files).
   - Relevant configuration files (`.env`, `.env.example`, `server/src/config.js`, `web/vite.config.js`, `web/electron-builder.yml`).
   - Available scripts (`npm run dev` — API on :4000, `npm run dev:web` — Vite on :5173 with API proxy, `npm run build`, `npm test` — `node --test server/test/*.test.js`, `npm start`; Electron packaging scripts under `web/`).
   - Environment variables: `DATA_DIR`, `ICE_SERVERS_JSON`, `SMTP_*`, `VITE_API_URL` (build), `PROSA_API_URL` (runtime), `PROSA_DEV_URL` (Electron dev).
   - Current state of the project (`docs/docs.md`, README, and actual code).

2. **Documentation**
   - Read `docs/docs.md` (if existing) or project specs in `docs/specs/`, plus `README.md`.
   - Use documentation as context but treat the current source code as the primary source of truth.
   - If documentation diverges from the code, report the divergence explicitly.

3. **Requested feature**
   - What already exists related to the feature (see the feature inventory in `README.md`: accounts, presence, communities/roles, messages, DMs, voice/video, search, admin).
   - What is partially implemented.
   - Existing components, views, stores, API client methods, Express routes, WS message types, DB tables/queries, and dependencies that can be reused.
   - Architectural impact on frontend (Vue/Electron) and backend (Express routes + `realtime.js` WS hub + `db.js` schema).
   - Possible conflicts, style inconsistencies, and technical risks.

4. **Architecture areas to inspect**
   - `web/src/views/` — `AuthView.vue` (login/register/reset), `HomeView.vue` (app shell).
   - `web/src/components/` — `ChatView.vue`, `VoiceBar.vue`, `FriendsPanel.vue`, `AdminPanel.vue`, `CommunitySettings.vue`, `UserSettings.vue`.
   - `web/src/stores.js` — Pinia state + client WebSocket handling.
   - `web/src/api.js` — REST client, auth headers, error handling.
   - `web/src/rtc.js` — WebRTC mesh engine (peer connections, mic/camera/screen).
   - `web/src/App.vue`, `web/src/main.js`, `web/src/style.css` — shell, bootstrap, global styles.
   - `web/src/assets/` — static assets.
   - `web/desktop/main.cjs`, `web/desktop/preload.cjs` — Electron main/preload (`contextIsolation: true`, `nodeIntegration: false`, `window.prosaDesktop` bridge).
   - `server/src/index.js` — Express + HTTP + WS wiring, security headers, rate limits.
   - `server/src/config.js` — env loading (`DATA_DIR`, `ICE_SERVERS_JSON`, `SMTP_*`).
   - `server/src/db.js` — `node:sqlite` schema + idempotent migrations (`migrations` table convention).
   - `server/src/auth.js` — sessions (httpOnly cookie + Bearer token), register/login/reset, bcrypt.
   - `server/src/permissions.js` — roles (owner/admin/moderator/member), server-verified permission checks.
   - `server/src/realtime.js` — WS hub (`/ws`), presence, typing, voice state, WebRTC `SIGNAL` relay.
   - `server/src/routes/` — `users.js`, `communities.js`, `messages.js`, `dms.js`, `misc.js`, `admin.js`.
   - `server/test/api.test.js` — Node test suite covering auth, permissions, messages, invites, DMs, WS, search.
   - `data/` — `prosa.db` (SQLite, WAL) + `uploads/` (multer uploads, authenticated, 25 MB limit).
   - `release/` — packaged desktop artifacts (`.dmg`, `.exe`, `.deb`).

   Also evaluate:
   - Data flow (views ↔ Pinia stores ↔ `api.js`/`rtc.js` ↔ Express routes ↔ `realtime.js` ↔ `db.js` ↔ SQLite).
   - API integration (Express endpoints, auth cookie/token, `multer` uploads, rate limits on auth and message sends).
   - Realtime behavior (WS event names/payloads in `realtime.js` and `stores.js`; presence, typing, `SIGNAL` signaling).
   - Voice/video constraints (WebRTC mesh, practical limit ~6–8 participants; SFU evaluation if a feature needs more).
   - Auth session lifecycle, revocable sessions, and permission checks enforced server-side.
   - Form handling and validation rules (client-side plus mandatory server-side validation).
   - UI styling and design consistency (`web/src/style.css` and scoped component styles; no UI framework).
   - Electron desktop constraints (main/renderer boundary, `window.prosaDesktop` IPC, `electron-builder` packaging).
   - Security constraints (bcrypt, session revocation, rate limiting, upload type/size validation, security headers, `.env` secrets).

### Analysis output format

At the end of the analysis, present a summary with the following sections:

1. **Contexto atual** — how the project currently works in relation to the feature.
2. **Implementação existente** — files, components, views, stores, routes, WS events, DB tables, and structures already in place.
3. **Reutilização** — what can be reused.
4. **Impacto arquitetural** — which parts of the system will likely be affected (frontend, Express routes, WS hub, SQLite schema, Electron).
5. **Riscos e pontos de atenção** — issues or technical decisions to consider (e.g. permission checks, rate limits, realtime consistency, upload validation, migration design).
6. **Recomendação** — high-level implementation recommendation. Do not design the solution yet.

### Mandatory stop

After the analysis, stop completely and respond with:

```text
Analysis completed.

No code, specification, or tasks were created.

Waiting for explicit authorization to create the specification.
```

Do **NOT** run `/create-spec`, `/create-tasks`, or `/execute-task` automatically.

### Authorization examples

Only proceed to Phase 2 after the user explicitly authorizes, e.g.:

- `pode criar a spec`
- `crie a spec`
- `pode continuar para a spec`
- `aprovado, pode criar a spec`

Comments, questions, or discussions about the analysis do **NOT** count as authorization.

---

## Phase 2 — Create specification (`/create-spec <feature-name>`)

### When to run

Only after the analysis from Phase 1 is complete and the user has given explicit authorization.

### What to do

1. Create the Spec in `docs/specs/<feature-name>.md`.
2. Include:
   - Feature overview and goals.
   - Business rules.
   - Functional requirements.
   - Non-functional requirements.
   - UI/UX requirements (Vue 3 components, `style.css` conventions, responsiveness, Electron desktop behavior).
   - API contracts and endpoints (Express routes, request/response schemas, `multer` uploads, error shapes).
   - Realtime contracts (WS event names, payload shapes, presence/typing/voice effects, reconnection behavior).
   - State management / Pinia model changes in `stores.js`.
   - Data persistence impact (`db.js` schema changes, migrations convention, `data/` files/uploads).
   - Permission/role impact (`permissions.js`, server-side checks per route).
   - Form validation rules (client and server).
   - Security & authorization considerations (`auth.js` sessions, rate limits, upload validation, secrets in `.env`).
   - Acceptance criteria.
   - Out of scope.

### Mandatory stop

After creating the Spec, stop and request review. Respond with:

```text
Spec created at docs/specs/<feature-name>.md.

Waiting for explicit approval to create tasks.
```

Do **NOT** create tasks automatically.

### Authorization examples

- `aprovado, pode criar as tasks`
- `pode criar as tasks`
- `crie as tasks`
- `pode continuar para as tasks`

---

## Phase 3 — Create tasks (`/create-tasks <feature-name>`)

### When to run

Only after the Spec is reviewed and explicitly approved by the user.

### What to do

1. Create the task list in `docs/specs/<feature-name>-tasks.md`.
2. Break the feature into small, executable, sequential tasks.
3. Each task must be independently implementable and verifiable.
4. Include validation criteria for each task (e.g., component rendering, store action, Express route, WS event, permission check, `npm test`, `npm run build`).

### Mandatory stop

After creating tasks, stop and request review. Respond with:

```text
Tasks created at docs/specs/<feature-name>-tasks.md.

Waiting for explicit approval to execute the first task.
```

Do **NOT** execute tasks automatically.

### Authorization examples

- `aprovado, pode executar a task 1`
- `pode executar a task 1`
- `execute a task 1`
- `pode continuar com a task 1`

---

## Phase 4 — Execute one task (`/execute-task N`)

### When to run

Only after the user explicitly authorizes a specific task number `N`.

### What to do

1. Execute **only** the requested task.
2. Implement the minimal change needed for that task.
3. Validate the task against its acceptance criteria (and run `npm test` or `npm run build` if necessary).
4. Do **NOT** start the next task automatically.

### Mandatory stop

After completing the task, stop and request validation/approval. Respond with:

```text
Task N completed and validated.

Waiting for explicit authorization to proceed to the next task.
```

### Authorization examples

- `aprovado, pode executar a task 2`
- `pode executar a próxima task`
- `pode continuar com a task 2`
- `execute a task 2`

---

## Documentation vs. process

- **`docs/docs.md`**: living product and project state document. Must contain product vision, features, business rules, architecture, behaviors, data models, relevant decisions, and current state. Do **NOT** add temporary SDD flow instructions (e.g., "aguardando autorização", "próximo passo", "análise da funcionalidade") to this file.
- **`.windsurf/`**: responsible for the SDD process (analysis, spec creation, task creation, execution, validation, approval).

---

## Disallowed actions outside authorized phases

Never perform the following without the corresponding explicit authorization:

- Create or modify code outside an authorized `/execute-task N` step.
- Install or update dependencies outside an authorized task.
- Change project configurations outside an authorized task.
- Treat discussion or questions as authorization to proceed.
