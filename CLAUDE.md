# Loader3D — notes for Claude

Interactive 3D truck-loading planner (React 18 + TypeScript + three.js + zustand, Vite). Architecture,
controls and extension points are in README.md — read it first.

## Working agreements

- The user writes in Russian: reply in Russian. All UI text is Russian; code, identifiers and comments are English.
- Units: everything is stored in centimetres; `core/units.ts` converts for display (мм / см / м).
- Repository: https://github.com/almbvb/loader3d (private), branch `main`. Commit only when the user asks.

## Commands

- `npm run dev` — dev server on http://localhost:5173 (also `.claude/launch.json` → "loader3d").
- `npm test` — Vitest unit tests for `src/core`.
- `npx tsc --noEmit` — typecheck; `npm run build` — typecheck + production build.
- Run all three before calling a change done; check scene changes in the browser.

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
