# Real Module Boundaries and Structural Improvement Plan

**Status:** Proposal only — no runtime code changes  
**Reviewed:** 2026-10-27  
**Scope:** Maintainability, module cohesion, dependency direction, testability, and application structure. This is not a proposal to change Pulse Launcher’s product scope or add user-facing features.

## Executive summary

Pulse Launcher already has useful domain folders: the main process has catalog and music areas, the renderer has launcher components, and shared contracts live separately. The main architectural opportunity is therefore **not to create more folders for their own sake**. It is to make each module own one responsibility, keep orchestration thin, and make dependencies flow through explicit boundaries.

Several current files have grown into multi-responsibility entry points:

| Current file | Observed size | Structural concern |
| --- | ---: | --- |
| `src/renderer/src/components/launcher/MusicPage.tsx` | ~2,395 lines | One page contains screen orchestration, multiple search modes, provider/source UI, YouTube setup and cache controls, overlay controls, transport controls, and several row types. |
| `src/renderer/src/App.tsx` | ~1,478 lines | The application shell also owns substantial library behavior, game-action lifecycle, navigation/focus coordination, and music-related wiring. |
| `src/main/index.ts` | ~1,166 lines | Window/lifecycle management, process events, application setup, validation/security helpers, and IPC handlers for catalog, settings, file browsing, music, YouTube, and overlay behavior share one module. |
| `src/renderer/src/components/launcher/SettingsPage.tsx` | ~1,027 lines | Settings layout and multiple specialized rows/controls live alongside the page-level coordination. |
| `src/shared/types.ts` | ~658 lines | Contracts for several domains are collected in one growing shared module. |
| `src/preload/index.ts` | ~153 lines | A single preload entry point exposes a broad API for multiple domains. Its size is currently manageable, but the API should remain organized as the surface grows. |

Line count alone is not a defect and these figures are not target limits. They are signals to inspect whether a file has multiple reasons to change. The proposed outcome is a **cohesive, testable module graph**, not a large mechanical file split.

## 1. What “real modularization” means

A split is useful when it creates an explicit boundary. It is not useful when a file is moved into a new directory but still imports and controls everything, or when a single component is divided into many tiny files that share hidden state.

Use these rules:

1. **One primary reason to change per module.** A module may contain several related functions, but they should serve one responsibility.
2. **Keep orchestration separate from implementation.** Page and application entry points coordinate smaller units; they should not contain all domain logic.
3. **Extract by behavior and ownership, not by line count.** A coherent 500-line module can be healthier than ten 50-line modules that are tightly coupled.
4. **Keep state beside the behavior that owns it.** Do not move state into a generic hook merely to shorten a component. Extract it when it has a meaningful lifecycle or domain boundary.
5. **Make dependencies point inward to stable contracts.** UI components should not know Electron details; domain logic should not depend on React; shared contracts must not import runtime-specific layers.
6. **Preserve behavior during structural changes.** Refactors should be reviewable and testable independently from feature changes.

A practical test for every proposed extraction is: *Can this module be described in one sentence, and can it be tested or reviewed without understanding the whole application?*

## 2. Proposed responsibility map

The following is a target direction, not a requirement to move every existing file at once. Keep existing paths where they already express a sound boundary.

```text
src/
  main/
    bootstrap/                 # App startup, shutdown, window/tray lifecycle
    ipc/
      register.ts              # Composes domain handler registrars
      guards.ts                # Sender/origin checks and shared IPC guard helpers
      catalog-handlers.ts
      settings-handlers.ts
      library-handlers.ts
      app-handlers.ts
      music-handlers.ts        # Music library + online/YouTube use cases
      overlay-handlers.ts
    catalog/                   # Catalog discovery, merging, source adapters
    music/
      library/                 # Local scanning, metadata, persisted library
      online/                  # Online provider adapters and ranking
      youtube/                 # YouTube search/resolve/cache/tool integration
      overlay/                 # Overlay window behavior
    persistence/               # Focused repositories/adapters for persisted data
    platform/                  # OS/process/window/file-system integrations
    services/                  # Cross-domain orchestration only when justified
  preload/
    index.ts                   # Creates the one exposed API object
    api/
      catalog.ts
      settings.ts
      library.ts
      app.ts
      music.ts
      overlay.ts
  renderer/
    src/
      app/
        App.tsx                # Root composition and top-level route/shell
        useLauncherController.ts
        navigation.ts           # Navigation/focus policy, if it remains substantial
      features/
        library/
          components/
          hooks/
          model/               # Pure sorting, selection, and view-model logic
        settings/
          components/
          hooks/
        music/
          components/
          hooks/
          model/               # Search merging/filtering/formatting without JSX
      components/
        layout/                # Shared layout primitives, not feature workflows
        ui/                    # Reusable low-level UI primitives
      hooks/                   # Truly cross-feature hooks only
      lib/                     # Pure cross-feature utilities only
  shared/
    contracts/
      catalog.ts
      settings.ts
      library.ts
      app.ts
      music.ts
      overlay.ts
      ipc.ts                  # Typed channel contract composition
    format.ts
    library.ts                # Only pure, cross-layer-safe domain helpers
```

The tree intentionally keeps domain code grouped by capability and keeps Electron-specific implementation inside `main` and `preload`. It does not prescribe a framework migration, a new state-management library, or a full rename of the existing project.

## 3. Concrete refactoring recommendations

### 3.1 `src/main/index.ts`: make it a composition root

**Current issue:** the file contains startup/lifecycle concerns and a long sequence of handlers for different domains. A change to music IPC is therefore reviewed in the same large file as window behavior and game/catalog operations.

**Recommended boundary:**

- Keep `index.ts` responsible for composing services and starting the app.
- Move window creation, tray setup, display-sleep handling, and close/shutdown behavior into a focused lifecycle module if those responsibilities can be separated without circular dependencies.
- Move handler registration into domain-specific registrars: catalog, settings, file/library browsing, app/window commands, music/YouTube, and overlay.
- Keep shared sender/origin validation in one small guard module. Handler modules must use those guards rather than reimplementing weaker variants.
- Keep handlers thin: validate the incoming payload, authorize the sender, call a service, and return a defined result. Move business rules into the relevant service.
- Avoid a generic dependency-injection framework. Pass explicit dependencies into registrars where needed; simple functions and constructor options are sufficient.

A handler registrar should resemble this shape conceptually:

```ts
registerMusicHandlers({
  musicLibrary,
  onlineSearch,
  youtubeService,
  overlay,
  assertTrustedSender,
})
```

This is an architectural illustration, not a request to copy this exact API before checking the current constructors and lifecycles.

**Acceptance criteria:**

- The root entry point no longer implements all domain handlers inline.
- Each registrar owns a recognizable channel group.
- Every handler preserves current sender validation, input validation, return types, and event behavior.
- Handler registration can be tested separately from window startup.

### 3.2 `MusicPage.tsx`: separate workflows, not just visual fragments

**Current issue:** the page combines several distinct workflows and numerous supporting controls/row renderers. Extracting only the small presentational components would leave the page itself responsible for too much state and branching.

**Recommended first split:**

- **`MusicPage.tsx`** — page composition, active tab/mode, and coordination between extracted sections.
- **`hooks/useMusicSearch.ts`** — query lifecycle, debounce/cancellation, search status, and coordination of sources if that logic is currently local to the page.
- **`components/MusicSearchBar.tsx` / `MusicSourceFilters.tsx`** — search input and source filtering UI.
- **`components/MusicResults.tsx`** — result list composition and empty/loading/error states.
- **`components/TrackRow.tsx`, `OnlineTrackRow.tsx`, `YouTubeTrackRow.tsx`** — genuinely different row presentations; share a smaller row primitive only if the layouts and interactions are actually common.
- **`components/YouTubeSetupPanel.tsx`** — YouTube configuration, tool status, cache actions, and their local form state.
- **`components/OverlaySettings.tsx`** — overlay-specific settings/preview controls.
- **`components/PlaybackControls.tsx`** — transport, seek, volume, shuffle, and repeat controls if their behavior can be kept independent of result rendering.
- **`model/`** — pure provider summaries, result transformations, filters, and formatting that do not require React or JSX.

Names and exact groupings should follow the present code after tracing state ownership. Do not extract each button, one-line formatter, or static label into its own file. Avoid putting all extracted logic in one new `music-utils.ts`; that simply relocates the coupling.

**State ownership rule:** query input and request lifecycle belong with search; setup form values belong with setup; playback truth belongs to the existing music engine/store; the page should pass explicit data and callbacks between these areas instead of maintaining duplicate copies.

**Acceptance criteria:**

- The page becomes a readable composition of a few named sections.
- Search, YouTube setup, result rows, and overlay controls can be reviewed with limited knowledge of one another.
- Pure transformations have focused unit tests; interaction tests cover the page-level flow.
- No duplicated source of truth is introduced for playback, settings, or search status.

### 3.3 `App.tsx`: separate app composition from the launcher controller

**Current issue:** the root React component combines shell/page composition with library actions, launch/force-quit lifecycle, navigation/focus behavior, event subscriptions, and music initialization.

**Recommended boundary:**

- Keep `App.tsx` responsible for the top-level shell, selected page/overlay composition, global error boundary/toaster, and high-level event wiring.
- Extract a `useLauncherController` only for the related lifecycle and operations that are currently implemented in the root: selected game/library actions, launch state transitions, force-quit timing, subscriptions, and refresh coordination.
- Keep pure game-action transitions in the existing `lib/game-actions`-style domain module; the hook should connect those transitions to React and the IPC API rather than duplicate the state machine.
- Put navigation/focus policy in a dedicated module only if it forms a coherent boundary. Keep component-specific focus keys near the components that own them.
- Keep feature-specific state in its existing feature store or feature hook. Do not turn the root into a universal store or global event bus.

**Acceptance criteria:** the root component reads mostly as composition; launch lifecycle tests can exercise the controller/state machine without rendering every page; navigation behavior remains covered by existing interaction checks.

### 3.4 `SettingsPage.tsx`: group by setting domain and behavior

Break the page into meaningful sections such as general/window behavior, library sources, artwork, interaction/accessibility, and manual-game management only where these are actual existing responsibilities. Put reusable setting rows in feature-local components, not in a universal component that knows every settings type.

Keep field labels, validation, persistence calls, and explanatory copy close to the setting they describe. A row component should receive typed values and callbacks; it should not reach directly into unrelated stores or the Electron API.

### 3.5 Shared contracts: replace the growing type bucket with domain modules

**Current issue:** `src/shared/types.ts` includes types for game/catalog data, settings, music, process state, and other concerns. A single file is convenient initially, but makes ownership unclear as the project grows.

Split contracts into domain-owned files, for example `contracts/catalog.ts`, `contracts/settings.ts`, `contracts/music.ts`, and `contracts/overlay.ts`. Keep a compatibility re-export during migration if it prevents a noisy import-only diff; new code should import from the narrowest appropriate domain contract.

Rules for shared modules:

- They may contain serializable types, safe constants, schemas, and pure cross-layer helpers.
- They must not import Electron, Node-only services, React components, or renderer stores.
- Do not put every domain type into a generic `common.ts`.
- Separate types that cross IPC from internal implementation types when those sets begin to diverge.
- Prefer explicit domain-owned names over large generic names such as `State`, `Result`, or `Config`.

### 3.6 Preload and IPC: preserve one secure bridge, organize its implementation

The single `contextBridge.exposeInMainWorld` call is a useful security boundary and should remain singular. If the preload API grows, move each API section into a small module that returns a typed object, then compose those sections once in `preload/index.ts`. Do not expose `ipcRenderer`, arbitrary channel invocation, or a generic `send(channel, payload)` function to the renderer.

Keep channel names, payload schemas, and response types aligned by domain. Prefer a typed wrapper around approved channels and runtime validation of untrusted IPC payloads over repeated casts scattered across handlers. TypeScript types alone do not validate runtime data.

A safe refactor must preserve:
- the trusted sender/origin checks;
- narrow allow-listed methods in the preload API;
- input validation at the IPC boundary;
- sender authorization for overlay-specific events;
- cancellation and disposal semantics for subscriptions;
- existing error/result behavior visible to the renderer.

### 3.7 Persistence: make ownership explicit before changing storage

The current store handles several persisted concerns, including settings, manual games, favorites/selection, and play history. Do not split storage merely because multiple JSON files exist. First define which module owns each persisted record and which operations must be atomic together.

Where responsibilities are independent, introduce focused repositories/adapters (for example, settings, manual catalog entries, and play history) and keep an `AppStore` facade only if it provides a useful application-level API. Reuse the existing atomic-write, backup, migration, and recovery mechanisms. Avoid a repository abstraction that simply forwards every method without adding isolation or testability.

## 4. General architectural improvements

These apply beyond any single page or feature and should be treated as ongoing engineering standards.

### Dependency direction

Maintain a simple dependency rule:

- **Renderer UI** depends on feature models/hooks and shared serializable contracts.
- **Preload** translates a narrow renderer API into approved IPC calls.
- **Main IPC handlers** validate/authorize and call main-process services.
- **Domain services** depend on explicit adapters or interfaces for OS, network, filesystem, and persistence behavior.
- **Shared code** stays runtime-neutral and must not import from main, preload, or renderer implementation folders.

Avoid circular imports between feature folders. If two domains need the same behavior, either place a genuinely generic pure helper in a lower-level module or make the dependency explicit; do not solve every dependency by importing from a broad barrel.

### Stable boundaries for side effects

Keep OS/process access, filesystem access, network providers, timers, and Electron windows behind identifiable adapters/services. Pure parsing, merging, ranking, sorting, and state-transition logic should remain independently testable. Do not wrap every function in an interface: introduce an adapter when it isolates a real side effect or variable dependency.

### Consistent error and cancellation semantics

Define how each layer reports expected failures, unexpected failures, cancellation, and timeouts. Avoid swallowing cancellation as a normal provider failure or returning success-shaped empty data when the operation actually failed. Log unexpected errors with enough context to diagnose them, while keeping user-facing errors sanitized. Use the same conventions across providers and IPC rather than inventing a new error framework in each folder.

### State and event ownership

For each piece of state, document its owner and lifecycle: main-process service, persisted record, renderer store, or temporary component state. Events should describe meaningful domain changes and be emitted from one authoritative owner. Avoid duplicate state copies that are synchronized through ad hoc effects.

### Type safety at boundaries

Keep strict TypeScript checks, but do not treat a compile-time cast as input validation. Use the existing Zod dependency at trust boundaries where payloads cross from renderer to main or come from provider/filesystem data. Avoid validating the same trusted value repeatedly in every internal function; validate once at the boundary and preserve validated types internally.

### Testing strategy tied to module boundaries

Every extraction should come with tests for the boundary it creates:

- Unit tests for pure transformations and state transitions.
- Service tests with filesystem/network/process dependencies replaced by small fakes.
- IPC handler tests for payload validation, authorization failures, success, errors, and cancellation.
- Renderer component tests for meaningful interaction flows, not snapshots of every tiny visual component.
- A small number of end-to-end/release checks for high-risk paths: startup, library scan, launch/return, settings persistence, and music/overlay lifecycle.

Do not rely on test count as the primary quality metric. Tests should verify observable behavior and failure paths, and a refactor should preserve the existing suite before new behavior is introduced.

### Module and file conventions

- Use domain names that explain the capability: `music/search`, `catalog/scan`, `settings/persistence`.
- Keep files cohesive; do not enforce an arbitrary maximum line count.
- Avoid catch-all files such as `helpers.ts`, `utils.ts`, and `types.ts` becoming the default home for unrelated code.
- Keep tests close to the code when that matches the current Vitest conventions.
- Prefer explicit imports over broad barrels where barrels obscure ownership or introduce cycles.
- Separate pure logic from React/Electron code to reduce test setup and accidental runtime coupling.
- Keep comments focused on non-obvious constraints and decisions; the module structure should explain the ordinary code path.

## 5. Incremental migration plan

Do not perform a wholesale directory rewrite. Each step should be a focused PR or independently reviewable commit, preserving behavior.

### Phase 0 — Establish a baseline

- Record the current test, typecheck, lint, and build outcomes in the PR/CI output.
- Identify public module exports, IPC channels, event subscriptions, and state owners before moving code.
- Add characterization tests for critical behavior that currently lacks direct coverage.
- Agree on the target dependency rules above.

**Exit condition:** the baseline is known and critical existing behavior has tests or an explicit manual verification plan.

### Phase 1 — Split IPC registration from the main entry point

- Extract domain handler registration without changing channel names or payloads.
- Keep security guards shared and mandatory.
- Test handlers independently from BrowserWindow and application startup where practical.

**Exit condition:** `src/main/index.ts` is a composition root rather than the implementation home for all IPC domains.

### Phase 2 — Split the music page by workflow

- Extract pure model logic first.
- Extract search orchestration and setup/overlay sections with clear state ownership.
- Move distinct rows and controls into feature-local component files only when they have cohesive props and responsibilities.
- Preserve keyboard/gamepad focus behavior and subscription cleanup.

**Exit condition:** page composition is small enough to understand at a glance, and search/setup/overlay logic can be tested without mounting the entire page.

### Phase 3 — Separate the launcher controller and settings sections

- Move root-level launch lifecycle coordination into a controller hook or service.
- Keep pure state transitions outside React.
- Divide settings UI by cohesive sections while preserving accessible labels and navigation focus.

**Exit condition:** page components primarily compose UI and delegate workflows to named modules.

### Phase 4 — Narrow shared contracts and persistence ownership

- Split the shared contract file by domain with compatibility re-exports where useful.
- Separate persistence repositories only where it produces independent ownership and testability.
- Remove transitional re-exports/imports after downstream code has migrated.

**Exit condition:** domain ownership is visible from imports and no runtime-specific dependency leaks into shared contracts.

### Phase 5 — Enforce the architecture in review and CI

- Document dependency rules for contributors.
- Add lightweight checks for forbidden imports or cycles only if the current toolchain can enforce them reliably.
- Keep build/test/lint gates mandatory for structural PRs.

**Exit condition:** new code is unlikely to recreate the same oversized orchestration modules.

## 6. Definition of done for structural PRs

A structural PR should meet all applicable criteria:

- No intended product behavior change; any unavoidable behavior change is called out separately.
- The diff is organized around one responsibility or one migration phase.
- New modules have clear names, narrow inputs/outputs, and an identifiable owner.
- Dependency direction is preserved; no circular import or bypass of the preload boundary is introduced.
- Tests cover extracted pure logic and the affected boundary/failure paths.
- `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` are run and their outcomes reported.
- The PR describes behavior preservation and any manual checks that automated tests cannot cover.

## 7. Out of scope

This proposal does not recommend adding user-facing features, replacing the framework/state-management stack, introducing a dependency-injection container, rewriting the music subsystem, or renaming the entire repository. The goal is to make the current application easier to change safely by improving responsibility boundaries and dependency direction.

## Final recommendation

Start with the largest boundary problem that has the clearest seam: **move main-process IPC registration out of `src/main/index.ts`**, then modularize `MusicPage.tsx` by workflow with explicit state ownership. Those changes reduce unrelated concerns in high-churn files while keeping the UI, providers, persistence format, and public behavior intact. Continue with the root launcher controller and shared contracts only after the first refactors demonstrate a repeatable pattern.
