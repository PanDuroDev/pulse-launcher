# Music

Pulse Launcher includes a built-in music player for local audio files. It is a
first-class page in the launcher and has a separate desktop overlay, so music
keeps playing while you browse games or use another application.

The player works entirely offline. It does not upload files, call a remote
catalog, or require an account.

## Supported formats

The scanner recognises:

`mp3`, `m4a`, `m4b`, `aac`, `flac`, `ogg`, `oga`, `opus`, `wav`, `wma`

Tags and embedded cover art are read with `music-metadata`. Files without tags
still appear, using the filename as the title.

## Adding music

1. Open the player with `M` or the music button in the header.
2. Choose **Add folder**.
3. Pick a folder. Subfolders are scanned automatically.

The scanner stops at eight levels of nesting, indexes up to 8,000 tracks, and
skips individual files larger than 250 MB. Re-run **Rescan** after adding or
removing files outside the launcher. **Remove folder** forgets a folder without
deleting anything from disk.

Scan results are cached in `music/library.json`. Cover art is written to
`music/artwork/`, so the list opens quickly after a restart.

## Playback

The player uses one audio engine for the page and the overlay, so both always
show the same track and position.

- Click a track, or focus it and press Enter, to play.
- Use the transport buttons for previous, play/pause, and next.
- Drag or click the progress bar to seek. Left/Right adjusts it by five seconds
  when the bar is focused.
- Shuffle, repeat (off / all / one), and volume are saved between sessions.
- The queue follows the current filtered list. Clearing the filter restores the
  full library order.

Playback preferences are stored in the renderer's local storage under
`pulse.music.prefs`.

## Desktop overlay

The overlay is a small always-on-top card with cover art, title, artist,
progress, previous, play/pause, next, and close. It appears automatically when a
track starts and does not take focus from the active application.

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
```

Use `LAUNCHER_USER_DATA` to point the whole app at a different directory, which
is useful for testing.

To rebuild the library from scratch, close the app and delete
`music/library.json` and `music/artwork/`. The next launch scans the saved
folders again.

## Troubleshooting

**No tracks appear**
Check that the folder contains a supported extension and that files are not
larger than 250 MB. Choose **Rescan**. If the folder was moved, remove it and add
it again.

**A track has no cover**
The file has no embedded artwork. The player shows a generated placeholder; it
does not download covers.

**A file will not play**
The extension is supported, but the codec inside may not be. Re-encode the file
as MP3, AAC/M4A, or FLAC.

**The overlay does not appear**
Make sure **Desktop overlay** is enabled in the Now Playing panel, then press
`Alt+Shift+M`. Some fullscreen games suppress always-on-top windows; switch the
game to borderless windowed mode if you need the overlay visible.

**The scan stops with an error**
The footer shows the error. Unreadable files are skipped; a permission error on
the selected folder usually means the folder needs to be re-selected.

## Limitations

- Windows only, like the rest of Pulse Launcher.
- Local files only. Online catalogs and streaming providers are not part of this
  version.
- DRM-protected files are not supported.
- The overlay is a normal always-on-top window; exclusive-fullscreen games may
  cover it.

## Architecture

- `src/main/music/library.ts` scans folders, reads tags, caches the library, and
  writes covers.
- `src/main/music/overlay.ts` owns the overlay window, its position, shortcut,
  and show/dismiss rules.
- `src/main/protocol.ts` serves audio with HTTP range support and covers through
  `app://launcher/...`.
- `src/renderer/src/lib/music-engine.ts` is the single audio engine.
- `src/renderer/src/lib/music-queue.ts` contains the pure queue, filter, and
  progress helpers.
- `src/renderer/src/components/launcher/MusicPage.tsx` and `MusicOverlay.tsx`
  render the two surfaces.
