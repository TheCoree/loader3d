# Loader3D — notes for Claude

Interactive 3D truck-loading planner (React 18 + TypeScript + three.js + zustand, Vite) with a backend in
`backend/` (Python 3.14, FastAPI, async SQLAlchemy 2, Alembic; SQLite in dev, Postgres in prod).
Architecture, controls, API endpoints and extension points are in README.md — read it first.

## Working agreements

- The user writes in Russian: reply in Russian. All UI text is Russian; code, identifiers and comments are English.
- Units: everything is stored in centimetres; `core/units.ts` converts for display (мм / см / м).
- Repository: https://github.com/almbvb/loader3d (private), branch `main`. Commit only when the user asks.

## Commands

- `npm run dev` — dev server on http://localhost:5173 (also `.claude/launch.json` → "loader3d").
- `npm test` — Vitest unit tests for `src/core`.
- `npx tsc --noEmit` — typecheck; `npm run build` — typecheck + production build.
- Run all three before calling a change done; check scene changes in the browser.
- Backend (from `backend/`, needs uv): `uv run python -m app --reload` — migrations + API on :8000
  (`.claude/launch.json` → "api"; Vite proxies `/api` there); `uv run pytest`; `uv run ruff check .` and
  `uv run ruff format --check .`. Run them before calling a backend change done.
- Deploy: `docker compose up -d` (web: Dockerfile → Caddy, `deploy/Caddyfile`; api: `backend/Dockerfile`;
  db: Postgres). Every deploy setting is an env variable documented in `.env.example`; add new ones there,
  to `docker-compose.yml` and to README.

## Invariants (do not break)

- Cargo never floats and never intersects: every mutation of items ends with `settle()` (`core/physics.ts`);
  drag/resize previews compute heights via `supportHeight` / `groupBaseY`, the user never sets Y.
- `src/core` is pure logic (no three.js, no React) and covered by `core.test.ts`; add tests there for new rules.
- World axes: X along the vehicle (towards the cab), Y up, Z across. Rear doors of the last body at X = 0,
  the dock (staging area) is X < 0. Item `pos` is the min corner of its box; size comes from `itemSize()`
  (orientation-aware) — never read `dims` as world size directly.
- Pointer routing lives in `scene/InteractionManager.ts`: press on empty space goes to OrbitControls,
  press on an item/handle is captured and becomes a `Tool`. New gestures implement `scene/tools/Tool.ts`.
- Rendering is on demand: call `engine.requestRender()` after changing anything in the scene.
- In dev the engine is exposed as `window.__loader3d` for debugging in the browser console.
- Backend: every route is under `/api`; JSON is camelCase (`schemas/base.py` `ApiModel`); errors are
  `ApiError` with an English `code` and a Russian `message`. Plan contents are the frontend's `Plan`
  validated by `schemas/plan_data.py` — when `src/core/types.ts` or the limits in `presets.ts`/`item.ts`
  change, change it too. A model change needs an Alembic migration that works on SQLite and Postgres
  (`test_migrations_match_the_models` checks it). Access tokens are checked against the `sessions` table
  on every request; refresh tokens rotate and live only in the httpOnly cookie.
