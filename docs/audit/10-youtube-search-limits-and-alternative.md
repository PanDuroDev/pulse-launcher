# YouTube search limits and alternatives

**Reviewed:** 2026-10-27  
**Scope:** Pulse Launcher's YouTube search and metadata path, not a claim that any third-party client is permanently reliable.

## Executive summary

Pulse currently has two search paths:

1. YouTube Data API v3 when an API key is configured.
2. `yt-dlp` `ytsearch25` when no key is configured or the API request fails.

The current design is sensible as a graceful fallback, but neither path guarantees unrestricted, exhaustive search. The clearest concrete defect found during this audit was stale quota wording: the code comment and user-facing music documentation described search as costing 100 quota units per request. Google's current quota documentation says `search.list` has its own default quota bucket of 100 calls/day, with one unit charged per call (as of this review). Fixing that wording is included with this audit.

## What the current implementation does

- `src/main/music/youtube/api.ts` requests up to 25 results from `search.list`, then makes a separate `videos.list` request for duration and richer snippet/thumbnail details.
- A failed details request is deliberately non-fatal: results can survive with unknown duration.
- `src/main/music/youtube/service.ts` falls back to yt-dlp only when the API path fails, not when a successful API search returns zero results.
- `src/main/music/youtube/ytdlp.ts` uses `ytsearch25:<query>` with `--flat-playlist --dump-json`; it is a search fallback and also the extraction engine for playback.
- When the Data API is unavailable, metadata is derived from yt-dlp output and Pulse's title/channel parsing. YouTube has no general-purpose canonical “artist” field, so artist parsing remains heuristic for ordinary uploads.

## Limits and failure modes

### YouTube Data API v3

- The default `search.list` quota is 100 calls/day in its separate bucket as documented by Google for this review; each call costs one unit. Additional pages require additional calls.
- Pulse asks for 25 results even though the API endpoint permits up to 50 per page. This is an application choice, not a hard YouTube API ceiling.
- A search hit and a complete metadata record are not the same thing: Pulse follows search with `videos.list` to obtain duration and details. If that lookup fails, duration can be unknown.
- API keys and quota do not grant access to private, deleted, age-restricted, region-blocked, or otherwise unavailable media.
- The API returns video/channel metadata, not a trustworthy song-artist identity. Parsing “Artist - Title” and “Artist - Topic” can be wrong for remixes, compilations, covers, or unrelated channel names.

### yt-dlp search

- It does not use the official YouTube Data API quota, but that does **not** mean unlimited or guaranteed access.
- It depends on YouTube's web-facing behaviour and yt-dlp's extractor implementation; YouTube changes can break search or extraction until yt-dlp is updated.
- YouTube may rate-limit requests or show “Sign in to confirm you're not a bot”. The yt-dlp FAQ documents HTTP 429 blocks; its YouTube extractor notes also describe token/client restrictions affecting some formats and features.
- Search results are capped by Pulse's `ytsearch25` argument. That cap is not proof that YouTube has no more matches.
- The fallback may provide less complete/consistent metadata than the Data API. Thumbnails fall back to the standard YouTube thumbnail URL, and artist/title are inferred from title/channel text.
- yt-dlp is doing two jobs here—search and audio extraction. A search failure should not be treated as evidence that the selected video itself is unplayable, and vice versa.

## Alternative considered: YouTube.js (`youtubei.js`)

Project documentation: https://ytjs.dev/  
FAQ: https://ytjs.dev/guide/faq

YouTube.js is a JavaScript client for YouTube's internal InnerTube API. It can search and read data without a Data API key, making it a plausible third search adapter for Pulse.

**Potential benefits**
- No YouTube Data API key or `search.list` quota bucket is required.
- It can expose structured search results through a JavaScript API instead of parsing yt-dlp's JSON output.
- It could be used as a search/metadata adapter while leaving yt-dlp responsible for downloading/extracting audio.

**Risks and unknowns**
- InnerTube is an internal, undocumented interface, not a supported public API with a stability guarantee.
- It is not inherently immune to rate limits, bot checks, or IP blocks. The YouTube.js FAQ explicitly notes that requests can fail when a server IP is blocked and says there is no known universal solution.
- “No API key/quota” must not be interpreted as “unlimited”, “more results”, or “more reliable”.
- Adding it introduces another dependency and a third provider path to maintain and test.
- No controlled benchmark was run in this audit, so it would be inaccurate to claim it returns more relevant results or has a higher success rate than yt-dlp in Pulse.

## Recommendation

Do **not** replace yt-dlp's audio extraction. Its extraction role is separate from the search API choice and is already integrated with Pulse's MP3 cache, cancellation, FFmpeg, and error handling.

Keep the current Data API → yt-dlp fallback for now, with the corrected quota explanation. If search coverage remains insufficient, evaluate YouTube.js as an **optional search adapter** in a follow-up PR:

1. Add it behind a provider boundary rather than intertwining it with extraction.
2. Keep yt-dlp as the fallback and extraction engine.
3. Compare all providers against the same fixed query set (common song titles, non-English queries, remixes, ambiguous titles, and zero-result terms).
4. Measure success rate, unique results, metadata completeness, latency, and rate-limit/bot-check frequency over repeated runs.
5. Add bounded timeouts, cancellation, and provider-specific diagnostics; never log API keys or cookies.
6. Only promote it to the default search path if reproducible results show an improvement.

## Sources

- YouTube Data API quota calculator: https://developers.google.com/youtube/data/determine_quota_cost
- YouTube Data API `search.list`: https://developers.google.com/youtube/v3/docs/search/list
- yt-dlp FAQ (rate limits and HTTP 429): https://github.com/yt-dlp/yt-dlp/wiki/FAQ
- yt-dlp YouTube extractor notes (PO tokens and request limits): https://github.com/yt-dlp/yt-dlp/wiki/Extractors
- YouTube.js project documentation: https://ytjs.dev/
- YouTube.js FAQ: https://ytjs.dev/guide/faq

## Validation status

This change corrects documentation and records a source-based technical assessment. It does not add a new search provider or claim that a live A/B benchmark has been performed.
