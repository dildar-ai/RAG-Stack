# RAG Stack — Custom RAG Chatbot with Citations

Upload PDFs, ask questions, get grounded answers with **page-level citations** that
open the exact passage in a source viewer. Every workspace can also publish an
**embeddable chat widget** for its own public website.

A Turborepo monorepo with two apps:

> 📘 **Full architecture walkthrough, API-key map, and deployment playbook:** see
> [PROJECT_GUIDE.md](./PROJECT_GUIDE.md).

| App | Stack | Purpose |
|-----|-------|---------|
| `apps/web` | Next.js 16 (App Router, Turbopack) + Tailwind + Supabase SSR | Dashboard, document library, playground, embeddable widget |
| `apps/api` | FastAPI (Python 3.10) | PDF ingestion, embeddings, vector search, RAG generation |

**Infrastructure:** Supabase (Auth + Postgres + Storage), Qdrant (vectors), Groq (LLM), `all-MiniLM-L6-v2` (local embeddings).

---

## How it works

1. **Ingestion** — PDF is parsed with PyMuPDF into reading-order chunks carrying
   `page` + `bbox` coordinates (adjacent blocks merged, repeated headers/footers
   collapsed to their first occurrence), batch-embedded locally, upserted into
   Qdrant, stored in a **private**
   Supabase bucket, and registered in the `documents` table. Any failed step triggers
   compensation cleanup of partial state.
2. **Retrieval** — the query is embedded and searched in Qdrant, hard-filtered by
   `workspace_id` (tenant isolation happens before anything else) and pruned by a
   cosine-score threshold so weak matches never reach the prompt.
3. **Generation** — top-K chunks are assembled into a constrained `<context>` prompt
   (every block labelled with its page) and answered by Groq (`openai/gpt-oss-20b`
   by default). The model must cite each statement with a `[n]` marker or refuse.
4. **Citations** — only the sources the model actually used are returned, renumbered
   so marker `[n]` in the answer maps 1:1 to chip `[n]` below it. Clicking a chip
   opens the PDF on **that exact page** and highlights the source region via a
   short-lived **signed URL** (so old chat history still resolves after URLs expire).

## Security model

- **Auth**: the browser only ever holds the Supabase anon key. The API validates each
  request's bearer token against Supabase Auth (`/auth/v1/user`, algorithm-agnostic)
  with a small TTL cache, then verifies workspace ownership on every tenant-scoped call.
  The service-role key never leaves the server.
- **RLS**: all Postgres tables and storage objects are policy-protected per owner even
  though the API uses the service role by design.
- **Widget**: anonymous visitors authenticate with a workspace-scoped *publishable key*
  that can only query that workspace's knowledge base — never read/upload/delete
  documents. Optional origin allow-listing and a source-access toggle control whether
  visitors can open the underlying PDFs.
- **Abuse protection**: per-identity sliding-window rate limits on chat, upload and
  widget traffic (`RATE_LIMIT_*_RPM`), hard upload size cap, PDF magic-byte validation.
- **Ops hygiene**: request-ID logging with access times, global exception handlers that
  never leak stack traces or upstream error strings, credential-redacted 5xx payloads,
  security headers on both apps, `/docs` disabled when `APP_ENV=production`, fail-fast
  startup when required env vars are missing in production.

---

## Local development

### 1. Provision the data plane

1. Create a **Supabase** project. In the SQL editor, run [`schema.sql`](./schema.sql)
   (creates `workspaces`, `documents`, `profiles`, `chats`, `messages`, `widget_settings`,
   the private `documents` storage bucket and all RLS policies). For a database that
   already exists from an older schema, apply
   [`migrations/001_production_hardening.sql`](./migrations/001_production_hardening.sql)
   instead — it is non-destructive.
2. Create a **Qdrant** collection-backed instance (cloud or `docker run qdrant/qdrant`).
3. Get a **Groq** API key.

### 2. Configure and run the API

```powershell
cd apps/api
Copy-Item .env.example .env    # fill in real values
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Configure and run the web app

```powershell
cd apps/web
Copy-Item .env.example .env.local   # fill in Supabase URL + anon key
npm install
npm run dev
```

Enable **Email** (and optionally OAuth) providers in Supabase Auth. Add a
`SITE_URL` redirect to `http://localhost:3000/auth/callback` under Auth → URL Configuration.

Or run everything from the repo root with Turbo: `npm install && npm run dev`.

## Deployment

- **Web → Vercel**: import the repo, set `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.
- **API → any Docker platform** (or Hugging Face Spaces, port 7860 is the default):

```powershell
docker build -t rag-api ./apps/api
docker run --env-file apps/api/.env -p 8000:7860 rag-api
```

Set `APP_ENV=production` (the image does this by default), configure
`ALLOWED_ORIGINS` with your web origin(s), and provide all four required secrets
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QDRANT_URL`, `GROQ_API_KEY`) —
startup aborts without them in production mode.

## Configuration reference (`apps/api/.env`)

| Variable | Default | Notes |
|---|---|---|
| `QDRANT_URL` / `QDRANT_API_KEY` | — | Vector database connection |
| `GROQ_API_KEY` / `GROQ_MODEL` | `openai/gpt-oss-20b` | Generation backend |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | — | Auth, DB, storage (service role is server-only) |
| `ALLOWED_ORIGINS` | `localhost:3000` | Comma-separated CORS origins |
| `APP_ENV` | `development` | `production`: fail-fast env, docs off, HSTS |
| `LOG_LEVEL` | `INFO` | DEBUG/INFO/WARNING/ERROR |
| `MAX_UPLOAD_MB` | `25` | Hard server-side upload cap |
| `RATE_LIMIT_CHAT_RPM` / `RATE_LIMIT_WIDGET_RPM` / `RATE_LIMIT_UPLOAD_RPM` | 30 / 20 / 10 | Per rolling minute |
| `RAG_TOP_K` / `RAG_MIN_SCORE` / `RAG_MAX_CHUNK_CHARS` / `RAG_MAX_HISTORY_TURNS` | 6 / 0.10 / 1200 / 6 | Retrieval + prompt assembly tuning |
| `PDF_CHUNK_MERGE_CHARS` | `700` | Adjacent PDF blocks merged up to this size |

## Repo layout

```
apps/api    FastAPI: routers (upload/chat/widget) + services (rag, auth, storage, rate_limit)
apps/web    Next.js: dashboard, /widget/[publishable_key], Supabase SSR auth
packages/   Shared eslint / typescript / ui packages
schema.sql  Supabase tables, RLS policies, storage bucket
```

Monorepo tasks: `npm run build` · `npm run lint` · `npm run check-types`.

> Rate limiting is in-process; if you scale the API beyond one replica, move it to
> Redis (see `services/rate_limit.py`).
