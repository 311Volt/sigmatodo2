# sigmatodo2

A vibecoded todo list app.

## Monorepo structure

```
sigmatodo2/
├── sigmatodo2-common/   # Shared TypeScript types and constants
├── sigmatodo2-srv/      # Fastify API server
└── sigmatodo2-web/      # React SPA
```

## Features

- **Projects** — short code (e.g. `SIG`), name, description, background image, fully customizable statuses with colors and importance levels
- **Issues** — auto-numbered codes (`SIG-1`), priority (low / normal / high / highest), status, due dates, markdown descriptions, file attachments
- **Smart sort** — "Relevant" ordering factors in status importance, time-to-due-date, and priority
- **Comments** — markdown-rendered, editable/deletable by their author
- **Team management** — invite by email, assign editor or viewer roles, remove members
- **User profiles** — avatar upload, display name, bio
- **Auth** — password-based registration/login in dev; Google OAuth in production
- **Dark mode** toggle

## Prerequisites

- [Bun](https://bun.com) v1.2+

## Install

```bash
bun install
```

## Development

Start the API server and frontend in separate terminals:

```bash
bun run dev:srv   # http://localhost:3000
bun run dev:web   # http://localhost:3001 (or the port configured in sigmatodo2-web)
```

`dev:srv` sets `APP_MODE=dev`, which uses a local SQLite database and stores uploads on disk. No external services required.

## Environment variables

### Server (`sigmatodo2-srv`)

| Variable | Dev default | Required in prod |
|---|---|---|
| `APP_MODE` | `dev` (set by npm script) | set to `prod` |
| `DB_PATH` | `./dev.db` | — (Supabase used instead) |
| `JWT_SECRET` | any string | yes |
| `SUPABASE_URL` | — | yes |
| `SUPABASE_SERVICE_KEY` | — | yes |
| `GOOGLE_CLIENT_ID` | — | yes |
| `GOOGLE_CLIENT_SECRET` | — | yes |
| `GOOGLE_CALLBACK_URL` | — | yes |
| `FRONTEND_URL` | — | yes |

## Production

In production mode (`APP_MODE=prod`) the server switches to:

- **Database** — Supabase (Postgres via the JS client, service-role key bypasses RLS)
- **File storage** — Supabase Storage (avatars, issue attachments, project backgrounds)
- **Auth** — Google OAuth; new users are auto-provisioned and any pending invitations are accepted on first sign-in

```bash
# from sigmatodo2-srv/
bun run start
```

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| API | Fastify 5, `@fastify/jwt`, `@fastify/multipart`, Zod |
| DB (dev) | Bun SQLite (WAL mode, foreign keys) |
| DB (prod) | Supabase (Postgres) |
| Frontend | React 19, React Router 7, TanStack Query 5 |
| Styling | Tailwind CSS v4, shadcn/ui (Radix UI primitives) |
| Markdown | react-markdown + remark-gfm + rehype-raw |
| Icons | Lucide React |
| Shared types | `sigmatodo2-common` workspace package |
