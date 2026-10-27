# Music

Pulse Launcher includes a built-in music player with four tabs. **All** is the
default: it searches your local files, the online catalogs, and YouTube at the
same time and shows the merged list with source chips that filter it. **Library**
plays audio files from folders on your PC. **Online** searches legal, keyless
catalogs for a song and plays the best match. **YouTube** searches videos through
the YouTube Data API or yt-dlp and extracts the audio you choose to MP3. All
tabs share the same page, Now Playing panel, transport controls, queue, and
desktop overlay.

The local library works entirely offline. Online mode only sends the search text
you type, and YouTube mode sends the search text to Google (when an API key is
configured) or to YouTube through yt-dlp. None of the modes upload files, account
details, or listening history. Extracted YouTube MP3s stay on this machine.

## Unified search

**All** is the default tab. Typing at least two characters searches three
sources at once: the local library is filtered instantly, while the online
catalogs and YouTube are queried in parallel after the same short pause. A slow
or failing source never blocks the others; the footer shows the per-source
counts and each failure is reported separately.

The result list is ordered YouTube first, then local matches, then the ranked
online catalogs, and every row carries a source pill (`YouTube`, `Library`, or
`Online`). YouTube leads because its rows carry the most complete metadata (the
API cover, the real channel, and the exact duration), and it is the source to
reach for when a song is missing from your own files. The chips under the search
box show live counts per source and filter the list to one of them without
re-querying. Playback uses the visible filtered list as its queue, so next and
previous can cross from a YouTube track to a local file and on to an online
stream; a YouTube row still extracts its MP3 the first time it is reached.

## Supported formats

The scanner recognises:

`mp3`, `m4a`, `m4b`, `aac`, `flac`, `ogg`, `oga`, `opus`, `wav`, `wma`

Tags and embedded cover art are read with `music-metadata`. Files without tags
still appear, using the filename as the title.

## Adding music

1. Open the player with `M` or the music button in the header.
2. Stay in **Library** mode.
3. Choose **Add folder**.
4. Pick a folder. Subfolders are scanned automatically.

The scanner stops at eight levels of nesting, indexes up to 8,000 tracks, and
skips individual files larger than 250 MB. Re-run **Rescan** after adding or
removing files outside the launcher. **Remove folder** forgets a folder without
deleting anything from disk.

Scan results are cached in `music/library.json`. Cover art is written to
`music/artwork/`, so the list opens quickly after a restart.

## Online search

Switch to **Online** and type at least two characters. The launcher waits for a
short pause, then searches every catalog at the same time. No account, API key,
or extension is required.

| Catalog | Playback | Notes |
| --- | --- | --- |
| iTunes / Apple Music | 30-second preview | Studio metadata and artwork |
| Deezer | 30-second preview | Preview links can expire; search again if one stops |
| Audius | Full track | Artist uploads; quality varies |
| Openverse | Full track | Creative Commons audio; the license is shown under the artist |
| Internet Archive | Full track | Public files; metadata quality varies |

Every result is labelled **Preview** or **Full**. A result row also shows the
publisher, provider, and duration, so you can tell a studio preview from an
artist upload or an archive recording.

Results from all catalogs are merged before they are displayed:

- Titles and artists are normalised, including accents and punctuation.
- Obvious karaoke, instrumental, tribute, converter, and upload-rip results are
  removed unless the query asks for them.
- Remixes, live versions, covers, acoustic versions, demos, and slowed or sped-up
  versions are ranked below a clean match.
- Exact title and artist matches, normal song lengths, and complete recordings
  receive a higher score.
- Duplicate songs are reduced to one result. A full track wins when its score is
  close to a preview.

The online queue is the current result list. Moving to the next or previous
track stays inside those results, and a local library rescan does not replace
that queue. Choosing a local track switches back to the Library queue.

Online audio and artwork are proxied through `app://launcher/online-media/...`
and `app://launcher/online-art/...`, so the renderer never loads a remote URL
directly. Audio supports seeking when the upstream server supports range
requests. Nothing is downloaded to disk.

Online mode uses only the five catalogs above. It does not bypass paywalls,
DRM, or advertisements.

## YouTube

Switch to **YouTube** and type at least two characters. Search uses the YouTube
Data API v3 when a key is saved in **Setup**. Without a key, or when the API is
over quota or failing, Pulse falls back to the official yt-dlp build and says so
under the result count. The fallback is automatic, so search keeps working
without a Google account or key.

Every row shows the video thumbnail, title, parsed artist, channel, duration, and
a separate external-link button that opens the video on YouTube. The Data API
supplies the highest-resolution thumbnail it returns, the real channel name, and
the exact video duration from `videos.list`; only YouTube image hosts are
accepted for artwork. When the original upload title differs from the parsed song
title, the row (and Now Playing) shows it on a smaller second line with a
tooltip, so the parsed name stays clean without hiding what was actually
uploaded. The title parser strips common `(Official Video)`, `[4K]`, and
`Artist -` prefixes, and `- Topic` is removed from channel names. Without an API
key, yt-dlp supplies the same fields, and the thumbnail falls back to YouTube's
standard cover size.

Clicking a row extracts the audio:

1. Pulse checks `music/youtube/<videoId>.mp3`. A cached file plays immediately.
2. Otherwise it runs official yt-dlp with `--extract-audio`, converts to MP3 with
   FFmpeg, and writes metadata tags.
3. The finished MP3 moves into `music/youtube/`, its metadata is added to
   `music/youtube/index.json`, and the cover is cached in
   `music/artwork/youtube-<videoId>.jpg`.
4. The file then plays through the normal player. The next play uses the cache.

Search rows carry no audio URL. The renderer asks the main process to resolve the
selected video, and the main process keeps one extraction per video in flight, so
double-clicking never starts two downloads. The YouTube queue is the current
search result list; next and previous extract the neighbouring results as needed.
While a row shows **Preparing…**, a **Stop** button cancels the extraction for
real: the yt-dlp/FFmpeg process tree is killed and the temporary directory is
removed, so a slow or wrong video never blocks the page. Choosing another row
cancels the extraction in progress automatically.

The library scan can be stopped the same way. A **Stop** control appears next to
**Rescan** while Pulse is walking your folders, keeps the tracks found so far,
and returns the page to idle. Pressing Rescan during a scan cancels the current
walk and queues exactly one fresh one.

Setup (the gear button in YouTube mode) stores the API key, an optional yt-dlp
path, and an optional FFmpeg path in `music/youtube.json`. The key is masked in
the panel, only sent to `googleapis.com`, and redacted from errors and logs.

Pulse auto-downloads the official yt-dlp executable to `music/bin/yt-dlp.exe`
from its GitHub release when no working copy is found on the configured path, in
`music/bin/`, or on `PATH`. **FFmpeg is required for MP3** and is not
downloaded automatically: install it (for example with
`winget install Gyan.FFmpeg`) or point Setup at `ffmpeg.exe`. Setup shows both
tools, their versions and source, and the current cache size.

Setup also owns the MP3 cache. The **MP3 cache limit (MB)** field defaults to
2048 and accepts 100–20000; the limit is stored in `music/youtube.json` next to
the key and tool paths, not in the global settings. When a new extraction pushes
the cache over the limit, Pulse deletes the least recently downloaded tracks
first, using `downloadedAt` from `index.json`. The track that was just written
and the newest existing track are always kept, so the cache can sit over the
limit by one file but never more. The panel lists the cached tracks oldest first
with a **Delete** button per row and a **Clear cache** button that empties
`music/youtube/` and the cover files without touching settings or the tools.

YouTube thumbnails are proxied through `app://launcher/youtube-art/<videoId>`,
and the cached MP3 is served through `app://launcher/media/youtube:<videoId>`
with range support. The renderer still never loads a remote URL directly.

Only extract content you have the rights to. YouTube's Terms of Service and local
copyright law apply, and Pulse does not bypass DRM, paywalls, age gates, or
advertisements. Use **Clear cache** in Setup (or delete files in
`music/youtube/`) to reclaim space; playing a deleted video again extracts it and
rewrites its metadata.

## Playback

The player uses one audio engine for the page and the overlay, so both always
show the same track and position.

- Click a track, or focus it and press Enter, to play.
- Use the transport buttons for previous, play/pause, and next.
- Drag or click the progress bar to seek. Left/Right adjusts it by five seconds
  when the bar is focused.
- Shuffle, repeat (off / all / one), and volume are saved between sessions.
- In Library mode, the queue follows the current filtered list. Clearing the
  filter restores the full library order.
- In Online mode, the queue follows the current search results.
- In All mode, the queue is the visible mixed list: the active source chip
  decides its contents, so next and previous can move between local, online, and
  YouTube tracks.
- In YouTube mode, the queue follows the current YouTube results. The first play
  shows **Preparing…** while the MP3 is extracted; later plays start instantly
  from the cache.

Playback preferences are stored in the renderer's local storage under
`pulse.music.prefs`.

## Desktop overlay

The overlay is a small always-on-top card with cover art, title, artist,
progress, previous, play/pause, next, and close. It appears automatically when a
track starts and does not take focus from the active application. It works for
local, online, and YouTube tracks.

The window is exactly the size of the card (440×132), and the card is fully
opaque: there is no transparent ring around it, no `backdrop-filter`, and no CSS
box shadow. An earlier version inset the card inside a larger transparent
window and drew a shadow into that padding, which made the desktop show through
the edges and painted a dark halo onto whatever was behind the overlay. Every
interactive target inside the card is at least 44 px so it stays usable from a
couch with a remote.

- Close dismisses the overlay until the track changes. Pausing or resuming the
  same track keeps it dismissed.
- `Alt+Shift+M` toggles the overlay from anywhere, including while the launcher
  is hidden.
- **Preview** on the music page shows or hides the overlay immediately.
- **Desktop overlay** at the bottom of the Now Playing panel enables or disables
  the feature.

Overlay preferences are stored in `music/config.json`:

```json
{
  "version": 1,
  "overlay": {
    "enabled": true,
    "alwaysOnTop": true,
    "position": "bottom-right",
    "shortcut": "Alt+Shift+M"
  }
}
```

## Keyboard and gamepad

| Input | Action |
| --- | --- |
| `M` | open or close the music page |
| `Alt+Shift+M` | show or hide the desktop overlay globally |
| `Escape` | leave the music page, or close the overlay when it is focused |
| Arrow keys | move focus; Left/Right seek or change volume on those controls |
| Enter / gamepad A | activate the focused control |
| Gamepad B | go back |

## Storage

Everything lives under the app's user data directory
(`%APPDATA%\Pulse Launcher\` by default):

```text
music/
  library.json     scanned tracks and folder list
  config.json      overlay preferences
  artwork/         cached cover images
  youtube/         extracted MP3 files and index.json
  youtube.json     API key and tool paths
  bin/             auto-downloaded yt-dlp and optional tools
```

Use `LAUNCHER_USER_DATA` to point the whole app at a different directory, which
is useful for testing.

Online results are not saved; their short `app://` tokens live in memory only and
stop working when the app restarts. YouTube MP3s and their metadata **are**
saved in `music/youtube/`, so a track plays offline after its first extraction.
Search thumbnails are not cached as files; the resolved cover is stored in
`music/artwork/`.

To rebuild the library from scratch, close the app and delete
`music/library.json` and `music/artwork/`. The next launch scans the saved
folders again.

To clear extracted YouTube audio, close the app and delete `music/youtube/`.
The next play extracts again. Cached YouTube covers are the
`music/artwork/youtube-*.jpg` files and can be deleted separately.

## Troubleshooting

**No tracks appear**
Check that the folder contains a supported extension and that files are not
larger than 250 MB. Choose **Rescan**. If the folder was moved, remove it and add
it again.

**A track has no cover**
The file has no embedded artwork. The player shows a generated placeholder; it
does not download covers for local files.

**A file will not play**
The extension is supported, but the codec inside may not be. Re-encode the file
as MP3, AAC/M4A, or FLAC.

**No online matches**
Search for an artist and a title, not a whole sentence. Catalogs differ, and a
track that exists on one service may be missing from the others. A simpler query
usually finds more versions.

**Every online catalog is unavailable**
Check the internet connection, DNS, or firewall. Providers can also rate-limit
requests temporarily. Local Library mode continues to work offline; try again
later.

**An online result stops after 30 seconds**
The result is a preview from iTunes or Deezer. Choose a result labelled **Full**,
or search again if a Deezer preview has expired.

**An online result will not seek**
Some upstream files do not support range requests. Choose another result; the
next full track usually seeks normally.

**YouTube search works but nothing plays**
Open **Setup** and check the FFmpeg badge. FFmpeg is required to produce MP3;
install it with `winget install Gyan.FFmpeg` and press **Refresh**. If the yt-dlp
badge is missing, check the connection and Refresh, or set a path to an existing
`yt-dlp.exe`.

**YouTube says yt-dlp must sign in, or the video is unavailable**
Some videos are age-restricted, private, region-locked, or removed. Try another
result. A YouTube Data API key improves search quality but does not bypass these
restrictions.

**YouTube search returns fewer results than expected**
As of October 2026, `search.list` has a separate default quota of 100 calls per
day, and each call costs 1 unit in that bucket. Each additional results page is
another request. When the search quota runs out or the API fails, Pulse falls
back to yt-dlp automatically and shows a warning. The fallback has no Data API
quota, but it still depends on YouTube's undocumented web-facing behaviour and
can be rate-limited or blocked.

**The first YouTube play is slow**
The first play downloads the audio and converts it to MP3; long videos take
longer. The result is cached in `music/youtube/`, so subsequent plays are
instant. If extraction times out, try a shorter video or a different result.

**YouTube shows the wrong artist**
YouTube has no separate artist field. Pulse parses `Artist - Song` titles and
`Artist - Topic` channels; ordinary uploads fall back to the channel name. The
video link always opens the exact source if the metadata looks wrong.

**The overlay does not appear**
Make sure **Desktop overlay** is enabled in the Now Playing panel, then press
`Alt+Shift+M`. Some fullscreen games suppress always-on-top windows; switch the
game to borderless windowed mode if you need the overlay visible.

**The scan stops with an error**
The footer shows the error. Unreadable files are skipped; a permission error on
the selected folder usually means the folder needs to be re-selected.

## Limitations

- Windows only, like the rest of Pulse Launcher.
- Online search covers five keyless catalogs. YouTube is a separate source with
  its own search and extraction path, and the **All** tab queries both in
  parallel.
- YouTube extraction needs FFmpeg, a working connection, and a video that yt-dlp
  can access. Age-restricted, private, region-locked, and removed videos fail.
- Extracted MP3s consume disk space until you delete them. YouTube's Terms of
  Service and copyright law still apply.
- Online results depend on the catalogs. Previews can expire, and uploads can be
  covers, live recordings, remixes, or poor-quality files. Check the provider,
  publisher, version, and license before playing.
- DRM-protected local files are not supported.
- The overlay is a normal always-on-top window; exclusive-fullscreen games may
  cover it.

## Architecture

- `src/main/music/library.ts` scans folders, reads tags, caches the library, and
  writes covers.
- `src/main/music/overlay.ts` owns the overlay window, its position, shortcut,
  and show/dismiss rules.
- `src/main/music/online/providers.ts` adapts iTunes, Deezer, Audius, Openverse,
  and Internet Archive results into one shape.
- `src/main/music/online/ranking.ts` filters junk versions, scores matches,
  removes duplicates, and orders the merged results.
- `src/main/music/online/service.ts` runs the catalogs concurrently, records
  provider status, and keeps the in-memory `app://` token map.
- `src/main/music/youtube/service.ts` owns YouTube search, single-flight MP3
  extraction, the cache index, status, and settings.
- `src/main/music/youtube/api.ts` maps YouTube Data API search and video details
  into candidates; `parse.ts` handles video ids, ISO durations, title/artist
  parsing, yt-dlp JSON lines, and secret redaction.
- `src/main/music/youtube/ytdlp.ts` runs official yt-dlp for search and MP3
  extraction; `tools.ts` detects, probes, and downloads yt-dlp and locates FFmpeg;
  `command.ts` runs tools without a shell and kills the process tree on timeout.
- `src/main/music/youtube/config.ts` persists the API key and tool paths in
  `music/youtube.json`.
- `src/main/protocol.ts` serves local audio with range support, proxies online
  audio and artwork, proxies YouTube thumbnails, and serves covers and extracted
  MP3s through `app://launcher/...`.
- `src/renderer/src/lib/music-engine.ts` is the single audio engine and holds the
  local, online, YouTube, or mixed queue. It resolves YouTube tracks
  asynchronously with a generation guard, so a fast second click cannot play a
  stale extraction.
- `src/renderer/src/lib/music-queue.ts` contains the pure queue, filter, source
  classification, and progress helpers.
- `src/renderer/src/components/launcher/MusicPage.tsx` renders the All/Library/
  Online/YouTube tabs, the source chips, the YouTube setup panel, and the Now
  Playing panel; `MusicOverlay.tsx` renders the overlay.
