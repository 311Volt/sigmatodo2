# sigmatodo2 — Setup Guide

## Local Development

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.1

### Install dependencies
```bash
bun install
```

### Run (two terminals)
```bash
# Terminal 1 — API server (port 3001)
bun dev:srv

# Terminal 2 — Frontend (port 3000)
bun dev:web
```

The frontend proxies `/api/*` to the API server, so no CORS configuration is needed in dev.

Dev mode uses:
- SQLite database (`sigmatodo2.sqlite` in the `sigmatodo2-srv/` directory)
- Local filesystem for uploads (`sigmatodo2-srv/uploads/`)
- Password-based auth (register at the login screen)

---

## Production Deployment (Render + Supabase)

### 1. Set up Supabase (free tier)

1. Create a project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the schema:

```sql
-- Users (in addition to Supabase Auth users)
CREATE TABLE users (
  handle TEXT PRIMARY KEY,
  created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_name TEXT NOT NULL,
  avatar_path TEXT,
  bio TEXT,
  email TEXT UNIQUE
);

CREATE TABLE projects (
  code TEXT PRIMARY KEY,
  created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  background_img_path TEXT,
  description TEXT,
  status_definitions JSONB NOT NULL
);

CREATE TABLE project_users (
  user_handle TEXT NOT NULL REFERENCES users(handle) ON DELETE CASCADE,
  project_code TEXT NOT NULL REFERENCES projects(code) ON DELETE CASCADE,
  permissions JSONB NOT NULL,
  PRIMARY KEY (user_handle, project_code)
);

CREATE TABLE issue_sequences (
  project_code TEXT PRIMARY KEY REFERENCES projects(code) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1
);

-- Atomic sequence increment function
CREATE OR REPLACE FUNCTION next_issue_number(p_project_code TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_num INTEGER;
BEGIN
  UPDATE issue_sequences
  SET next_number = next_number + 1
  WHERE project_code = p_project_code
  RETURNING next_number - 1 INTO v_num;
  RETURN v_num;
END;
$$;

CREATE TABLE issues (
  code TEXT PRIMARY KEY,
  project_code TEXT NOT NULL REFERENCES projects(code) ON DELETE CASCADE,
  assigned_to TEXT REFERENCES users(handle) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(handle) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_by TIMESTAMPTZ,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  markdown_description TEXT,
  comment_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_code TEXT NOT NULL REFERENCES issues(code) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  uploaded_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_code TEXT NOT NULL REFERENCES issues(code) ON DELETE CASCADE,
  posted_by TEXT NOT NULL REFERENCES users(handle) ON DELETE CASCADE,
  posted_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_on TIMESTAMPTZ,
  content TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION increment_comment_count(p_issue_code TEXT)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE issues SET comment_count = comment_count + 1 WHERE code = p_issue_code;
$$;

CREATE OR REPLACE FUNCTION decrement_comment_count(p_issue_code TEXT)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE issues SET comment_count = GREATEST(0, comment_count - 1) WHERE code = p_issue_code;
$$;

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code TEXT NOT NULL REFERENCES projects(code) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(handle),
  created_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_on TIMESTAMPTZ,
  permissions JSONB NOT NULL
);
```

3. Create a Storage bucket named `uploads`:
   - Go to **Storage** in the left sidebar and click **New bucket**
   - Name it `uploads`, leave it **private** (access is controlled by the service role key on the server)
   - Click **Create bucket**
4. Copy your credentials from **Settings → API** (left sidebar) — you'll paste these into the Render env vars in step 3:
   - **Project URL** — looks like `https://xxxx.supabase.co` → goes into `SUPABASE_URL`
   - **service_role** key (under *Project API keys*) — use this one, **not** the anon key → goes into `SUPABASE_SERVICE_KEY`

### 2. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add Authorized redirect URI: `https://your-api.onrender.com/api/auth/google/callback`
4. Copy the Client ID and Client Secret — you'll paste these into the Render env vars in step 3 as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### 3. Deploy API to Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repository
3. Settings:
   - **Root directory**: `sigmatodo2-srv`
   - **Build command**: `bun install`
   - **Start command**: `bun start`
   - **Environment**: Node

4. Add environment variables:
```
APP_MODE=prod
PORT=10000
JWT_SECRET=<generate a strong random secret>
FRONTEND_URL=https://your-frontend.onrender.com
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_CALLBACK_URL=https://your-api.onrender.com/api/auth/google/callback
```

### 4. Deploy Frontend to Render

1. Create another **Web Service** (or Static Site)
2. Settings:
   - **Root directory**: `sigmatodo2-web`
   - **Build command**: `bun install && bun run build`
   - **Start command**: `NODE_ENV=production API_URL=https://your-api.onrender.com bun start`

3. Add environment variable:
```
API_URL=https://your-api.onrender.com
```

### 5. Update Google OAuth redirect URI

After deployment, update the Authorized redirect URI in Google Cloud Console to match your actual API URL.

---

## Architecture

```
sigmatodo2/
├── sigmatodo2-common/   # Shared TypeScript types
├── sigmatodo2-srv/      # Fastify API server (port 3001)
│   ├── src/
│   │   ├── config.ts    # Environment config
│   │   ├── db/          # SQLiteDB (dev) + SupabaseDB (prod)
│   │   ├── storage/     # Filesystem (dev) + Supabase Storage (prod)
│   │   └── routes/      # API route handlers
│   └── index.ts
└── sigmatodo2-web/      # React 19 frontend (port 3000)
    └── src/
        ├── lib/         # API client, auth context
        ├── pages/       # Page components
        └── components/  # Reusable components (shadcn/ui + custom)
```

## Switching modes

| Mode | Auth | Database | Storage |
|------|------|----------|---------|
| `dev` (default) | Password | SQLite | Local filesystem |
| `prod` | Google OAuth | Supabase Postgres | Supabase Storage |

Set `APP_MODE=prod` in the server's environment to enable production mode.
