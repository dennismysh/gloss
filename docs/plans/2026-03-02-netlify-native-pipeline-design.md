# Design: Netlify-Native Gloss Pipeline

## Summary

Move Gloss from a GitHub Pages + GitHub Action pipeline to a fully Netlify-native architecture. Content lives in Netlify Blobs (free storage), AI processing runs through Netlify AI Gateway (auto-injected credentials, no API key), and the site fetches content dynamically. GitHub stays as the code repo only.

## Architecture

```
Android share / browser / API client
        |
POST /.netlify/functions/articles  (URL + optional tags)
        |
Netlify Function:
  1. Fetch article content
  2. Call Claude via AI Gateway (auto-injected credentials)
  3. Generate analysis HTML + metadata
  4. Store article + analysis in Netlify Blobs
        |
Site loads content from Blobs on page load (no redeploy needed)
```

## Data Model

Three Netlify Blob stores:

### `articles` store
One blob per article, keyed by string ID (e.g., `"1"`):
```json
{
  "id": 1,
  "title": "The Town Where People Live Underground",
  "relevance": "How Coober Pedy's underground dwellings offer a glimpse at climate-adapted architecture.",
  "url": "https://www.bbc.com/future/article/20230803-the-town-where-people-live-underground",
  "tags": ["architecture", "culture"],
  "read": false,
  "hasAnalysis": true,
  "createdAt": "2026-03-02T00:00:00Z"
}
```

### `analyses` store
One blob per analysis, keyed by article ID. Value is the full analysis HTML string.

### `meta` store
Single `index` blob tracking next ID and article count:
```json
{
  "nextId": 2,
  "count": 1
}
```

## API Endpoints (Netlify Functions)

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/.netlify/functions/articles` | GET | List all articles | None |
| `/.netlify/functions/articles` | POST | Add URL, fetch, analyze, store | Bearer token |
| `/.netlify/functions/analysis` | GET | Fetch analysis by ID (`?id=1`) | None |
| `/.netlify/functions/articles` | PATCH | Update article (read, rating) | Bearer token |

### Security
- POST/PATCH require `Authorization: Bearer <token>` header
- Token stored as `GLOSS_API_TOKEN` Netlify env var
- GET endpoints are public (the reading list is public)

### POST Request Body
```json
{
  "url": "https://example.com/article",
  "tags": ["architecture", "culture"]
}
```
Tags are optional — Claude can auto-suggest from the CONFIG taxonomy.

## Site Changes

### Frontend (`index.html`)
- On page load: `fetch('/.netlify/functions/articles')` replaces the static `CONTENT` array
- On card expand: `fetch('/.netlify/functions/analysis?id=1')` lazy-loads analysis HTML
- Analysis variables removed from `index.html` (analyses come from Blobs)
- Loading states for article list and analysis panels

### What Gets Removed
- `.github/workflows/process-queue.yml` (GitHub Action)
- `queue.md` workflow (replaced by POST endpoint)
- GitHub sync feature (replaced by direct API)
- `content.js` (content comes from Blobs)
- Analysis variables in `index.html`

### What Gets Added
- `netlify/functions/articles.mjs` — CRUD for articles + AI processing
- `netlify/functions/analysis.mjs` — fetch analysis by ID
- `netlify.toml` — Netlify config (publish dir, no build command)
- `GLOSS_API_TOKEN` env var in Netlify dashboard

### What Stays
- `index.html` — same app, modified to fetch from API
- `config.js` — branding, tags, features (static config)
- All UI features: TTS, dark mode, ratings, streaks, search, filter

## Netlify Setup

### Environment Variables
- `GLOSS_API_TOKEN` — shared secret for write endpoints (set in Netlify dashboard)
- `ANTHROPIC_API_KEY` — auto-injected by AI Gateway (no setup needed)
- `ANTHROPIC_BASE_URL` — auto-injected by AI Gateway (no setup needed)

### netlify.toml
```toml
[build]
  publish = "."
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
```

## Credit Usage (Free Plan: 300/month)

| Action | Estimated Credits |
|--------|------------------|
| AI Gateway (Claude call per article) | ~2-5 |
| Function compute | ~1 |
| Blob storage | 0 (free) |
| Bandwidth (per GB) | 10 |
| Per production deploy | 15 |

Estimated capacity: ~50-100 articles/month on free tier. No deploy cost for adding articles (content is dynamic).

## Future: Android App

The API surface is designed for the Android app to be a direct client:
- Same endpoints, same auth token
- Share sheet sends POST to `/.netlify/functions/articles`
- App reads from GET endpoints
- No additional backend work needed
