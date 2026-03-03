# Card UX and Analysis Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix card collapse/expand, show position-based numbers, add re-analyze functionality, and display model attribution on analyses.

**Architecture:** All frontend changes are in `index.html` (single-file app). Backend changes touch `netlify/functions/articles.mjs` (reanalyze route + model metadata in analysis storage) and `netlify/functions/analysis.mjs` (return structured object). Analysis storage migrates from bare HTML strings to `{ html, model, analyzedAt }` JSON objects with backward compatibility for legacy entries.

**Tech Stack:** Vanilla JS frontend, Netlify Functions (ESM), Netlify Blobs, Google Gemini via Netlify AI Gateway.

---

### Task 1: Individual Card Collapse/Expand

Convert `expandCard()` from expand-only to a true toggle so cards can be individually collapsed.

**Files:**
- Modify: `index.html:1850` (state declarations)
- Modify: `index.html:2324-2328` (`expandCard` function)
- Modify: `index.html:2412` (collapsed logic in `renderPapers`)
- Modify: `index.html:2416-2422` (card template — always show chevron when collapsed)

**Step 1: Add `expandedCards` state**

At `index.html:1850`, after `let allCollapsed = false;`, add:

```javascript
let expandedCards = new Set();
```

**Step 2: Replace `expandCard` with a toggle**

Replace `index.html:2324-2328` with:

```javascript
function expandCard(el, paperId) {
  const card = el.closest('.paper');
  if (card.classList.contains('collapsed')) {
    card.classList.remove('collapsed');
    expandedCards.add(paperId);
  } else {
    card.classList.add('collapsed');
    expandedCards.delete(paperId);
    // Close analysis if open
    if (analysisOpen[paperId]) {
      analysisOpen[paperId] = false;
      if (activePaperId === paperId) clearPaperContext();
    }
  }
  if (window.lucide) lucide.createIcons();
}
```

**Step 3: Update collapsed logic in `renderPapers`**

Replace `index.html:2412`:

```javascript
    const collapsed = allCollapsed && !analysisOpen[p.id] ? 'collapsed' : '';
```

with:

```javascript
    const collapsed = (allCollapsed && !expandedCards.has(p.id) && !analysisOpen[p.id]) ? 'collapsed' : '';
```

**Step 4: Always show chevron indicator on collapsed cards**

The chevron on line 2422 is already only shown when collapsed — no change needed. But also add a collapse chevron when the card is expanded and `allCollapsed` is false, so users know they can click to collapse. Replace `index.html:2422`:

```javascript
          ${collapsed ? '<i data-lucide="chevron-down" class="expand-chevron"></i>' : '<i data-lucide="chevron-up" class="expand-chevron" style="opacity:0.3"></i>'}
```

**Step 5: Clear `expandedCards` when toggling collapse-all**

In `toggleCollapseAll()` at `index.html:2330-2337`, add `expandedCards.clear();` after the `allCollapsed` toggle:

```javascript
function toggleCollapseAll() {
  allCollapsed = !allCollapsed;
  expandedCards.clear();
  const icon = allCollapsed ? 'rows-4' : 'rows-3';
  document.getElementById('collapseToggle').innerHTML = `<i data-lucide="${icon}" style="margin-right:4px;font-size:13px;"></i> ${allCollapsed ? 'Expand all' : 'Collapse all'}`;
  localStorage.setItem(COLLAPSED_KEY, allCollapsed);
  renderPapers();
  if (window.lucide) lucide.createIcons();
}
```

**Step 6: Test manually**

1. Load the app, click "Collapse all" — all cards collapse.
2. Click a collapsed card — it expands (only that one).
3. Click the same card's top area again — it collapses back.
4. Click "Expand all" — all cards expand, individual overrides reset.

**Step 7: Commit**

```bash
git add index.html
git commit -m "Add individual card collapse/expand toggle"
```

---

### Task 2: Position-Based Display Numbers

Show sequential position numbers (01, 02, 03...) instead of internal IDs.

**Files:**
- Modify: `index.html:2418` (paper-number in `renderPapers`)

**Step 1: Change display number from ID to position**

Replace `index.html:2418`:

```javascript
          <span class="paper-number">${String(p.id).padStart(2, '0')}</span>
```

with:

```javascript
          <span class="paper-number">${String(i + 1).padStart(2, '0')}</span>
```

**Step 2: Test manually**

1. Load the app with articles — numbers should show 01, 02, 03... sequentially.
2. Delete an article — remaining articles re-number without gaps.
3. Add a new article — it appears as the next sequential number.

**Step 3: Commit**

```bash
git add index.html
git commit -m "Show position-based display numbers instead of internal IDs"
```

---

### Task 3: Model Attribution in Analysis Storage (Backend)

Change analysis storage from bare HTML strings to structured JSON with model metadata. This is a prerequisite for both re-analyze and model attribution display.

**Files:**
- Modify: `netlify/functions/articles.mjs:120-165` (handlePost — analysis storage)
- Modify: `netlify/functions/analysis.mjs` (GET response)

**Step 1: Add `MODEL_ID` constant and update analysis storage in `articles.mjs`**

At the top of `articles.mjs` (after imports), add:

```javascript
const MODEL_ID = "gemini-3.1-pro-preview";
```

Then in `handlePost`, replace lines 163-165:

```javascript
        // Store analysis
        const analyses = getStore("analyses");
        await analyses.set(String(id), parsed.analysis);
```

with:

```javascript
        // Store analysis with model metadata
        const analyses = getStore("analyses");
        await analyses.setJSON(String(id), {
          html: parsed.analysis,
          model: MODEL_ID,
          analyzedAt: new Date().toISOString(),
        });
```

Also update `handlePost` to use `MODEL_ID` in the Gemini call. Replace line 125:

```javascript
          model: "gemini-3.1-pro-preview",
```

with:

```javascript
          model: MODEL_ID,
```

**Step 2: Update `analysis.mjs` to handle both formats**

Replace the entire content of `netlify/functions/analysis.mjs`:

```javascript
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "ID parameter required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = getStore("analyses");

  // Try JSON first (new format), fall back to plain string (legacy)
  let analysis = await store.get(id, { type: "json" }).catch(() => null);
  if (analysis && analysis.html) {
    // New format: { html, model, analyzedAt }
    return new Response(JSON.stringify({ id: Number(id), ...analysis }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Legacy format: plain HTML string
  const legacyAnalysis = await store.get(id);
  if (!legacyAnalysis) {
    return new Response(JSON.stringify({ error: "Analysis not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ id: Number(id), html: legacyAnalysis }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
```

**Step 3: Commit**

```bash
git add netlify/functions/articles.mjs netlify/functions/analysis.mjs
git commit -m "Store analysis as structured JSON with model metadata"
```

---

### Task 4: Model Attribution Display (Frontend)

Update the frontend to parse the new analysis format and show model attribution.

**Files:**
- Modify: `index.html:1823-1835` (`loadAnalysis`)
- Modify: `index.html:2407` (analysis content rendering in `renderPapers`)

**Step 1: Add `analysisMetaCache` state**

At `index.html:1847`, after `let analysisOpen = {};`, add:

```javascript
let analysisMetaCache = {};
```

**Step 2: Update `loadAnalysis` to handle structured response**

Replace `index.html:1823-1836`:

```javascript
async function loadAnalysis(id) {
  if (analysisCache[id]) return analysisCache[id];
  try {
    const res = await fetch(`/.netlify/functions/analysis?id=${id}`);
    if (res.ok) {
      const data = await res.json();
      // New format returns { html, model, analyzedAt }, legacy returns { analysis }
      const html = data.html || data.analysis || '';
      analysisCache[id] = html;
      if (data.model) {
        analysisMetaCache[id] = { model: data.model, analyzedAt: data.analyzedAt };
      }
      return html;
    }
  } catch (e) {
    console.error(`Failed to load analysis for ${id}:`, e);
  }
  return '';
}
```

**Step 3: Show model attribution in rendered analysis**

Replace `index.html:2407`:

```javascript
    const analysisContent = p.hasAnalysis && analysisOpen[p.id] ? (analysisCache[p.id] || '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading analysis...</div>') : '';
```

with:

```javascript
    let analysisContent = '';
    if (p.hasAnalysis && analysisOpen[p.id]) {
      const html = analysisCache[p.id] || '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading analysis...</div>';
      const meta = analysisMetaCache[p.id];
      const attribution = meta ? `<div style="padding:8px 16px;font-size:11px;color:var(--text-muted);opacity:0.7;">Analyzed by ${meta.model}${meta.analyzedAt ? ' on ' + new Date(meta.analyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>` : '';
      analysisContent = html + attribution;
    }
```

**Step 4: Test manually**

1. Add a new article — after analysis completes, expand it. The attribution line "Analyzed by gemini-3.1-pro-preview on Mar 3, 2026" should appear below the analysis.
2. If any legacy articles exist (bare string analyses), they should render normally with no attribution line.

**Step 5: Commit**

```bash
git add index.html
git commit -m "Display model attribution on analysis panels"
```

---

### Task 5: Re-Analyze Backend Route

Add a reanalyze path to `handlePost` in `articles.mjs`.

**Files:**
- Modify: `netlify/functions/articles.mjs:18-21` (POST routing)
- Modify: `netlify/functions/articles.mjs` (add `handleReanalyze` function)

**Step 1: Route reanalyze requests in handlePost dispatch**

Replace `index.html` lines in `articles.mjs:18-21`:

```javascript
  if (method === "POST") {
    return handlePost(req);
  }
```

with:

```javascript
  if (method === "POST") {
    const reanalyzeId = url.searchParams.get("reanalyze");
    if (reanalyzeId) return handleReanalyze(reanalyzeId);
    return handlePost(req);
  }
```

**Step 2: Add `handleReanalyze` function**

Add this function after `handlePost` (after line 188):

```javascript
async function handleReanalyze(id) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive\n\n`));
      }, 5000);

      try {
        // Load existing article
        const store = getStore("articles");
        const article = await store.get(id, { type: "json" });
        if (!article) {
          send({ status: "error", error: "Article not found" });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        send({ status: "fetching" });

        // Re-fetch article content
        const res = await fetch(article.url);
        if (!res.ok) {
          send({ status: "error", error: `Failed to fetch URL (HTTP ${res.status})` });
          clearInterval(heartbeat);
          controller.close();
          return;
        }
        const articleContent = await res.text();

        send({ status: "analyzing" });

        // Call Gemini
        const genAI = new GoogleGenAI({});
        const prompt = buildPrompt(articleContent, article.url, article.tags, article.title, article.note);

        const result = await genAI.models.generateContent({
          model: MODEL_ID,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        let responseText = result.text;
        responseText = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(responseText);
        } catch (e) {
          send({ status: "error", error: "Failed to parse AI response" });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        send({ status: "storing" });

        // Overwrite analysis with new result
        const analyses = getStore("analyses");
        await analyses.setJSON(id, {
          html: parsed.analysis,
          model: MODEL_ID,
          analyzedAt: new Date().toISOString(),
        });

        send({ status: "complete", articleId: Number(id) });
      } catch (e) {
        send({ status: "error", error: e.message || "Unexpected error" });
      }

      clearInterval(heartbeat);
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...corsHeaders(),
    },
  });
}
```

**Step 3: Commit**

```bash
git add netlify/functions/articles.mjs
git commit -m "Add reanalyze backend route with SSE streaming"
```

---

### Task 6: Re-Analyze Frontend

Add the "Re-analyze" button and `reanalyzeArticle()` function.

**Files:**
- Modify: `index.html:2401-2405` (analysis button area in `renderPapers`)
- Modify: `index.html` (add `reanalyzeArticle` function after `deleteArticle`)

**Step 1: Add Re-analyze button next to Analysis button**

Replace `index.html:2401-2405`:

```javascript
    const analysisBtn = p.hasAnalysis
      ? `<button class="action-btn btn-analysis ${analysisOpen[p.id] ? 'open' : ''}" onclick="toggleAnalysis(${p.id})">
           <i data-lucide="chevron-down" style="font-size:12px;margin-right:3px;"></i>${analysisOpen[p.id] ? 'Hide' : 'Analysis'}
         </button>`
      : '';
```

with:

```javascript
    const analysisBtn = p.hasAnalysis
      ? `<button class="action-btn btn-analysis ${analysisOpen[p.id] ? 'open' : ''}" onclick="toggleAnalysis(${p.id})">
           <i data-lucide="chevron-down" style="font-size:12px;margin-right:3px;"></i>${analysisOpen[p.id] ? 'Hide' : 'Analysis'}
         </button>
         <button class="action-btn" onclick="reanalyzeArticle(${p.id})" title="Re-run analysis">
           <i data-lucide="refresh-cw" style="font-size:12px;margin-right:3px;"></i>Re-analyze
         </button>`
      : '';
```

**Step 2: Add `reanalyzeArticle` function**

After `deleteArticle` function (after line 1909), add:

```javascript
function reanalyzeArticle(id) {
  const paper = papers.find(p => p.id === id);
  if (!paper || !confirm(`Re-run analysis for "${paper.title}"?`)) return;

  // Show loading in analysis panel
  analysisOpen[id] = true;
  analysisCache[id] = '<div style="padding:20px;text-align:center;color:var(--text-muted);"><div class="spinner" style="display:inline-block;margin-right:8px;"></div>Re-analyzing...</div>';
  delete analysisMetaCache[id];
  renderPapers();

  fetch(`/.netlify/functions/articles?reanalyze=${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(res => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const statusMessages = {
        fetching: 'Fetching article...',
        analyzing: 'Analyzing with AI...',
        storing: 'Saving new analysis...',
      };

      function processStream() {
        return reader.read().then(({ done, value }) => {
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.status === 'complete') {
                // Clear cache and reload fresh analysis
                delete analysisCache[id];
                delete analysisMetaCache[id];
                loadAnalysis(id).then(() => {
                  renderPapers();
                  if (window.lucide) lucide.createIcons();
                });
                showToast('Analysis updated');
                return;
              }

              if (data.status === 'error') {
                analysisCache[id] = `<div style="padding:20px;text-align:center;color:#e74c3c;">Re-analysis failed: ${data.error}</div>`;
                renderPapers();
                return;
              }

              if (statusMessages[data.status]) {
                analysisCache[id] = `<div style="padding:20px;text-align:center;color:var(--text-muted);"><div class="spinner" style="display:inline-block;margin-right:8px;"></div>${statusMessages[data.status]}</div>`;
                renderPapers();
              }
            } catch (e) { /* skip */ }
          }
          return processStream();
        });
      }

      return processStream();
    })
    .catch(err => {
      analysisCache[id] = `<div style="padding:20px;text-align:center;color:#e74c3c;">Re-analysis failed: ${err.message || 'Network error'}</div>`;
      renderPapers();
    });
}
```

**Step 3: Test manually**

1. Open an article with an existing analysis.
2. Click "Re-analyze" — confirm dialog appears.
3. After confirming, the analysis panel shows loading states (Fetching... Analyzing... Saving...).
4. On completion, the new analysis replaces the old one with model attribution.

**Step 4: Commit**

```bash
git add index.html
git commit -m "Add re-analyze button and SSE streaming for analysis regeneration"
```

---

### Task 7: Final Integration Test

**Step 1: Full flow test**

1. Load the app fresh.
2. Collapse all cards, expand one individually, collapse it again — all works.
3. Verify display numbers are sequential (01, 02, 03...).
4. Delete an article — numbers re-sequence with no gaps.
5. Add a new article — skeleton card appears, analysis completes, model attribution shows.
6. Click "Re-analyze" on an article — loading states cycle, new analysis appears with updated attribution.
7. Toggle dark mode — attribution text is readable in both themes.

**Step 2: Final commit if any fixes needed**

```bash
git add -A
git commit -m "Fix integration issues from card UX and analysis improvements"
```
