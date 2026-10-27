# Pulse Launcher

A PS5-style fullscreen game launcher for Windows. Pulse Launcher gathers games from Steam, Epic Games, Start Menu shortcuts, and manually added executables into one cinematic, controller-friendly library.

## Features

- Fullscreen, frameless launcher UI with a dynamic hero backdrop and cover-card rows.
- Steam library discovery through `libraryfolders.vdf` and `appmanifest_*.acf`.
- Epic Games discovery through installed `.item` manifests.
- Optional Start Menu shortcut discovery through PowerShell.
- Manual `.exe` and `.lnk` imports through the in-app file browser.
- A details page for the selected game, with an inline editor for a manual game's name, launch file, and cover image.
- Cached Steam CDN artwork, Epic thumbnails, optional SteamGridDB artwork, generated fallback art, and user-chosen cover art for manual games.
- Keyboard and gamepad spatial navigation.
- A boot screen where the Bloub ball takes about half the screen and works through a short montage while the cached library loads, then flies into the header as the logo before the interface appears.
- A circular Bloub mark in the header, 64 px, whose face mirrors the launcher â€” scanning, launching, playing, favorite, empty â€” and reacts when a cover or a control is hovered, focused, or used, with quiet synthesised interface sounds for hover, press, selection, and page changes.
- Live "Running Now" row with process-backed Play/Running states.
- Settings for library sources, artwork, cursor hiding, motion preferences, interface sounds, window mode, and returning after a game.
- Close-to-tray behavior with a clear Hide/Quit split, a global restore shortcut, display sleep prevention, and automatic return after a launched game exits.
- Windowed, fullscreen, and opt-in kiosk presentation modes.
- Demo mode for safe UI testing and screenshots.
- A built-in music player for local folders, legal online catalogs, and YouTube, with embedded tags and cover art, queue playback, shuffle/repeat, MP3 extraction through the official yt-dlp, and a compact always-on-top overlay.
- Windows NSIS installer and unpacked portable build.

## Stack

- Electron 45, electron-vite 6, Vite 8
- React 19, TypeScript 6, Zustand 5
- Tailwind CSS 4, shadcn/ui on Base UI
- Motion, Sonner, MingCute filled icons
- `uisfx` (zen interface cues), Bloub avatar engine (MIT, vendored)
- Norigin Spatial Navigation
- Zod, electron-log, music-metadata
- Vitest, oxlint, electron-builder

## Requirements

- Windows 10 or Windows 11
- Node.js 22.12 or newer
- npm

## Development

```powershell
npm install
npm run dev
```

If the Electron binary was not downloaded during installation:

```powershell
node node_modules\electron\install.js
```

Useful commands:

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite and Electron with hot reload |
| `npm start` | Build and launch the production preview |
| `npm run typecheck` | Type-check main, preload, renderer, and tests |
| `npm run lint` | Run oxlint |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Type-check and build all Electron targets |
| `npm run pack` | Build an unpacked Windows app in `release/win-unpacked` |
| `npm run dist` | Build the NSIS installer |
| `npm run icon` | Regenerate `build/icon.ico` from the included drawing script |

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / left stick / D-pad | Navigate |
| Enter / gamepad A | Launch selected game |
| Escape / gamepad B | Hide the launcher |
| `S` / gamepad Start | Open settings |
| `/` or `Ctrl+F` | Search the library instantly |
| `F` | Add or remove the selected game from favorites |
| `I` | Open the selected game's details page |
| `O` | Cycle the library order (recent / Aâ€“Z / added) |
| `Tab` | Move between the header tools and the current card |
| `R` | Refresh library |
| `M` | Open the music player |
| `Alt+Shift+M` | Show or hide the music overlay |
| Double-click | Launch a game with the mouse |
| `Ctrl+Alt+L` | Restore the launcher from the tray |
| `Alt+F4` / window close | Hide the launcher (never quit) |

Escape, `Alt+F4`, and the window close button all hide the launcher. Quitting is a separate, explicit action available in Settings and the tray menu, so a stray key press cannot end a session.

## Game Details

Press `I`, or choose **Details** on the hero, to open the selected game's page. It shows the cover, source, play state, last played time, launch count, and the same Play/Bring to front and Favorite actions as the hero.

Manual games also get an inline editor: rename the game (up to 80 characters), browse for a different `.exe`/`.lnk` with the in-app picker, and choose a PNG, JPEG, WebP, or AVIF cover. **Save changes** validates and writes the change; a different launch file gives the game a new catalog id while keeping its favorite, stored selection, and play history. **Remove game** asks for a second press (the first press arms it for three seconds), and removing a game also drops its favorite and clears the stored selection if it pointed there.

A chosen cover is copied into the game's artwork folder under a name that includes a hash of the source path, size, and mtime. Replacing the image therefore never serves a stale file, and the renderer still never loads a remote URL directly. Escape (or gamepad B) leaves a text field first, then returns to the library.

## Music

Pulse includes a music player for local folders, legal online catalogs, and YouTube as a built-in app. Press `M`, or choose the music button in the header, to open it.

- **All** is the default tab and searches everything at once: your local files, the online catalogs, and YouTube. The query runs locally, then fans out to the online and YouTube searches in parallel. Source chips with live counts (`All`, `Library`, `Online`, `YouTube`) narrow the list without re-searching. YouTube rows come first (they carry the richest metadata: API cover, real channel, exact duration), then local matches, then the ranked catalog results. Rows are labelled `Local`, `Preview`/`Full`, or `MP3`, and next/previous follow whatever the chips currently show, so playback can cross from a YouTube extraction into a local file and on into an online track.
- **Library** mode works offline. Add folders from the page header and Pulse scans them recursively for MP3, M4A/M4B, AAC, FLAC, OGG/OGA, Opus, WAV, and WMA files. Titles, artists, albums, durations, and embedded covers come from file tags. The scan is cached in `music/library.json`, and extracted covers are written to `music/artwork/`.
- **Online** mode searches iTunes (Apple Music), Deezer, Audius, Openverse, and Internet Archive without an account or API key. Pulse normalizes, filters, deduplicates, and ranks the merged results. Apple Music and Deezer provide 30-second previews; Audius, Openverse, and Internet Archive can provide full tracks. Openverse license metadata is shown with its results.
- **YouTube** mode searches with the YouTube Data API v3 when a key is saved in Setup, and falls back to the official yt-dlp build when the key is missing, over quota, or failing. Every result shows the API's highest-resolution thumbnail, the original video title, the parsed artist, the real channel name, the exact duration, and a link that opens the video. Playing a result extracts the best audio stream to MP3 with yt-dlp and FFmpeg, caches it in `music/youtube/`, and plays it through the same player; later plays reuse the cached file.
- Online results use the same queue, Now Playing panel, transport, and overlay. Remote audio and artwork are proxied through `app://launcher/...`; the renderer never loads a remote URL directly.
- YouTube thumbnails are proxied through `app://launcher/youtube-art/<videoId>`, and extracted MP3s are served with Range support through `app://launcher/media/youtube:<videoId>`. Search results stay unresolved until the first play extracts the audio.
- The player supports filtering, queue playback, previous/next, seeking, volume, shuffle, and repeat.
- The desktop overlay shows cover art, title, artist, and transport controls above other apps. It appears when a track starts; its close button dismisses it until the next track. `Alt+Shift+M` toggles it from anywhere, including while the launcher is hidden.
- Local playback stays on the machine. An online search sends only the typed query to those catalogs; YouTube setup sends the key only to `googleapis.com`. No local file, tag, account, or listening history is uploaded.
- Pulse downloads only content you choose to play. It does not bypass DRM, paywalls, or advertisements; YouTube's terms and local copyright law still apply.

YouTube needs the official yt-dlp and FFmpeg. Pulse downloads yt-dlp automatically to `music/bin/yt-dlp.exe` on first use. FFmpeg must be installed separately, for example with `winget install Gyan.FFmpeg`, or pointed to in the YouTube setup panel. Setup also sets the MP3 cache limit (2048 MB by default), lists the cached tracks with a **Delete** button each, offers **Clear cache**, and the **Stop** button cancels an extraction in progress instead of leaving you waiting. A large library scan can be stopped the same way.

See [docs/MUSIC.md](docs/MUSIC.md) for sources, formats, storage, troubleshooting, and architecture.

The categorized project audit — packaging, security, music, performance, testing, UX, maintenance, and missing features — lives in [docs/audit/](docs/audit/README.md) (Arabic).

## Window Modes

Settings â†’ Window stores one of three modes and applies it at startup:

| Mode | Behavior |
| --- | --- |
| Windowed | Normal frame and title bar, visible in the taskbar. |
| Fullscreen | Borderless fullscreen, not always-on-top, so `Alt+Tab` works normally. This is the default. |
| Kiosk | Fullscreen, always-on-top, and hidden from the taskbar. Opt-in for dedicated machines. |

Kiosk keeps Pulse above other windows and out of the taskbar, but it does not block the Windows `Alt+Tab` switcher; blocking that is intentionally out of scope. It is restored with `Ctrl+Alt+L` or the tray icon, and quitting stays available from the tray menu and Settings.

Switching to Windowed recreates the launcher window because Electron cannot add a native frame to a running frameless window. Fullscreen and Kiosk changes are applied in place.

### Returning after a game

Settings â†’ Window â†’ **Return after game** is on by default. Pulse hides once the launch request is accepted and keeps sampling processes while hidden. It shows itself again after the launched game has been detected running and every tracked game has exited, re-applying the saved mode (including kiosk's always-on-top level). A launch that never produces a process leaves Pulse hidden, and restoring it manually with the tray icon or `Ctrl+Alt+L` cancels the pending return. Turn the preference off to keep Pulse hidden until you restore it yourself.

## Brand Mark and Interface Sounds

The header mark and the boot screen are the Bloub ball, vendored under `src/renderer/src/components/bloub/` from the original engine by [jeremy-prt](https://github.com/jeremy-prt/bloub) (MIT); the React wrapper is a local port of its Vue client. The mark is pinned to the circular skin and tinted with a calm blue that matches the launcher accent. Its eyes rest on the catalogue pose â€” up and to the right â€” and follow the pointer around it, so the logo keeps the direction of the original artwork instead of turning to face the settings panel the way the upstream demo does. Hovering winks, clicking widens the eyes behind a ripple, and the glow behind the ball breathes on its own.

The mark is also the launcher's face, and it is 64 px so the expression is legible from the sofa. `lib/mark-mood.ts` maps the library's state onto the catalogue's vocabulary: `alert` when the catalog fails, `burst` while a launch is in flight, `thinking` while a scan runs, `play` for a running game, `notify` for a favorite, `sleep` when nothing is selected. With nothing louder to report it wears the selected game's own face, derived from a hash of the game id, so moving between covers changes the character instead of leaving it on one expression for the session. On top of that, `lib/attention.ts` is a small pub/sub bus: covers, the hero, and the header tools announce `hover`, `focus`, or `launch`, and the mark answers with a short reaction that expires back into the current mood. No component needs to know the mark exists.

At startup the boot overlay shows the same ball at `min(68vmin, 46rem)` and walks a montage per phase: `swirl â†’ thinking â†’ comet â†’ orbit` while the store initialises, a `comet â†’ idle` hand-off when the library is ready, and `alert â†’ exclaim` with the error text when it is not. Each animation respects the engine's own minimum duration, and `comet` is shared by the loading and ready phases so the shooting star is seen even when the catalog answers instantly. Behind it the room is built in depth rather than painted: a cool base that darkens toward the edges, two counter-rotating auroras on 64 s and 92 s periods, a two-scale dot grid, a horizon pool under the ball, a breathing bloom, a pair of hairline lens rings, and a film grain, all under one vignette.

The progress rail is a dashed signal line rather than a filled bar. During `scan` a narrow beam sweeps along it with a glowing head; when the library answers, the dashes light from left to right and the head comes to rest at the end, next to a `SCANNING` / `READY` / `ERROR` tag.

The overlay does not fade out. When `comet` finishes, the ball is whole again; that frame is then carried across the screen â€” measured from the splash square to the header mark's own box â€” shrinking into the logo it becomes, and the library fades in behind it only after it lands. The header mark's box is in the layout the whole time so the crossing can be measured, but it is not painted until the ball arrives, which is what keeps two balls off the screen at once. Spatial navigation, shortcuts, and gamepad input stay frozen until the crossing completes. Under reduced motion every screen renders one static frame and the library appears without the crossing.

Hover, press, selection, and page changes play short cues from the [uisfx](https://uisfx.com) `zen` pack. Cues are synthesised with the Web Audio API, so no audio files ship with the app and only the fifteen cues Pulse uses are prepared; the audio device opens on the first real pointer or key gesture. Settings â†’ Experience â†’ **Interface sounds** turns them off (stored as `uiSounds` in `settings.json`), and nothing plays while a text field is focused.

## Data and Settings

Settings, play history, catalog cache, logs, and artwork live in Electron's `userData` directory:

```text
%APPDATA%\Pulse Launcher\
```

The current files are:

- `settings.json`
- `history.json`
- `cache/catalog.json`
- `artwork/<game-id>/`
- `music/library.json`
- `music/config.json`
- `music/artwork/<file>`
- `music/youtube/<videoId>.mp3` and `music/youtube/index.json`
- `music/youtube.json`
- `music/bin/`
- `logs/main.log`

The catalog cache expires after 30 minutes. A refresh is started automatically when the library is empty or stale.

Running state is sampled from Windows processes even while the launcher is hidden, so a game launched from Pulse stays tracked until it exits. Games are matched by installed executable or installation directory, while launchers and helper binaries such as `EpicGamesLauncher.exe`, `Steam.exe`, and `Launcher.exe` are ignored.

## Demo and Capture Modes

Demo mode uses a fixed library and avoids launching real games:

```powershell
$env:LAUNCHER_DEMO='1'
npm start
```

The UI can also be captured with the windowed development layout:

```powershell
$env:LAUNCHER_DEMO='1'
$env:LAUNCHER_WINDOWED='1'
$env:LAUNCHER_CAPTURE='D:\Temp\pulse-launcher.png'
npm start
```

The capture window writes a screenshot after eight seconds and exits. `LAUNCHER_WINDOWED=1` and `LAUNCHER_CAPTURE` override the saved window mode for that run, so a kiosk profile can still be inspected on a desktop.

Demo mode also writes four short synthesized tracks and SVG covers into the isolated music folder, so the player and overlay can be exercised without a local library.

For isolated QA runs, point the app at a separate data directory:

```powershell
$env:LAUNCHER_USER_DATA='D:\Temp\pulse-profile'
```

## Artwork

- Steam covers, heroes, and logos are fetched from Steam's public CDN and cached locally.
- Epic manifests may provide a vault thumbnail.
- Other games can use a SteamGridDB API key entered in Settings.
- Games without downloadable art receive a generated gradient cover/hero with their initials.
- Manual and Start Menu games fall back to native Windows file icons when available.

No remote URL is loaded directly by the renderer. Downloaded artwork is served through the local `app://launcher` protocol.

## Security Model

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Renderer requests are validated by IPC channel, trusted sender origin, and Zod schemas.
- The renderer sends game IDs; launch targets stay in the main process.
- Steam and Epic launch targets are validated before use.
- External navigation and new windows are denied.
- Renderer permissions are denied.
- A restrictive Content Security Policy is applied.
- Electron fuses are flipped in the packaged executable: `RunAsNode`, `NODE_OPTIONS` injection, and `--inspect` are disabled, cookies are encrypted, only `app.asar` is loaded, and embedded ASAR integrity is validated at boot. Verify with `npx @electron/fuses read --app release\win-unpacked\PulseLauncher.exe`.
- Renderer crashes are reported to the main process and written to `logs/main.log`; an error boundary replaces the failing page instead of leaving a white screen.
- The `app://` protocol rejects path traversal.
- Music audio and cover art are served through the same protocol; the renderer never receives a raw filesystem path. Online audio and artwork are exposed only as random `app://` tokens, and the protocol proxy accepts HTTPS public hosts only. YouTube thumbnails use the fixed `/youtube-art/<videoId>` route, and extracted MP3s are served from the local cache through `/media/youtube:<videoId>`.
- yt-dlp and FFmpeg run without a shell, and yt-dlp is downloaded only from its official GitHub release. The YouTube API key is stored locally, masked in the setup panel, and redacted from errors and logs.
- SteamGridDB keys are masked by default and redacted from logs. They are stored locally in `settings.json` without additional encryption, so protect your Windows account and never commit that file.

## Testing

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

The Vitest suite covers VDF parsing, Steam and Epic manifests, manual game normalization, shared formatting helpers, the music queue and source filtering, online catalog normalization and ranking, online provider mapping, YouTube video ids and durations, YouTube title/artist/channel parsing, YouTube API mapping and thumbnail selection, yt-dlp error mapping, secret redaction, URL safety, and renderer logic. Run `npm test` to execute the current suite; the test count is intentionally not duplicated here because it changes as tests are added.

## Packaging

```powershell
npm run pack
npm run dist
```

Packaging uses `electron-builder.yml`, includes `resources/resolve-shortcuts.ps1` through `extraResources`, and writes artifacts to `release/`.

The installer is unsigned. Windows SmartScreen may warn until a code-signing certificate is configured.

### SmartScreen on first run

`0.1.0` is intentionally shipped without a code-signing certificate, so Windows
cannot verify the publisher. On the first launch of the installer you will see
**"Windows protected your PC"** with an *Unknown publisher* label. Choose **More
info**, then **Run anyway** to continue.

This warning is not a sign of a modified file. The build is reproducible from this
repository, and the packaged executable has Electron's security fuses flipped and
ASAR integrity validation enabled, so a tampered `app.asar` refuses to boot. What
the missing certificate costs you is publisher identity: Windows cannot prove the
file came from this project. A code-signing certificate is required before any
wide public release; see `docs/audit/01-release-and-packaging.md` §3.

## Known Limitations

- Windows only.
- Start Menu scanning depends on Windows PowerShell.
- Some Epic display names may differ from the launcher's localized names.
- SteamGridDB lookups require a user-provided API key.
- The UI is currently English and LTR; Arabic localization is planned.
- Kiosk mode cannot block the Windows `Alt+Tab` switcher; it only keeps Pulse above other windows.
- Real gamepad hardware and real Steam/Epic launches should be validated on the target machine.
- Online search covers the five keyless catalogs above. YouTube is a separate mode: it needs FFmpeg on the machine, and extraction can fail on age-restricted, private, region-locked, or removed videos.
- YouTube downloads are subject to YouTube's Terms of Service and copyright law; only extract content you have the rights to. MP3 files stay in `music/youtube/` until you delete them, so the cache grows with each new track.
- Online results depend on the catalogs: preview URLs can expire, and some results are covers, live versions, or uploads. Check the provider, publisher, version, and license labels before playing.
- `npm audit` reports vulnerabilities in the shadcn CLI development toolchain. `npm audit --omit=dev` is clean; the affected tools are not included in the packaged app.

## Roadmap

Planned work and known bugs are tracked in [GitHub Issues](https://github.com/PanDuroDev/pulse-launcher/issues).

## License

Pulse Launcher is source-available under the [Pulse Launcher Source-Available & Non-Commercial License](LICENSE). It is not OSI open source: personal, non-commercial use and upstream contributions are permitted; commercial use, public redistribution of competing forks, extraction of the project's core algorithms or UI, and use of its branding are not.
