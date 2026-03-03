# Design: Rewire Add Article Button

**Date:** 2026-03-02
**Status:** Approved

## Summary

Replace the old localStorage-based "Add to Inbox" flow with a direct POST to the Netlify Functions API. When a user submits a URL, the modal closes and a skeleton loading card appears at the top of the article list. The API fetches the article, generates an AI analysis, and stores both in Netlify Blobs. On success, the skeleton is replaced with the real article card. On failure, it becomes an error card with retry.

As part of this work, we also remove the orphaned Inbox tab, localStorage queue, and GitHub queue sync code entirely.

## Scope

1. **Modal** — Update copy from "Add to Inbox" to "Add Article". Keep all three fields (URL, Note, Title). Update submit button text.
2. **`submitAddArticle()`** — Rewrite to POST to `/.netlify/functions/articles` with `{ url, title, note, tags }`.
3. **Skeleton card** — New loading card component prepended to the article list while the API processes (~30-60s).
4. **API update** — Extend POST handler to accept `title` and `note` fields, pass them to the Claude prompt as context.
5. **Cleanup** — Remove Inbox tab, localStorage queue, `renderInbox()`, `pushQueueToGitHub()`, and all related CSS/HTML/JS.
6. **Auth removal** — Remove `checkAuth()` from POST and PATCH handlers.

## Frontend Flow

1. User fills in URL (required), optional title, optional note.
2. User clicks "Add article".
3. Button disables, modal closes.
4. Skeleton card prepended to article list showing:
   - The URL as a link
   - Shimmer animation on title/relevance/tags placeholders
   - Subtle "Analyzing..." label
5. `fetch('/.netlify/functions/articles', { method: 'POST', body: { url, title, note } })` fires.
6. **On success:** Skeleton replaced with real article card (article inserted into in-memory array, list re-rendered).
7. **On error:** Skeleton transforms into error card with message and "Retry" button.

## API Changes (`articles.mjs`)

- Accept `title` and `note` in POST body alongside `url` and `tags`.
- If title provided, pass as hint to Claude prompt.
- If note provided, include as reader context in Claude prompt.
- Store `note` in the article blob.
- Remove `checkAuth()` from POST and PATCH.

## Cleanup — What Gets Removed

### HTML
- Inbox tab button (`<button data-view="inbox">`)
- `inbox-panel` div and contents
- Modal text: "Add to Inbox" → "Add Article", "Add to queue" → "Add article"
- Tip text about telling Claude to check the inbox

### CSS
- `.inbox-panel`, `.inbox-empty`, `.inbox-empty-icon`, `.inbox-empty h3/p`
- `.queue-item` and all sub-selectors
- `.queue-remove-btn`, `.queue-done-btn`

### JS
- `QUEUE_KEY`, `getQueue()`, `saveQueue()`, `updateInboxBadge()`, `renderInbox()`, `removeFromQueue()`, `markQueueDone()`, `pushQueueToGitHub()`
- `inbox` case in `switchView()`
- `updateInboxBadge()` initialization call

### CSS Added
- Skeleton card shimmer animation
- Error card state styles

## What Stays Unchanged

- Article rendering, TTS, notes bar, dark mode, ratings, streaks
- `analysis.mjs` GET endpoint
- `config.js`
