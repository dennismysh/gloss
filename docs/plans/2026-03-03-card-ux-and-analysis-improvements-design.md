# Card UX and Analysis Improvements

**Date:** 2026-03-03

## Summary

Four changes to improve card interaction and analysis workflow:
1. Individual card collapse/expand
2. Position-based display numbers
3. Re-run analysis
4. Model attribution on analysis

## 1. Individual Card Collapse/Expand

**Problem:** Cards can be expanded individually when collapsed, but there's no way to collapse a single card — only the global "Collapse all" toggle exists.

**Design:** Convert `expandCard()` into a true toggle. Track per-card expanded state in a `Set` called `expandedCards`. When `allCollapsed` is true, only cards in `expandedCards` stay open. Clicking an expanded card's `paper-top` removes it from the set and collapses it.

**Files:** `index.html` — `expandCard()` function, `renderPapers()` collapsed logic, state declarations.

## 2. Position-Based Display Numbers

**Problem:** Article IDs are auto-incrementing and never reused. Deleting article #1 then adding a new one shows #2 instead of #1. The display number should reflect position, not internal ID.

**Design:** In `renderPapers()`, change `p.id` to `i + 1` in the paper-number span. Internal IDs remain unchanged for all API calls, storage, and state tracking.

**Files:** `index.html` — one line in `renderPapers()`.

## 3. Re-Run Analysis

**Problem:** No way to regenerate an article's analysis after initial creation.

**Design:**

**Frontend:**
- Add a "Re-analyze" button in card actions (next to the Analysis button), visible only when `hasAnalysis` is true.
- `reanalyzeArticle(id)` confirms with the user, then opens an SSE connection to `POST /articles?reanalyze=<id>`.
- Shows a loading state in the analysis panel during re-analysis.
- On completion, updates `analysisCache[id]` and re-renders.

**Backend:**
- `handlePost` in `articles.mjs` checks for a `reanalyze` query param.
- If present, reads the existing article from the store (gets its URL), re-fetches the content, calls Gemini, and overwrites the analysis in the analyses store.
- Stores the model name (`gemini-3.1-pro-preview`) alongside the analysis.
- Same SSE streaming pattern with heartbeat.

**Files:** `index.html` — new `reanalyzeArticle()` function, `renderPapers()` button. `netlify/functions/articles.mjs` — reanalyze branch in `handlePost`.

## 4. Model Attribution on Analysis

**Problem:** No visibility into which AI model generated an analysis.

**Design:**

**Backend:**
- Change analysis storage from a plain HTML string to a JSON object: `{ html, model, analyzedAt }`.
- Both initial analysis (POST) and re-analysis write this format.
- `analysis.mjs` GET returns the object. Frontend handles both formats for backward compatibility (bare string = legacy, object = new).

**Frontend:**
- When rendering analysis content, check if the cached value is an object with `model` metadata.
- If so, display a muted attribution line below the analysis header: "Analyzed by Gemini 3.1 Pro Preview on Mar 3, 2026".
- Legacy string analyses render as before with no attribution.

**Files:** `index.html` — `loadAnalysis()`, `renderPapers()` analysis rendering. `netlify/functions/articles.mjs` — analysis storage in POST handler. `netlify/functions/analysis.mjs` — GET response format.
