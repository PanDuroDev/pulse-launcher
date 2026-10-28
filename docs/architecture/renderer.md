# Renderer architecture

This guide records the current renderer boundaries after the incremental refactor. It is a map of responsibilities, not a requirement to split every component into another file.

## Data and UI flow

```text
Zustand stores + preload API (window.launcher)
                  |
                  v
                App.tsx
       (composition and data flow)
          /       |        \
         v        v         v
  Page state   Runtime   View model
  + navigation services    + actions
         \        |         /
          \       v        /
           LauncherFrame
                  |
          LauncherPageContent
          /       |        \
         v        v         v
   Search/Add  Details/    LibraryHome
               Music/
               Settings
```

## Main boundaries

| Area | Primary modules | Responsibility |
| --- | --- | --- |
| Composition | `src/renderer/src/App.tsx` | Reads the small set of global store selectors and wires the page, runtime, navigation, presentation, and shell layers together. Avoid moving detailed interaction logic back here. |
| Page state | `hooks/use-launcher-page-state.ts` | Owns active-page flags, search query, details draft/save state, and the remembered focus key. |
| Navigation | `hooks/use-launcher-navigation-controller.ts` and the focused navigation hooks | Coordinates page transitions and focus restoration. The smaller hooks own the behavior for Search, Add Game, Details, Settings, Music, newly-added games, and focus recovery. |
| Runtime | `hooks/use-launcher-game-runtime.ts`, `hooks/use-launcher-runtime-services.ts` | Composes game launch/running-game actions and app-wide services such as initialization, music playback, cursor behavior, UI sounds, and boot-time spatial-navigation pause/resume. |
| Input | `hooks/use-launcher-input-handlers.ts`, `hooks/use-launcher-keyboard-shortcuts.ts`, `hooks/use-launcher-gamepad.ts` | Binds keyboard shortcuts, Tab traversal, and gamepad actions to the same page actions. |
| Presentation model | `lib/launcher-view-model.ts`, `hooks/use-launcher-view-model.ts`, `lib/launcher-page-types.ts` | Purely derives the active route, page title, visibility flags, selected-game action state, force-quit countdown, and the header mark mood. The pure function is tested without rendering React. |
| Frame and page views | `components/launcher/LauncherFrame.tsx`, `LauncherPageContent.tsx`, `LibraryHome.tsx` | Render the top-level frame, active-page route, and populated library hero/rows. Page-specific components remain responsible for their own presentation and focus targets. |
| Shared contracts | `src/shared/contracts/` | Contains data-only types shared across main, preload, and renderer. `src/shared/types.ts` remains a compatibility barrel for older imports. |

## Important invariants

- Keep IPC channel names and preload exposure changes separate from renderer-only refactors. Renderer features call the typed `window.launcher` API rather than reaching into main-process modules.
- Keep values crossing IPC serializable and free of process-local objects or DOM references.
- `deriveLauncherViewModel` is the single source for `activePage`; `LauncherPageContent` renders that route rather than recalculating precedence. The priority is intentional when multiple page flags are true and is covered by pure tests.
- Focus restoration should occur only when the destination focus key exists. Preserve the current delayed hand-offs where the destination mounts after a page-state update.
- New behavior should be added at the narrowest existing boundary: state in the page-state hook, navigation in a page navigation hook, runtime work in a runtime hook, pure decisions in `lib`, and visuals in components.
- Prefer pure helpers for branching/countdown/precedence rules so they can be tested without mounting Electron or the renderer DOM.

## Verification

Run the local checks before proposing a merge:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The CI workflow runs these checks. The separate Windows workflow builds and verifies the NSIS installer and update artifacts.
