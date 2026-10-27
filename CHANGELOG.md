# Changelog

All notable changes to Pulse Launcher are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A release is only cut from a commit whose installer contains that commit:
`npm run dist` ends with `node scripts/verify-installer.mjs`, which fails when the
packaged `app.asar` is older than `out/`.

## [Unreleased]

### Added

- `scripts/verify-installer.mjs` plus `npm run verify:release`: compares the
  newest build output, `release/win-unpacked/resources/app.asar`, and the
  installer, and refuses a stale package. Wired into `pack` and `dist`.
- GitHub Actions: a `Verify` job (typecheck, lint, tests, build) on every push and
  pull request, and an `Installer` job on `v*` tags that builds and uploads the
  NSIS installer with its `.blockmap` and `latest.yml`.
- `docs/audit/PHASES.md` Phase 8 «الإصدار نفسه» so publishing has its own tracked
  work instead of living in Phase 0.

### Changed

- YouTube tools are no longer looked up inside the app resources: the
  `source: 'bundled'` branch was removed because `resources/bin/` is never
  shipped. yt-dlp still auto-downloads into `music/bin/`, FFmpeg is still detected
  from the configured path, `PATH`, and the usual package-manager locations.

## [0.1.0] - 2026-10-27

First packaged build. Windows 10/11 x64, NSIS installer, unsigned.

### Added

- PS5-style fullscreen library merging Steam, Epic Games, Start Menu shortcuts,
  and manually added executables, with a cinematic hero, rows, search, details,
  favourites, and a running-game indicator.
- Boot sequence, header avatar engine, controller-first spatial navigation, and
  keyboard shortcuts for every surface.
- Music player with four modes — **All** (one search across every source),
  **Library** (local folders), **Online** (iTunes, Deezer, Audius, Openverse,
  Internet Archive), and **YouTube** (search plus on-demand MP3 extraction) — a
  shared queue, and a frameless always-on-top desktop overlay.
- YouTube mode uses the YouTube Data API when a key is saved and yt-dlp
  `ytsearch` otherwise; official yt-dlp and FFmpeg produce the MP3, with tags,
  cover art, and `app://` playback with range seeking.
- MP3 cache controls: a 2048 MB default limit (100–20000 MB accepted), LRU
  eviction that keeps the newest track, a per-track **Delete**, and **Clear
  cache**.
- YouTube setup panel for the API key and the optional yt-dlp / FFmpeg paths,
  stored in `music/youtube.json`; the key is masked and only sent to
  `googleapis.com`.
- Error boundary around the shell and every page; renderer crashes are written to
  `logs/main.log` and replaced with a recovery screen instead of a white window.
- Electron fuses flipped before signing: `RunAsNode`, `NODE_OPTIONS`, and
  `--inspect` disabled, cookies encrypted, only `app.asar` loaded, ASAR integrity
  validated at boot.

### Changed

- Each online catalog has its own 12 s deadline inside a 15 s search budget, and
  a banner names the catalog that did not answer instead of showing an ambiguous
  count.
- Choosing a different YouTube row cancels the extraction already running, so two
  downloads never compete for one listen.
- Library scan progress is reported while walking, and a rescan during a scan
  cancels the current walk and queues exactly one fresh one.

### Fixed

- The MP3 cache grew without limit (108.9 MB in one test session); it is now
  bounded and prunes the least recently downloaded tracks.
- A large local folder could be scanned twice in parallel and could not be
  stopped; both are fixed, and a cancelled scan keeps the tracks found so far.
- Cancelling an extraction now kills the whole yt-dlp/FFmpeg process tree and
  removes the temp directory, so no `.tmp` file or orphan process survives.

### Known limitations

- The installer is not code-signed, so Windows SmartScreen shows «Windows
  protected your PC» on first run (choose **More info → Run anyway**). A
  certificate is required before a wide public release; see
  `docs/audit/01-release-and-packaging.md` §3.
- There is no in-app updater yet.
