# AGENTS.md — Pulse Launcher

Instructions for any coding agent (or human) working in this repository.

This file describes **what is actually here**: real files, real line counts, real
exports, real IPC channels, real versions. If a statement here disagrees with the
code, the code wins — and this file should be corrected in the same change.

`PLAN.md` holds the product plan and acceptance criteria (Arabic).
`README.md` is the user/developer documentation (English).

---

## 1. What this is

Pulse Launcher is a PS5-style **fullscreen game launcher for Windows**. It
aggregates games from Steam, Epic Games, Start Menu shortcuts, and manually added
executables into one cinematic, controller-friendly library.

**Requirements** — Windows 10/11, Node.js ≥ 22.12 (`engines`), npm.

**Language** — the user writes in Arabic; reply in Arabic. Code, comments, and
docs are in English, with three deliberate exceptions: `docs/audit/`,
`docs/design/`, and the PR conversation stay Arabic. The vendored Bloub engine
keeps its original **French** comments: leave them as they are.

### 1.1 Installed versions (verified in `node_modules`)

`package.json` uses caret ranges; these are the versions actually installed and
what the gates were last run against.

| Package | Declared | Installed |
| --- | --- | --- |
| electron | `^45.0.0` | 45.0.0 |
| electron-vite | `^6.0.0` | 6.0.0 |
| vite | `^8.3.4` | 8.3.5 |
| react / react-dom | `^19.3.1` | 19.3.1 |
| typescript | `~6.0.3` | 6.0.3 |
| zustand | `^5.0.16` | 5.0.16 |
| tailwindcss / @tailwindcss/vite | `^4.3.3` | 4.3.3 |
| motion | `^14.6.0` | 14.6.0 |
| @noriginmedia/norigin-spatial-navigation-core | `^4.1.2` | 4.1.2 |
| @noriginmedia/norigin-spatial-navigation-react | `^3.3.0` | 3.3.0 |
| zod | `^4.6.7` | 4.6.7 |
| vitest | `^5.0.5` | 5.0.5 |
| oxlint | `^1.88.0` | 1.89.0 |
| electron-builder | `^26.15.3` | 26.15.3 |
| sonner | `^2.0.8` | 2.0.8 |
| uisfx | `^0.4.0` | 0.4.0 |
| @base-ui/react | `^1.9.0` | 1.9.0 |
| @mingcute/react | `^3.0.2` | 3.0.2 |
| electron-log | `^5.4.4` | 5.4.4 |
| music-metadata | `^12.3.2` | 12.3.2 |
| @fontsource-variable/geist | `^5.3.0` | 5.3.0 |
| class-variance-authority | `^0.7.1` | 0.7.1 |
| cn | `^0.5.0` | 0.5.0 |
| tw-animate-css | `^1.4.0` | 1.4.0 |
| @vitejs/plugin-react | `^6.1.2` | 6.1.2 |
| shadcn (CLI, dev) | `^4.22.1` | 4.22.1 |
| @electron/fuses (dev) | `^2.1.3` | 2.1.3 |

Not installed but referenced in configs: `components.json` says
`"iconLibrary": "lucide"`, yet **the app imports every icon from
`@mingcute/react`** (and `lucide-react` is not a dependency). When adding an icon,
use `@mingcute/react`; ignore the shadcn CLI's default.

### 1.2 Verifying a library version or API with Context7

Do not answer "how does library X work" from memory - this project is on very
recent majors (React 19, Tailwind 4, Vite 8, TypeScript 6, Zod 4, electron-vite 6)
where older habits are wrong. Query Context7 first:

```text
resolve-library-id({ libraryName: "Electron", query: "..." })
query-docs({ libraryId: "/websites/electron-vite", query: "..." })
```

The version table in §1.1 and the notes below were checked against
`node_modules` and Context7 on 2026-10-26. Re-check a claim before repeating it
as fact; if Context7 and this file disagree, Context7 wins for the library and
the code wins for the project.

Resolved IDs used so far. Copy the exact string — `query-docs` rejects anything
that is not in this form, and a wrong guess fails loudly with "Library not found".

| Library | Context7 ID | Note |
| --- | --- | --- |
| electron-vite | `/websites/electron-vite` | alt `/alex8088/electron-vite-docs`, `/websites/electron-vite_guide` |
| Electron | `/electron/electron` | **docs top out at v44**; we run 45, so treat gaps as "check `node_modules/electron/electron.d.ts`" |
| electron-builder | `/electron-userland/electron-builder` | nsis / `extraResources` options |
| Norigin spatial navigation | `/noriginmedia/norigin-spatial-navigation` | |
| Zustand | `/pmndrs/zustand` | |
| Motion (Framer) | `/websites/motion_dev` | alt `/framer/motion` |
| Tailwind CSS | `/websites/tailwindcss` | alt `/tailwindlabs/tailwindcss.com` |
| Zod | `/colinhacks/zod` | |
| Base UI | `/mui/base-ui` | has a `v1.9.0` snapshot, which is our version |
| Vitest | `/vitest-dev/vitest` | |
| MingCute icons | `/mingcute-design/mingcute-icons` | Medium reputation; for exact export names read `node_modules/@mingcute/react/core-filled` |

Do not use `/websites/electron` or `/base-ui/react` — both resolve to nothing.
`resolve-library-id` first if a new package shows up.

Facts confirmed this way and worth remembering:

- **electron-vite ≥ 5 deprecates `externalizeDepsPlugin`**; `build.externalizeDeps`
  is on by default and the plugin can be deleted. This repo still imports the
  plugin (`electron.vite.config.ts` lines 4, 12, 21) — it works, but it is legacy.
  If you touch that config, migrating is a one-line-per-target change, not a
  rewrite.
- electron-vite output defaults are `out/main`, `out/preload`, `out/renderer`
  (matches `package.json` `main: ./out/main/index.js`). Renderer `root` defaults
  to `src/renderer`.
- Norigin: `navigateByDirection(direction, focusDetails?)` is **async**;
  `pause()` stops all key handling while preserving focus, `resume()` restores it.
  `useFocusable()` returns `{ ref, focusKey, focusSelf, hasFocusedChild, … }`, and
  `focusSelf()` is memoised so it is safe in a dependency array. This repo splits
  the imports: hooks come from `@noriginmedia/norigin-spatial-navigation-react`
  (`useFocusable`), while `init`, `pause`, `resume`, `setFocus`,
  `getCurrentFocusKey`, `doesFocusableExist` and `navigateByDirection` come from
  `...-core`. The docs show both packages exporting them; keep the existing split
  so the renderer does not pull the React wrapper into main-process code.
- Zustand 5: `create<T>()(...)`; select one slice per call
  (`useLauncherStore(s => s.games)`) — never select the whole store object, and
  use `useShallow` if you must return an object literal.
- Zod 4: `z.object({...}).strict()` still rejects unknown keys, and
  `z.strictObject` survives `.pick()`/`.omit()`.
- Motion: `useReducedMotion()` from `motion/react`; `AnimatePresence` needs a
  stable `key` for the `exit` animation to run.
- Vitest: `restoreMocks: true` restores every `vi.spyOn` before each test, so a
  spy never leaks between tests — but it also means a spy set in `beforeAll`
  does not survive into the tests.

---

## 2. Ground rules

These are not preferences. Breaking them silently is the most common way to
regress this project.

1. **There is no git repository.** Nothing is committed; every edit is live.
   Never `git checkout` / `git restore` / `git clean` to "undo" — inspect the file
   and edit it. Treat unfamiliar code you did not write as someone's work: read
   it first, then change the smallest thing that satisfies the request.
2. **The reference clones are read-only.** `ps5-launcher-inspection-codex/`,
   `ps5-launcher-inspection-inkling-small/`, and the upstream Bloub checkout in
   `D:\Temp\User\opencode\bloub-original\` are for comparison only. Never edit
   them, never build from them, never copy a whole file out of them without
   reading the current version first.
3. **One accent colour.** The chrome uses `--pulse-accent: 210 55% 72%` (calm
   desaturated blue) through `lib/accent.ts` → `uiAccent(alpha)` /
   `accentAlpha()`. Artwork supplies colour variety. Do not add a second accent,
   do not re-tint the chrome per game, do not add decorative coloured glows.
4. **Lint baseline is 4 warnings, 0 errors.** The four are known and accepted:
   `hooks/use-in-view.ts` (set-state-in-effect), `components/ui/button.tsx` and
   `components/ui/badge.tsx` (only-export-components), `launcher/GameCard.tsx`
   (immutability on a ref). Any new warning or error is a regression. Do not
   "fix" the four as part of another task unless asked.
5. **Vitest only sees `*.test.ts`** (`vitest.config.mts`: `environment: 'node'`,
   `include: ['src/**/*.test.ts']`). `.test.tsx` is never collected. Renderer
   logic that deserves a test must be extracted into a plain module under
   `src/renderer/src/lib/` and tested there. React components are verified
   visually, not with a DOM test library.
6. **Ask before scope creep.** The user often asks for one narrow change
   ("remove the glow behind the logo — nothing else"). Deliver exactly that, then
   report what else you noticed without doing it.
7. **No remote URLs in the renderer.** Artwork reaches the UI through the main
   process and the `app://launcher/...` protocol. `will-navigate`,
   `setWindowOpenHandler`, and all permission handlers are denied in
   `main/index.ts`; keep them that way.
8. **Never put a raw `'` inside a single-quoted test title** - it breaks the oxc
   parse (`it('the launcher's face')` is a syntax error).

### 2.1 Traps that have already cost time

| Trap | What happens | Do this instead |
| --- | --- | --- |
| `morph` on a state whose first frame is mid-animation | the state plays **backwards** from its end (this is what broke `comet`) | set `morph: 0` and start the motion at `t = 0` |
| assuming `lookTarget` should point right | the upstream pose looks left because Bloub's settings panel is on the right | use `brandLook` for the mark; leave `lookTarget` alone |
| `document.visibilityState` after `Page.reload` | reads `hidden`, so screenshots are stale/blank | `Page.bringToFront` first |
| checking the music overlay with `document.visibilityState` | Chromium keeps reporting `visible` after the window is hidden | run `D:\Temp\User\opencode\overlay-state.ps1` (finds the 392×96 Win32 window) |
| screenshotting a minimised window | CSS transitions and the RAF loop freeze | restore the window (`restore-launcher.ps1`) before measuring |
| adding an icon from `lucide-react` | not a dependency; `components.json` lies about it | import from `@mingcute/react` |
| a new setting with only two of the three places | it silently resets on restart | `Settings`, `DEFAULT_SETTINGS`, `SettingsFieldsSchema` |
| a focus key built from a list index | focus jumps to the wrong card when the library reorders | stable ids (`<rowId>-<gameId>`) |
| a `useMemo` gaze script that changes identity each render | the mark replays its arrival spin constantly | keep the script stable (`useMemo` with `[]`) |
| calling `playUI` before any gesture | silence - the AudioContext is not unlocked yet | expect silence on a cold start; unlock happens on first pointer/key |
| `setState` in an effect to mirror a prop | lint warning + a cascading render | derive during render, or update from the event |

---

## 3. Repository map

Root: `.gitignore`, `.oxlintrc.json`, `AGENTS.md`, `components.json`,
`electron-builder.yml`, `electron.vite.config.ts`, `package.json`,
`package-lock.json`, `PLAN.md`, `README.md`, `tsconfig.json`,
`tsconfig.app.json`, `tsconfig.node.json`, `vitest.config.mts`, plus generated
`out/` and `release/` and the two read-only reference clones.

`docs/` holds written reviews, not code — currently `design-review.md` (Arabic,
read-only design audit; it describes problems, it does not fix them). The Bloub
reference plate (`states.png`) lives in the upstream clone under
`D:\Temp\User\opencode\bloub-original\docs\`.

```text
src/
  main/                        Electron main process (Node)
    index.ts                901  app lifecycle, window, 39 IPC handlers, tray, startup scan
    store.ts                214  AppStore: settings file + history, validated writes
    persisted-state.ts      239  Zod schemas, SETTINGS/CATALOG schema versions, migrations
    artwork.ts              366  ArtworkService: Steam CDN, Epic, SteamGridDB, fallback
    game-control.ts         206  GameControlService: focus/close/force-close + grace
    game-processes.ts       179  Windows process sampling → running matches
    process-watcher.ts      149  GameProcessWatcher polling loop (survives hiding)
    library-browser.ts      178  directory listing for the in-app file picker
    launch.ts               102  launchGame(): steam://, com.epicgames://, exe, lnk
    protocol.ts             214  app:// scheme, Range audio streaming, artwork serving
    window-mode.ts           94  windowed / fullscreen / kiosk application
    fs-utils.ts              85  readJsonFile, writeJsonFileAtomic, backupFile
    catalog/
      index.ts              557  CatalogService: cache, refresh, running, stale, favorites
      steam.ts              166  libraryfolders.vdf + appmanifest_*.acf
      epic.ts               149  .item manifests + launch URI
      start-menu.ts         122  PowerShell shortcut resolution
      manual.ts              63  manual game id, artwork limits, record conversion
      merge.ts               57  dedupe + source precedence
      source-scan.ts         66  per-source timeout/progress/error wrapper
      vdf.ts                126  Valve KeyValues parser
      demo.ts                67  demo library (LAUNCHER_DEMO)
    music/
      library.ts           422  MusicLibraryService: folder scan, tags, covers, cache
      overlay.ts           238  MusicOverlay: always-on-top card, shortcut, show/dismiss
      demo.ts              162  four audible WAV fixtures + SVG covers (LAUNCHER_DEMO)
      config.ts             81  MusicConfigStore: music/config.json, validated writes
      types.ts              28  main-only stored track + library file shapes
      online/                   legal catalog adapters, ranking, token proxy service
      youtube/                  YouTube API/yt-dlp search, MP3 extraction, tools, cache
    paths.ts                 37  userData paths, resolveResourcePath, sanitizeFileToken
    game-window.ts          122  focus/close a running game's window (PowerShell)
    auto-return.ts           56  "return after game" state machine
    epic-uri.ts              52  isValidEpicLaunchUri
    http-body.ts             31  readBodyWithLimit
    logger.ts                 5  electron-log setup (`export { log }`)
  preload/
    index.ts                122  contextBridge → window.launcher (typed by LauncherApi)
  shared/                     imported by BOTH processes — must stay pure
    types.ts                448  every cross-process type + DEFAULT_SETTINGS
    ipc.ts                   42  39 channel names, `IPC` const + `IpcChannel`
    library.ts              105  sorts, filterGames, sortGames, recents, favorites
    run-state.ts             30  runAssurance / describeRunEvidence
    format.ts                48  sourceLabel, formatBytes, formatLastPlayed, hashString, accentFor
    game-control.ts           8  FORCE_QUIT_GRACE_MS = 5_000
  renderer/
    index.html               15  lang=en, class=dark, #root, theme-color #050508
    public/favicon.svg, public/icons.svg
    src/
      main.tsx               25  React root, Norigin init(), `#/overlay` branch
      App.tsx              1360  shell: store wiring, shortcuts, gamepad, boot, page branches
      index.css             172  Tailwind 4 layers, tokens, reduced-motion, cursor-hidden
      env.d.ts                8  `declare global { interface Window { launcher: LauncherApi } }`
      store/launcher.ts     181  Zustand store (games, settings, status, selection, scans)
      store/music.ts         84  music library/scan counters + overlay settings
      hooks/
        use-artwork.ts       69  useArtwork(gameId, kind) + invalidateArtwork
        use-clock.ts         31  useClock(intervalMs), useAutoHideCursor(ms)
        use-gamepad.ts       65  polling loop → onConfirm/onBack/onMenu + navigateByDirection
        use-in-view.ts       28  useInView<T>(options)
        use-music-engine.ts  68  library/overlay ↔ engine bridge (publish state, apply commands)
        use-ui-sounds.ts     95  delegated pointer/key listeners → playUI
      lib/                     pure logic + ALL renderer tests
        game-actions.ts     110  GameActionState machine for launch/focus/close/force-quit
        mark-mood.ts         89  markMoodFor(): launcher state → Bloub state+expression
        music-engine.ts     240  singleton HTMLAudioElement: queue, volume, repeat, shuffle
        music-queue.ts       68  pure queue/filter/progress helpers (+18 tests)
        boot.ts              68  BootPhase, timings, per-phase Bloub montages, still frames
        ui-sfx.ts            76  uisfx player: unlockUISounds, playUI, applyUISoundEnabled
        attention.ts         40  hover/focus/launch bus for the header mark
        flight.ts            36  measureFlight(): splash box → header mark box
        accent.ts            22  DEFAULT_ACCENT, uiAccent, accentAlpha, initialsFor
        motion.ts             8  prefersReducedMotion()
        utils.ts              1  `export { cn } from "cn"`
      components/
        bloub/                   vendored MIT engine — see §7.4
          bot/                   15-state, 16-expression, 8-shape, 13-colour catalogue
          react/BloubBot.tsx  468  React client (forwardRef handle: seek/rendAt/sample/svg)
          gaze.ts             180  lookTarget (upstream, looks LEFT) + brandLook (ours)
          index.ts             62  the package's public surface
        launcher/               one file per screen/region
          SettingsPage.tsx    956
          AddGamePage.tsx     733
          GameDetailsPage.tsx 680
          MusicPage.tsx      1692
          BootScreen.tsx      437
          Hero.tsx            425
          SearchPage.tsx      272
          TopBar.tsx          213
          MusicOverlay.tsx    312
          BrandMark.tsx       189
          PowerMenu.tsx       186
          GameCard.tsx        166
          GameRow.tsx         130  + SortControl
          HintBar.tsx          74
          EmptyLibrary.tsx     70
          Backdrop.tsx         46
          LibraryLoading.tsx   35
        ui/                     shadcn primitives on Base UI: badge, button, card,
                                dialog, empty, input, kbd (Kbd/KbdGroup), label,
                                scroll-area, separator, skeleton, sonner (Toaster),
                                spinner, switch, tooltip
  scripts/generate-icon.ps1     4853  regenerates build/icon.ico
  resources/                    copied next to the app (extraResources)
    game-window.ps1          4730  focus/close/query a game window via Win32
    process-snapshot.ps1     1103  process list for running detection
    resolve-shortcuts.ps1    1031  .lnk target resolution
build/icon.ico                 37403  electron-builder icon
```

`App.tsx` is intentionally a shell: every page branch (`searchOpen`, `addOpen`,
`detailsGame`, `settingsOpen`, `musicOpen`, `powerOpen`, loading, empty, library)
lives there. `main.tsx` sends `#/overlay` to `MusicOverlay` before launcher boot.
New screens go in `components/launcher/`, new logic goes in `lib/`, and
`App.tsx` only wires them.

### 3.1 Component contracts (props exactly as declared)

Every page component is **controlled**: no component reads the Zustand store
except `SettingsPage` (which owns its form state) and the music surfaces
(`MusicPage`, `MusicOverlay`), which read the music store and engine.
`App.tsx` passes data and callbacks down.

| Component | Props |
| --- | --- |
| `TopBar` | `demo, title, reducedMotion, markVisible, markMood, refreshing, scanProgress, staleSources, showTools, onRefresh, onAddGame, onOpenMusic, onOpenSettings, onOpenPower` |
| `Hero` | `game, pending, reducedMotion, action, forceRemainingMs, onLaunch, onFocus, onClose, onForceQuit, onCancelForce, onToggleFavorite, onDetails` |
| `GameRow` | `rowId, title, games, onSelect, onLaunch, action?, upTarget?` (+ exported `SortControl({sort, onPress})`) |
| `GameCard` | `game, focusKey, onSelect, onLaunch, onActivate?, onArrowPress?` |
| `GameDetailsPage` | `game, pending, action, draft, saving, removing, onDraftChange, onSave, onRemove, onBack, onLaunch, onToggleFavorite, onPickExecutable, onPickArtwork` (+ `GameDetailsDraft`) |
| `AddGamePage` | `onBack, onAdded?, mode?: 'game'\|'path'\|'image', onPicked?` |
| `SearchPage` | `games, query, onQueryChange, onBack, onSelect, onLaunch` |
| `SettingsPage` | `onBack, onAddGame` — reads the store |
| `MusicPage` | `onBack` — reads the music store and engine |
| `MusicOverlay` | — (receives playback over IPC) |
| `PowerMenu` | `onClose, onHide, onQuit` |
| `EmptyLibrary` | `error, onRefresh, onAddGame` |
| `LibraryLoading` | `scanning` |
| `HintBar` | `gameCount` |
| `Backdrop` | `game, reducedMotion` |
| `BrandMark` | `reducedMotion, visible?, mood` |
| `BootScreen` | `phase, gameCount, error, reducedMotion, onDone` |

Focus keys are string constants, never derived from array indices:

- header tools: `tool-refresh`, `tool-add`, `tool-music`, `tool-settings`, `tool-power`;
- settings: `settings-back|refresh|add|shortcuts|api-key|key-toggle|key-save|cursor|return|sounds|logs`,
  plus `settings-remove-<gameId>`, `settings-motion-<value>`, `settings-window-<value>`;
- add page: `add-back|up|confirm|cancel`, `add-place-<id>`, `add-entry-<index>`;
- details: `details-back|primary|favorite|…`;
- search: `search-input`, `search-back`, `search-result-<gameId>`;
- music: `music-back|filter|add-folder|rescan|overlay-preview|overlay-switch|play|previous|next|repeat|shuffle|volume|seek`,
  plus `music-track-<trackId>`;
- rows/cards: `row-<rowId>` for a row container and **`<rowId>-<gameId>`** for a card
  (built in `App.tsx`, e.g. `continue-cyberpunk-2077`); the sort pill is `sort-all`.

A card is selected on **focus** (`onFocus` → `onSelect`), so moving the ring with
the arrows updates the hero and the header mark without a click.

### 3.2 Where to change what

| To change... | Touch |
| --- | --- |
| a screen's layout or copy | the matching file in `components/launcher/` |
| library ordering, recents, favourites | `shared/library.ts` (pure, tested) |
| the header mark's face or reactions | `lib/mark-mood.ts` (mood) and `lib/attention.ts` (reactions), then `BrandMark.tsx` |
| boot timing, montage, still frames | `lib/boot.ts` only; `BootScreen.tsx` reads it |
| the splash → header hand-off | `lib/flight.ts` (measurement) + `BootScreen.tsx` (the flying square) + `App.tsx` (`bootDone` / `revealed`) |
| a keyboard shortcut | `App.tsx` `onKeyDown`, and `HintBar.tsx` to advertise it |
| gamepad mapping | `hooks/use-gamepad.ts` |
| the music library scan, tags, covers | `main/music/library.ts` |
| the music queue and playback prefs | `lib/music-queue.ts` + `lib/music-engine.ts` |
| the overlay window, shortcut, position | `main/music/overlay.ts` + `main/music/config.ts` |
| the music page or overlay card | `components/launcher/MusicPage.tsx` / `MusicOverlay.tsx` |
| a settings row | `SettingsPage.tsx` + the three settings places in §7.9 |
| scan behaviour, cache age, per-source timeout | `main/catalog/index.ts` |
| how a game is launched | `main/launch.ts` |
| how "running" is detected | `main/game-processes.ts` + `main/process-watcher.ts` |
| windowed / fullscreen / kiosk | `main/window-mode.ts` + `main/index.ts` `setWindowMode` |
| the accent or design tokens | `index.css` (`:root` / `.dark`) + `lib/accent.ts` |
| a Bloub state or its timing | `components/bloub/bot/states.ts`; add a test in `lib/` if the shape of the motion matters |

---

## 4. Commands

```powershell
npm install            # first time
npm run dev            # Vite + Electron with hot reload (renderer on :5173)
npm start              # build, then run the production preview
npm run typecheck      # tsc -p tsconfig.node.json AND -p tsconfig.app.json
npm run lint           # oxlint src
npm test               # vitest run (37 files / 379 tests)
npm run test:watch     # vitest watch
npm run design:check   # static visual census, warns (--strict fails)
npm run build          # typecheck + electron-vite build → out/
npm run pack           # build + unpacked app in release/win-unpacked
npm run dist           # build + NSIS installer in release/
npm run icon           # regenerate build/icon.ico from scripts/generate-icon.ps1
```

If the Electron binary is missing after install:
`node node_modules\electron\install.js`.

### 4.1 Toolchain configs, as they are

- `.oxlintrc.json` — plugins `["react", "typescript", "oxc"]`;
  `react/rules-of-hooks: error`; `react/only-export-components: warn` with
  `allowConstantExport: true`.
- `tsconfig.node.json` — target/lib ES2023, `types: ["node"]`, `module: esnext`,
  `moduleResolution: bundler`, `verbatimModuleSyntax`, `erasableSyntaxOnly`,
  `strict` + `noUnusedLocals` + `noUnusedParameters` +
  `noUncheckedIndexedAccess` + `noFallthroughCasesInSwitch`; includes
  `electron.vite.config.ts`, `vitest.config.mts`, `src/main`, `src/preload`,
  `src/shared`.
- `tsconfig.app.json` — same strict flags plus `lib: ES2023 + DOM`,
  `types: ["vite/client"]`; includes `src/renderer/src`, `src/shared`.
- `tsconfig.json` — `files: []` + project references; solution file only.
- `vitest.config.mts` — aliases `@shared`, `@main`, `@`; node environment;
  `restoreMocks: true`.
- `electron.vite.config.ts` — three targets. `main` and `preload` use
  `externalizeDepsPlugin()` and the `@shared` (+ `@main` for main) aliases;
  `renderer` has `root: src/renderer`, aliases `@shared` and `@` →
  `src/renderer/src`, plugins `react()` + `tailwindcss()`, dev port **5173**
  with `strictPort`, input `src/renderer/index.html`.
- `electron-builder.yml` — see §11.

---

## 5. Definition of done

Every change — a one-line CSS tweak included — closes with:

```powershell
npm test          # must stay green (currently 379 tests / 37 files)
npm run typecheck # must be silent
npm run lint      # must stay at 4 warnings / 0 errors
npm run build     # must succeed
```

Visible UI changes also get a **visual check on the real app** (§12), because the
test suite cannot see layout, timing, or motion.

Ship an installer only when the user asks, or when a feature is finished:

```powershell
npm run dist
Get-FileHash release\Pulse-Launcher-0.1.0-x64.exe -Algorithm SHA256
```

Report size, SHA-256, and whether the packaged build was smoke-tested. Then stop
every Electron process you started (§13).

---

## 6. Code conventions

- **TypeScript strictness is real.** `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`. Indexed access needs `!` or a guard; type-only imports
  must use `import type`; no enums/namespaces (`erasableSyntaxOnly`).
- **Aliases**: `@/*` → `src/renderer/src/*`, `@shared/*` → `src/shared/*`,
  `@main/*` → `src/main/*` (main only).
- **`src/shared` must stay free of `electron`, `node:*`, and DOM APIs.** It is
  bundled into both processes and must stay pure data + pure functions.
- **Comments explain why, never what.** House style (inherited from the engine)
  documents the reason a constant has its value, or the bug a guard prevents.
  Same for test titles.
- **No magic numbers in timing code.** Boot, launch, auto-return, grace, and
  polling durations are named exports with a comment: `lib/boot.ts`,
  `shared/game-control.ts`, `main/catalog/index.ts`, `lib/mark-mood.ts`.
- **Components stay small.** Presentation in `components/`, decisions in `lib/`
  as pure functions, state in the Zustand store, `App.tsx` wires.
- **Strings are English** in the UI; the product is English-only today.
- **Accessibility**: interactive elements keep `aria-label`s, focus rings come
  from the accent, and every animation has a reduced-motion branch
  (`lib/motion.ts`, the `reducedMotion` prop, or `useReducedMotion`).
- **Icons** come from `@mingcute/react`; no hand-drawn SVG icons in new UI.
- **Class names**: Tailwind 4 utilities with arbitrary values where the design
  needs exact numbers (`w-[min(68vmin,46rem)]`). `cn()` from `lib/utils.ts` for
  conditionals. No CSS modules, no styled-components.

---

## 7. Architecture

### 7.1 Process boundary

The renderer reaches the main process only through `window.launcher`, exposed by
`preload/index.ts` with `contextBridge` and typed by `LauncherApi`
(`shared/types.ts`) with the global declared in `renderer/src/env.d.ts`.
`main/index.ts` validates every payload with Zod and checks
`assertTrustedSender` / `assertMusicSender` (only `app://launcher/...` or the
dev origin, and only the launcher or music-overlay `webContents`).

Adding an IPC call touches **four** places:

1. `shared/ipc.ts` — channel name in `IPC`.
2. `shared/types.ts` — payload/response types in `LauncherApi`.
3. `preload/index.ts` — the thin `ipcRenderer.invoke` / `subscribe` wrapper.
4. `main/index.ts` — `ipcMain.handle` (or a `send` in `catalog.setListeners`) plus
   a Zod schema.

### 7.2 The 39 channels

| Channel (`IPC.*`) | String | Direction | Payload → Response |
| --- | --- | --- | --- |
| `catalogList` | `catalog:list` | invoke | — → `GameSummary[]` |
| `catalogRefresh` | `catalog:refresh` | invoke | — → `ScanResult` |
| `catalogArtwork` | `catalog:artwork` | invoke | `{gameId, kind}` → `ArtworkResult` |
| `catalogToggleFavorite` | `catalog:toggle-favorite` | invoke | `{gameId}` → `FavoriteResult` |
| `catalogStaleSources` | `catalog:stale-sources` | invoke | — → `GameSource[]` |
| `catalogChanged` | `catalog:changed` | push | `GameSummary[]` |
| `catalogRunningChanged` | `catalog:running-changed` | push | `RunningGameInfo[]` |
| `catalogScanProgress` | `catalog:scan-progress` | push | `ScanProgress` |
| `catalogStaleChanged` | `catalog:stale-changed` | push | `GameSource[]` |
| `launchGame` | `launch:game` | invoke | `{gameId}` → `LaunchResult` |
| `gameFocus` | `game:focus` | invoke | `{gameId}` → `GameControlResult` |
| `gameClose` | `game:close` | invoke | `{gameId}` → `GameControlResult` |
| `gameForceClose` | `game:force-close` | invoke | `{gameId, confirm}` → `GameControlResult` |
| `settingsGet` | `settings:get` | invoke | — → `Settings` |
| `settingsUpdate` | `settings:update` | invoke | `SettingsUpdate` → `Settings` |
| `settingsRemoveManual` | `settings:remove-manual` | invoke | `{gameId}` → `RemoveManualResult` |
| `settingsChanged` | `settings:changed` | push | `Settings` |
| `libraryRoots` | `library:roots` | invoke | — → `PickerRoots` |
| `libraryList` | `library:list` | invoke | `{path, kind}` → `DirectoryListing` |
| `libraryAdd` | `library:add` | invoke | `{path}` → `AddManualResult` |
| `libraryUpdate` | `library:update` | invoke | `UpdateManualGameInput` → `UpdateManualResult` |
| `selectionGet` | `selection:get` | invoke | — → `string \| null` |
| `selectionSet` | `selection:set` | invoke | `{gameId}` → `SelectionResult` |
| `appInfo` | `app:info` | invoke | — → `AppInfo` |
| `appHide` | `app:hide` | invoke | — → `void` |
| `appQuit` | `app:quit` | invoke | — → `void` |
| `appOpenLogs` | `app:open-logs` | invoke | — → `void` |
| `musicList` | `music:list` | invoke | — → `MusicLibrarySnapshot` |
| `musicRescan` | `music:rescan` | invoke | — → `MusicLibrarySnapshot` |
| `musicAddFolder` | `music:add-folder` | invoke | — → `MusicLibrarySnapshot` |
| `musicRemoveFolder` | `music:remove-folder` | invoke | `{folder}` → `MusicLibrarySnapshot` |
| `musicChanged` | `music:changed` | push | `MusicLibrarySnapshot` |
| `musicOverlayGet` | `music:overlay-get` | invoke | — → `MusicOverlaySettings` |
| `musicOverlayUpdate` | `music:overlay-update` | invoke | `Partial<MusicOverlaySettings>` → `MusicOverlaySettings` |
| `musicOverlayToggle` | `music:overlay-toggle` | invoke | — → `boolean` |
| `musicOverlayStateGet` | `music:overlay-state-get` | invoke | — → `MusicOverlayState \| null` |
| `musicOverlayState` | `music:overlay-state` | both | `MusicOverlayState` |
| `musicOverlayCommand` | `music:overlay-command` | push | `MusicCommand` |
| `musicOverlayAction` | `music:overlay-action` | push | `MusicOverlayAction` |

`window.launcher` mirrors this as
`catalog.{list, staleSources, refresh, artwork, toggleFavorite, onChanged, onRunningChanged, onScanProgress, onStaleChanged}`,
`launch(gameId)`, `game.{focus, close, forceClose}`, `settings.{get, update, removeManual, onChanged}`,
`library.{roots, list, add, update}`, `selection.{get, set}`,
`app.{info, hide, quit, openLogs}`,
`music.{list, rescan, addFolder, removeFolder, onChanged, action}`,
`music.overlay.{get, update, toggle, state, publish, onCommand, onState}`.
Every `on*` returns an unsubscribe function.

### 7.3 Renderer state

`store/launcher.ts` — one Zustand store, `create<LauncherState>()`:

- state: `games`, `settings`, `selectedId`, `status` (`loading | ready | error`),
  `error`, `refreshing`, `staleSources`, `scanProgress`.
- actions: `initialize`, `refresh`, `select`, `receiveGames`, `receiveRunning`,
  `receiveScanProgress`, `receiveStaleSources`, `setSettings`, `updateSettings`.
- `initialize()` loads settings + catalog + stale sources + stored selection in
  one `Promise.all`, then sets `ready`; an empty library triggers `refresh()`
  automatically (`refreshing: true`).
- `pickSelection()` prefers the current selection → a running game → the most
  recently played → `games[0]` → `null`.
- Selection writes are coalesced by `SELECTION_SAVE_DELAY_MS = 400` and flushed
  on `pagehide`, because a hidden launcher can be quit from the tray.
- `selected` is derived in `App.tsx` (`games.find(g => g.id === selectedId) ?? games[0]`),
  never stored.

`store/music.ts` is separate: library, folders, scan counters, and overlay
settings, initialised once and kept current by `music:changed`. The audio engine
is not a store — it is a module singleton read with `useSyncExternalStore`.

`App.tsx` keeps only ephemeral UI state: which overlay is open
(`settingsOpen`, `addOpen` + `addMode`, `detailsOpen`, `searchOpen` + `searchQuery`,
`musicOpen`, `powerOpen`), the details snapshot and draft, `pendingLaunch`, `gameAction` +
`actionClock`, `demo`, `bootDone`, `revealed`, and focus bookkeeping refs
(`lastFocusKey`, `pendingFocusGame`, `searchReturnFocus`, `detailsReturnFocus`,
`initialFocusDone`, `emptyFocusDone`). Everything else is derived with `useMemo`
(`runningGames`, `continueGames`, `favoriteList`, `sortedGames`, `rows`,
`selected`, `detailsGame`, `initialFocusKey`) - do not add a second copy of
catalog data to component state.

`detailsGame` deliberately follows the game **by id** with the snapshot as a
fallback: saving a manual game can change its id, and without the fallback the
details page would blank for a frame.

### 7.4 Bloub (the avatar engine)

`components/bloub/` is vendored verbatim from the MIT upstream
(`LICENSE` inside), with two local additions: `brandLook` in `gaze.ts` and the
`brume` colour in `bot/skins.ts`.

Catalogue counts (all in `bot/`): **15 states**, **16 expressions**, **8 shapes**,
**13 colours**.

- States: `idle 2.4s`, `thinking 2.6`, `wink 1.6`, `wide 1.8`, `alert 2.4`,
  `notify 2.2`, `exclaim 2.0`, `sleep 2.4`, `egg 1.8`, `hexagon 1.6`, `play 2.0`,
  `orbit 3.4` (min 2.5), `swirl 1.3` (transition, outside `SEQUENCE`),
  `burst 2.6` (min 2.4), `comet 2.4` (min 2.4).
- Expressions: `neutre attentif surpris excite heureux hilare colere triste
  effraye mefiant confus curieux fier timide blase somnolent`.
- Shapes: `cercle galet squircle capsule triangle hexagone nuage goutte`.
- Colours: `encre #0a0a0c, brun #8b5e3c, rouge #e8483f, orange #f08a24,
  ambre #f0b429, vert #3ecf8e, turquoise #2fbfa0, bleu #3b93f0, violet #8b5cf6,
  rose #e152b0, gris #a3a3a3, brume #a8c6e8, creme #f1efe9`. **`brume` is ours** —
  Pulse's tint.

Rules that matter:

- `bot/` is a **framework-free, pure-time engine**: `engine.sample(t)` is a pure
  function of time; external input enters through timestamped setters
  (`setState(id, now)`, `setLook(look, now)`, `setShape`, `setExpression`) — never
  a variable read during `sample`. The replay/export path depends on this.
- `react/BloubBot.tsx` is only a client (`forwardRef` handle with `seek`,
  `rendAt`, `sample`, `svg`). No engine logic there.
- A state's `morph` blends from the previous state into that state's frame at
  `t = 0`. **If a state's first frame is already mid-animation, `morph` must be
  `0`**, or the state plays backwards from its end — exactly what once broke
  `comet` (it opened with its own tail). `comet` now has `morph: 0`, holds the
  whole ball for 0.2 s, collapses to the dot, throws the ribbons, then regrows
  with the eyes opening at ~2.45 s.
- `minDurationOf(state)` (`bot/cycles.ts`) is the floor a block may not go under,
  derived from the longest `morph` — shorter blocks get cut before the blend out.
- `POSES` maps each state to its most readable local time (thumbnails, still
  frames). `POSES.comet = 1.15`, `POSES.swirl = 0.5`.
- `gaze.ts`: `lookTarget` is upstream and targets **left** (the original app's
  settings panel sits on the right). `brandLook` is ours and sits on `REST_GAZE`
  (`yaw 28.49, pitch 28.62, roll -13`) so the logo's eyes read **up and to the
  right**, matching the upstream `docs/states.png`. **Do not "fix" `lookTarget`.**
- `MAX_BLOCS` (200) / `MAX_CYCLES` (50) / `MAX_BLOCK` (10 s) are storage guards
  against hostile JSON, not product limits.
- The header mark is 64 px but the engine's viewBox reserves room for the orbit
  rings (`RAYON = 100`, `DEMI_VIEWBOX = 158`), so the ball reads ~63 % of the box.
  Enlarging the component enlarges the ball proportionally; do not shrink the
  viewBox to "fill" it — rings would clip.

### 7.5 The header mark

`BrandMark.tsx` + `lib/mark-mood.ts` + `lib/attention.ts`.

`markMoodFor(ctx)` is a pure precedence chain:
`error → alert/triste` · `pending → burst/excite` ·
`loading || refreshing → thinking/attentif` · `running → play/excite` ·
`no selection → sleep/somnolent` · `favorite → notify/heureux` ·
otherwise `signatureFor(seed)` — an FNV-1a hash of the game id into 8 faces, all
of which keep the round silhouette (`idle`, `wink`, `wide`, `notify` only).

Momentary reactions travel on the `attention.ts` bus:
covers, hero actions, and header tools call
`announceAttention('hover' | 'focus' | 'launch')`; the mark answers with
`wink`/`wide`/`burst` for `REACTION_BY_KIND[kind].hold` ms, then falls back to its
mood. `App.tsx` also announces `'launch'` from `handleLaunch`.

The mark's box carries `data-mark-slot` — the boot hand-off measures it
(`lib/flight.ts`, `MARK_SLOT`). It is always in layout during boot; only its paint
is held back (`visible` prop), so the flight has a target without two balls on
screen.

### 7.6 Boot sequence

`lib/boot.ts` owns everything:

- phases `scan | ready | error` via `bootPhaseFor(status)`;
- `BOOT_INTRO_MS 700` (minimum dwell before promoting the phase),
  `BOOT_READY_HOLD_MS 2400` (the whole `comet`), `BOOT_ERROR_HOLD_MS 1700`,
  `BOOT_EXIT_MS 560` (the crossing);
- `BOOT_CYCLES` — `scan`: swirl 1.3 / thinking 2.6 / comet 2.4 / orbit 3.4;
  `ready`: comet 2.4 / idle 2.4; `error`: alert 2.4 / exclaim 2.0. Every duration
  is ≥ `minDurationOf(state)` (asserted in `lib/boot.test.ts`);
- `BOOT_STILL_STATE` / `BOOT_STILL_AT` — one readable frame per phase for reduced
  motion.

`BootScreen.tsx` renders the overlay and the hand-off. When `comet` finishes the
ball is whole again; that frame (`HANDOFF_AT = 2.4`) is measured from the splash
square to `[data-mark-slot]` and flown there over `BOOT_EXIT_MS`. `App.tsx` then
reveals the header on `bootDone`, and the library + hint bar 180 ms later on
`revealed`. Input (keyboard, gamepad, spatial navigation via `pause()`) stays
frozen until the crossing completes. Reduced motion skips the crossing and
renders a still frame.

### 7.7 Library, launch, running state

Rows are composed in `App.tsx` (`rows` memo), in this order, and each only
appears when non-empty:

| `rowId` | Title | Source |
| --- | --- | --- |
| `running` | Running Now | `games.filter(g => g.running)`, sorted by name |
| `continue` | Continue Playing | `recentlyPlayed(games)`, capped by `CONTINUE_PLAYING_LIMIT = 8` |
| `favorites` | Favorites | `favoriteGames(games)` |
| `all` | All Games | `sortGames(games, settings.librarySort)` |
| `steam` / `epic` / `local` | Steam / Epic Games / Local & Desktop | only when the library spans more than one `source` |

- `shared/library.ts` decides order (`LIBRARY_SORTS`, `sortGames`,
  `CONTINUE_PLAYING_LIMIT = 8`, `recentlyPlayed`, `favoriteGames`).
- `lib/game-actions.ts` is the UI-side state machine for
  launch / bring-to-front / close / force-quit, with `FORCE_QUIT_GRACE_MS = 5000`
  from `shared/game-control.ts`.
- `main/process-watcher.ts` samples processes; `main/game-processes.ts` matches
  them by executable, install directory, then name
  (`ProcessMatchConfidence = 'exact' | 'directory' | 'name'`), flagging
  `ambiguous` when several games match. `shared/run-state.ts` turns that into
  `confirmed` / `probable` for the UI.
- `main/auto-return.ts`: Pulse hides when a launch is accepted and returns once
  the game was seen running and every tracked game has exited — only when
  `settings.returnAfterGame` is true.
- A launch that never produces a running process is dropped after
  `LAUNCH_DETECT_TIMEOUT_MS = 60_000` (`App.tsx`), so the button does not spin
  forever.
- Destructive actions are two-step, not modal: `PowerMenu`'s quit arms for
  `QUIT_CONFIRM_MS = 3_000` and `GameDetailsPage`'s remove for
  `REMOVE_CONFIRM_MS = 3_000`; the label changes and a second press commits.
- The Start Menu source is scanned **only** when `settings.showStartMenuApps` is
  true (`main/catalog/index.ts`); turning it off removes those games on the next
  refresh without touching the others.

### 7.8 Artwork

`main/artwork.ts` fetches and caches (Steam CDN, Epic thumbnails, optional
SteamGridDB with the user's key, generated fallback). The renderer asks for
`(gameId, kind)` and receives an `app://` URL through `use-artwork.ts`. A
user-chosen cover is copied under a name hashing source path + size + mtime, so a
replacement is never served stale. `MAX_ARTWORK_BYTES = 20 MB`.

### 7.9 Settings and persistence

Everything lives in `userData` (`%APPDATA%\Pulse Launcher\`):
`settings.json`, `history.json`, `cache/catalog.json`, `artwork/<game-id>/`,
`music/library.json`, `music/config.json`, `music/artwork/<file>`,
`logs/main.log`. `LAUNCHER_USER_DATA` overrides the directory (QA uses this).

`settings.json` is `{ version, settings, manualGames, favorites, lastSelectedId }`
with `SETTINGS_SCHEMA_VERSION = 1`; the catalog cache is
`CATALOG_SCHEMA_VERSION = 2`. Migrations live in `main/persisted-state.ts`
(`migrateToCurrent`), and unreadable files are backed up rather than deleted.

`Settings` = `{ showStartMenuApps, steamGridDbApiKey, hideCursorAfterMs, motion,
windowMode, returnAfterGame, librarySort, uiSounds }`.
`DEFAULT_SETTINGS` = `{ showStartMenuApps: false, steamGridDbApiKey: '',
hideCursorAfterMs: 2500, motion: 'system', windowMode: 'fullscreen',
returnAfterGame: true, librarySort: 'title', uiSounds: true }`.

**A new user-visible preference needs all three**: the `Settings` interface, the
`DEFAULT_SETTINGS` entry, and the Zod field in `SettingsFieldsSchema` — otherwise
it silently resets on restart. `SettingsUpdateSchema` in `main/index.ts` is
`.strict()` (unknown keys are rejected) and bounds `hideCursorAfterMs` to
500 – 60 000.

### 7.10 Music

The player is a built-in app with four tabs: **All** (the default, one search
across every source with filter chips), **Library** (local files), **Online**
(five keyless legal catalogs), and **YouTube** (search plus on-demand MP3
extraction). All four share the same page, engine, queue, Now Playing panel, and
overlay. The upstream Liner backend is not used.

- `main/music/library.ts` walks the folders the user picked (mp3, m4a, m4b, aac,
  flac, ogg/oga, opus, wav, wma; depth 8, 8 000 tracks, 250 MB/file, four
  concurrent tag reads). Tags and embedded covers come from `music-metadata`
  v12, imported dynamically because it is ESM-only while the main bundle is CJS.
  Results are cached in `music/library.json`; covers are written to
  `music/artwork/`. Unreadable files are skipped, never fatal.
- Audio is not sent over IPC. Each track gets `app://launcher/media/<trackId>`,
  served by `main/protocol.ts` with single-range 206/416 responses so seeking
  works; covers use `app://launcher/music-art/<file>`. The renderer only ever
  holds those URLs, never a filesystem path.
- Online mode merges iTunes, Deezer, Audius, Openverse, and Internet Archive in
  `main/music/online/`. `providers.ts` adapts each catalog, `ranking.ts` filters
  junk versions and scores matches, and `service.ts` runs them concurrently and
  keeps a memory-only token map for remote audio/artwork, exposed as
  `app://launcher/online-media|online-art/<token>`. Nothing is downloaded.
- YouTube mode lives in `main/music/youtube/`. Search uses the YouTube Data API
  when a key is saved, otherwise yt-dlp `ytsearch`; the API path keeps the
  highest-resolution thumbnail from `snippet.thumbnails` (validated against
  YouTube image hosts), the real `channelTitle`, the exact duration from
  `videos.list`, and the original upload title alongside the parsed song title.
  Extraction runs official yt-dlp + FFmpeg and caches
  `music/youtube/<videoId>.mp3` with metadata in `music/youtube/index.json` and
  covers in `music/artwork/youtube-<id>.jpg`. Resolve is single-flight per video;
  search rows carry an empty `streamUrl` until the MP3 exists. Settings (API key,
  tool paths) live in `music/youtube.json`, not `Settings`. yt-dlp is
  auto-downloaded to `music/bin/`; FFmpeg is detected from
  configured/PATH/WinGet locations and must exist for MP3 output.
  Thumbnails use `app://launcher/youtube-art/<videoId>`; extracted audio uses
  `app://launcher/media/youtube:<videoId>`.
- `MusicPage` has Library/Online/YouTube tabs plus an inline YouTube setup panel.
  `lib/music-engine.ts` resolves YouTube tracks asynchronously under a generation
  guard, replaces the queue entry with the resolved track, and keeps the YouTube
  search results as the queue. Online and YouTube queues survive library rescans;
  choosing a local track switches back to the Library queue.
- `lib/music-queue.ts` is the pure queue/filter/progress layer (18 tests);
  `lib/music-engine.ts` is a singleton around one `HTMLAudioElement` and persists
  volume/repeat/shuffle under `pulse.music.prefs`. `hooks/use-music-engine.ts`
  mounts once in `App`, pushes the library into the engine, publishes playback
  to the overlay, and applies `MusicCommand`s coming back.
- `MusicPage` is `M` / `tool-music`; `MusicOverlay` is the `#/overlay` branch.
  The overlay is a frameless, transparent, always-on-top 392×96 window around a
  376×80 card, shown with `showInactive()` so it never steals focus. It loads
  `app://launcher/index.html#/overlay` (not `loadFile`, which would break the
  IPC origin check), re-asserts top every 1.5 s, and sits 24 px from the chosen
  edge.
- It appears when a track starts. Its close button dismisses it until the track
  changes; pausing/resuming the same track does **not** bring it back. The
  `Alt+Shift+M` global shortcut toggles it even while the launcher is hidden.
  Preferences live in `music/config.json` (not `Settings`): enabled,
  alwaysOnTop, position, shortcut.
- `LAUNCHER_DEMO=1` synthesises four audible WAV tones and SVG covers, so
  playback and artwork work offline with no user folders.

---

## 8. Keyboard and gamepad

`App.tsx` `onKeyDown` returns immediately while `!bootDone`, and ignores events
from `INPUT`/`TEXTAREA`/`SELECT`/contentEditable. With no overlay open:

| Key | Action |
| --- | --- |
| `Escape` | close the topmost layer: power → search → add → details → music → settings → else `app.hide()` |
| `Ctrl/Cmd+F`, `/` | search |
| `M` | music page |
| `Tab` / `Shift+Tab` | cycle the header tools + last focused card |
| `S` | settings |
| `P` | power menu |
| `R` | refresh library |
| `I` | details of the selected game |
| `F` | toggle favorite |
| `O` | cycle library sort |

`HintBar` advertises: Enter, S, `/`, F, O, P, Tab, R, Esc. The music overlay's
`Alt+Shift+M` is a global shortcut and works while Pulse is hidden, so it is
deliberately not advertised there.

Gamepad (`use-gamepad.ts`): polling loop with `DEADZONE 0.55`, `REPEAT_MS 150`,
calling `navigateByDirection` (async) and the confirm/back/menu handlers; it is
disabled until `bootDone`.

Spatial navigation: Norigin handles arrows/Enter. `pause()` / `resume()` freeze it
while the boot overlay is up. Every focusable needs a `useFocusable` with a
**unique, stable** `focusKey` — keys derived from list indices break when the
library reorders.

---

## 9. Tests

37 files / **379 tests**, all under `src/**/*.test.ts`, node environment.

- `src/main/` (27): `auto-return`, `catalog/{epic,index,manual,merge,source-scan,steam,vdf}`,
  `epic-uri`, `fs-utils`, `game-control`, `game-processes`, `game-window`,
  `http-body`, `launch`, `library-browser`, `music/online/{providers,ranking,service}`,
  `music/youtube/{api,cache,parse,ytdlp}`, `persisted-state`, `process-watcher`,
  `store`, `window-mode`.
- `src/renderer/src/lib/` (7): `attention`, `boot`, `brand-gaze`, `comet`,
  `game-actions`, `mark-mood`, `music-queue`.
- `src/shared/` (3): `format`, `library`, `run-state`.

Pattern: test the pure module, not the component. `store.test.ts` and
`catalog/index.test.ts` are the big ones (285 / 487 lines) and use temp
directories. `comet.test.ts` documents the backwards-playback bug — keep it.

---

## 10. Things that are deliberately the way they are

Do not "simplify" these without discussing it first:

- Escape / `Alt+F4` / the close button **hide** the launcher; quitting is an
  explicit action in Settings or the tray. A stray key press must never end a
  session.
- Kiosk mode is opt-in and still allows `Alt+Tab`; blocking it is out of scope.
- The renderer never loads remote images directly (`app://` + main-process fetch
  only).
- `uisfx` cues are synthesised; no audio files ship, and the AudioContext opens
  on the first real gesture — so **boot sounds are silent on a cold start**.
  That is intended.
- The Bloub engine is vendored. Patching it is allowed; "cleaning it up" is not.
- One accent, no per-game chrome tinting, no second glow colour, and the header
  mark has **no halo** (it was removed on request; only a thin hover ring and a
  click ripple remain).
- `lookTarget` looks left on purpose (§7.4).
- The music overlay's close button dismisses it for the current track only; a
  new track brings it back. This is intentional, not a missed show.
- Music has four tabs: the default **All** search over the local Library, the five
  keyless legal catalogs, and YouTube extraction through official yt-dlp, plus
  the per-source tabs. Keep remote URLs behind the `app://` proxy; do not load
  them directly in the renderer.

---

## 11. Packaging

`electron-builder.yml`:

- `appId com.pulse.launcher`, `productName Pulse Launcher`, `asar: true`,
  `compression: maximum`, output `release/`, build resources `build/`.
- `extraResources`: `resources/` → `resources/` (the three PowerShell helpers are
  read at runtime via `resolveResourcePath`).
- Windows target: **nsis x64**, icon `build/icon.ico`,
  `executableName: PulseLauncher`, `requestedExecutionLevel: asInvoker`,
  `artifactName: Pulse-Launcher-${version}-${arch}.${ext}`.
- NSIS: `oneClick: false`, `perMachine: false`, elevation allowed, directory
  selectable, desktop shortcut always, start-menu shortcut, `deleteAppDataOnUninstall: false`.
- Excluded from the package: `src`, `scripts`, `resources` (the source copy),
  `build`, `docs`, `release`, config files, README/PLAN, source maps.

Result: `release\Pulse-Launcher-0.1.0-x64.exe` plus `release\win-unpacked\`
(`PulseLauncher.exe`), which is what a packaged smoke test should run.

---

## 12. Running the app for a visual check

`npm run dev` is fine while iterating, but **screenshot QA should run the built
app from `out/`** so what you see is what ships:

```powershell
$env:LAUNCHER_USER_DATA='D:\Temp\User\opencode\qa-user-data'
$env:LAUNCHER_WINDOWED='1'
$env:LAUNCHER_DEMO='1'
Start-Process 'D:\Projects\ps5-launcher\node_modules\electron\dist\electron.exe' `
  -ArgumentList '--remote-debugging-port=9222','D:\Projects\ps5-launcher'
```

Environment switches read in `main/index.ts`:

- `LAUNCHER_USER_DATA` — isolate settings/history/artwork from the real install.
- `LAUNCHER_WINDOWED=1` — normal frame (easier to screenshot than kiosk).
- `LAUNCHER_DEMO=1` — demo library (`catalog/demo.ts`), no process watcher, no
  real games.
- `LAUNCHER_CAPTURE=<path>` — forces windowed, captures a PNG after 8 s, quits.

Drive it over CDP (`http://127.0.0.1:9222/json`). Two traps:

1. After `Page.reload` the page reports `document.visibilityState === 'hidden'`;
   call `Page.bringToFront` before measuring or screenshotting.
2. A minimised window freezes CSS transitions. Restore it first
   (`D:\Temp\User\opencode\restore-launcher.ps1` does this via Win32).

Use `Page.captureScreenshot` with a `clip` (and `scale`) to zoom into a small
element instead of eyeballing a full screenshot. Check both motion settings:
default, and reduced (`data-motion="reduced"` or Windows "Animation effects" off)
— the reduced branch renders a single static frame and skips the boot crossing.

Useful existing probes in `D:\Temp\User\opencode\`: `boot-landing.mjs` (the
splash→header crossing), `boot-reveal.mjs` (reveal timing), `rail-probe.mjs`
(progress rail), `mood-probe.mjs` (mark face per selection), `mark-check.mjs`,
`sfx-probe.mjs` (15 audio checks), `packaged-wait.mjs` (port 9333),
`music-qa3.mjs` / `music-action.mjs` (music page + overlay), and
`overlay-state.ps1` (the only reliable overlay visibility check).

---

## 13. Cleanup

Kill everything you started, and verify:

```powershell
Get-Process electron,PulseLauncher -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process electron,PulseLauncher -ErrorAction SilentlyContinue | Measure-Object
```

A packaged smoke test runs `release\win-unpacked\PulseLauncher.exe` on a separate
port (e.g. `--remote-debugging-port=9333`) with its own `LAUNCHER_USER_DATA`.

---

## 14. Reporting back

When you finish, tell the user, in Arabic:

1. what changed, in plain language (not a file list);
2. anything you deliberately did **not** touch;
3. the gate results (`tests / typecheck / lint`), and the installer size +
   SHA-256 if you rebuilt one.
