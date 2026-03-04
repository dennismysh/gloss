# Read-Only Public Access with API Key Auth

**Date:** 2026-03-03

## Summary

Protect all write endpoints with a secret API key so the site is read-only for visitors. Only the owner can add, edit, or delete articles.

## Backend

A single `GLOSS_API_KEY` environment variable stored in Netlify. All write endpoints (POST, PATCH, DELETE) require an `Authorization: Bearer <key>` header. GET endpoints remain public and unauthenticated.

Add a `requireAuth(req)` helper in `articles.mjs` that extracts the Bearer token from the Authorization header and compares it to `process.env.GLOSS_API_KEY`. Returns null if valid, or a 401 Response if invalid/missing.

Call `requireAuth` at the top of:
- `handlePost` (add article)
- `handleReanalyze` (re-run analysis) — needs req passed through
- `handlePatch` (update read state, ratings)
- `handleDelete` (remove article)

401 response body: `{ "error": "Unauthorized" }`.

## Frontend

**Settings modal:** Add an "API Key" text input field. Value saved to localStorage under `gloss_api_key`. Masked input (type=password) with a show/hide toggle.

**Auth header injection:** All fetch calls for POST, PATCH, and DELETE include `Authorization: Bearer <key>` read from localStorage. Create a helper like `authHeaders()` that returns the header object if a key exists.

**Conditional UI:** Write controls only render when `getApiKey()` returns a truthy value:
- "Add Article" button (header area)
- Delete trash icon (card actions)
- "Re-analyze" button (card actions)
- Read toggle checkbox (card actions)
- Rating stars (card actions)
- "Add note" button (card actions)

**401 handling:** If any write request returns 401, show a toast "Invalid API key" and clear the stored key from localStorage. The write UI disappears on next render.

## Visitor Experience

Visitors see a clean read-only reading list. They can browse articles, read analyses, use TTS, search, filter, sort, and toggle dark mode. No modification controls are visible.

## Files Changed

- `netlify/functions/articles.mjs` — add `requireAuth()`, call it in POST/PATCH/DELETE handlers, pass `req` to `handleReanalyze`
- `index.html` — settings modal API key field, `authHeaders()` helper, conditional rendering of write UI, 401 toast handling
