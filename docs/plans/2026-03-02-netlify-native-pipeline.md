# Netlify-Native Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Gloss from GitHub Pages + GitHub Action to a Netlify-native architecture with Blobs storage, AI Gateway processing, and serverless API endpoints.

**Architecture:** Netlify Functions serve as the API layer. Content is stored in Netlify Blobs (free). Claude is called via Netlify AI Gateway (auto-injected credentials). The frontend fetches content dynamically instead of loading static JS files. GitHub remains the code repo only.

**Tech Stack:** Netlify Functions v2 (Web API format), Netlify Blobs, Anthropic SDK via AI Gateway, vanilla JS frontend

**Docs to reference:**
- Design doc: `docs/plans/2026-03-02-netlify-native-pipeline-design.md`
- Netlify Functions v2: uses `Request`/`Response` Web API, `import { Context } from "@netlify/functions"`
- Netlify Blobs: `import { getStore } from "@netlify/blobs"`, methods: `setJSON()`, `get()`, `list()`, `delete()`
- AI Gateway: `import Anthropic from "@anthropic-ai/sdk"` — credentials auto-injected, no config needed
- Analysis template: see `CLAUDE.md` for HTML structure and writing style

---

### Task 1: Add Netlify config and dependencies

**Files:**
- Create: `netlify.toml`
- Create: `package.json`

**Step 1: Create `netlify.toml`**

```toml
[build]
  publish = "."
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
```

**Step 2: Create `package.json`**

```json
{
  "name": "gloss",
  "private": true,
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@netlify/blobs": "^8.1.0",
    "@netlify/functions": "^3.0.0"
  }
}
```

**Step 3: Install dependencies**

Run: `cd "/Users/dennis/programming projects/gloss" && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 4: Add `node_modules/` to `.gitignore`**

Create `.gitignore` if it doesn't exist:
```
node_modules/
```

**Step 5: Commit**

```bash
git add netlify.toml package.json package-lock.json .gitignore
git commit -m "Add Netlify config and dependencies"
```

---

### Task 2: Create the articles GET/LIST function

**Files:**
- Create: `netlify/functions/articles.mjs`

**Step 1: Create the function directory**

Run: `mkdir -p netlify/functions`

**Step 2: Write the articles function with GET handler**

Create `netlify/functions/articles.mjs`:

```javascript
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const method = req.method;
  const url = new URL(req.url);

  if (method === "GET") {
    return handleGet(url);
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
};

async function handleGet(url) {
  const store = getStore("articles");
  const { blobs } = await store.list();

  const articles = [];
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: "json" });
    if (data) articles.push(data);
  }

  articles.sort((a, b) => b.id - a.id);

  return new Response(JSON.stringify(articles), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

**Step 3: Verify locally**

Run: `npx netlify dev`
Then in another terminal: `curl http://localhost:8888/.netlify/functions/articles`
Expected: `[]` (empty array — no articles in Blobs yet)

**Step 4: Commit**

```bash
git add netlify/functions/articles.mjs
git commit -m "Add articles GET function with Netlify Blobs"
```

---

### Task 3: Add POST handler to articles function (add + analyze)

**Files:**
- Modify: `netlify/functions/articles.mjs`

**Step 1: Add auth helper and POST route**

Add to the top of `articles.mjs` after existing imports:

```javascript
import Anthropic from "@anthropic-ai/sdk";
```

Add POST route to the main handler (before the 405 return):

```javascript
  if (method === "POST") {
    return handlePost(req);
  }

  if (method === "PATCH") {
    return handlePatch(req, url);
  }

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }
```

**Step 2: Add helper functions**

Add these functions after `handleGet`:

```javascript
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function checkAuth(req) {
  const token = process.env.GLOSS_API_TOKEN;
  if (!token) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${token}`;
}

async function getNextId() {
  const meta = getStore("meta");
  const index = await meta.get("index", { type: "json" });
  if (index) return index;
  return { nextId: 1, count: 0 };
}

async function saveIndex(index) {
  const meta = getStore("meta");
  await meta.setJSON("index", index);
}
```

**Step 3: Add the POST handler**

```javascript
async function handlePost(req) {
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { url, tags } = body;

  if (!url) {
    return new Response(JSON.stringify({ error: "URL is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch article content
  let articleContent;
  try {
    const res = await fetch(url);
    articleContent = await res.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to fetch URL" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get next ID
  const index = await getNextId();
  const id = index.nextId;

  // Call Claude via AI Gateway
  const anthropic = new Anthropic();
  const prompt = buildPrompt(articleContent, url, tags);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = message.content[0].text;
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to parse Claude response" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Store article
  const article = {
    id,
    title: parsed.title,
    relevance: parsed.relevance,
    url,
    tags: parsed.tags || tags || [],
    read: false,
    hasAnalysis: true,
    createdAt: new Date().toISOString(),
  };

  const articles = getStore("articles");
  await articles.setJSON(String(id), article);

  // Store analysis
  const analyses = getStore("analyses");
  await analyses.set(String(id), parsed.analysis);

  // Update index
  await saveIndex({ nextId: id + 1, count: index.count + 1 });

  return new Response(JSON.stringify(article), {
    status: 201,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
```

**Step 4: Add the prompt builder**

```javascript
function buildPrompt(content, url, suggestedTags) {
  const tagList = suggestedTags ? suggestedTags.join(", ") : "auto-detect from: ai, rust, android, systems, architecture, tooling, web, culture";

  return `You are analyzing an article for a reading list app. Read the following article content and return a JSON object with these fields:

1. "title": The article's title (string)
2. "relevance": A one-sentence description with one key phrase wrapped in <em> tags (string)
3. "tags": An array of 1-3 tags from this list: ai, rust, android, systems, architecture, tooling, web, culture. ${suggestedTags ? `Suggested: ${tagList}` : `Choose the best fit.`}
4. "analysis": The full analysis HTML (string) following the template below

The analysis HTML must follow this exact structure. Write in conversational prose optimized for text-to-speech. No bullet points in the body. Use <span class="highlight">key insight</span> for important ideas and <span class="stat-highlight">42%</span> for citable numbers. Every <p> gets class="tts-paragraph" onclick="ttsSpeak(this)".

Analysis HTML template:
<div class="analysis-panel open">
  <div class="analysis-header">
    <div class="analysis-badge">Article Analysis · TTS Optimized</div>
    <div class="analysis-meta">~X min listen</div>
  </div>
  <div class="tts-controls">
    <button class="tts-btn" onclick="ttsPlayAll()">▶ Play All</button>
    <button class="tts-btn" onclick="ttsPause()">⏸ Pause</button>
    <button class="tts-btn" onclick="ttsStop()">⏹ Stop</button>
    <span class="tts-status">Click any paragraph to start</span>
  </div>
  <div class="tts-vitals">
    <strong>Title:</strong> ...<br>
    <strong>Authors:</strong> ...<br>
    <strong>Source:</strong> ...<br>
    <strong>One-liner:</strong> ...
  </div>
  [5 sections: TL;DR, Core Contribution, Key Insights, Why This Matters, Content Angle]
  [Each section: <div class="tts-section"><div class="tts-section-title">...</div><p class="tts-paragraph" onclick="ttsSpeak(this)">...</p></div><div class="divider"></div>]
</div>

Article URL: ${url}

Article content:
${content.substring(0, 50000)}

Return ONLY valid JSON. No markdown fences. No explanation outside the JSON.`;
}
```

**Step 5: Add PATCH handler for updates**

```javascript
async function handlePatch(req, url) {
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = getStore("articles");
  const article = await store.get(id, { type: "json" });
  if (!article) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates = await req.json();
  const allowed = ["read", "rating", "tags"];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      article[key] = updates[key];
    }
  }

  await store.setJSON(id, article);

  return new Response(JSON.stringify(article), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
```

**Step 6: Update the main handler to include all routes and CORS**

Replace the existing `return new Response` for GET to also include CORS:

In the `handleGet` function, update the response headers to use `...corsHeaders()`.

**Step 7: Verify locally**

Run: `npx netlify dev`
Test POST (without auth for now):
```bash
curl -X POST http://localhost:8888/.netlify/functions/articles \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","tags":["web"]}'
```
Expected: 201 with article JSON (or 422 if example.com content is sparse)

**Step 8: Commit**

```bash
git add netlify/functions/articles.mjs
git commit -m "Add POST/PATCH handlers with AI Gateway integration"
```

---

### Task 4: Create the analysis GET function

**Files:**
- Create: `netlify/functions/analysis.mjs`

**Step 1: Write the analysis function**

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
  const analysis = await store.get(id);

  if (!analysis) {
    return new Response(JSON.stringify({ error: "Analysis not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ id: Number(id), analysis }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
```

**Step 2: Verify locally**

Run: `curl http://localhost:8888/.netlify/functions/analysis?id=1`
Expected: 404 (no analyses stored yet), confirming the function loads

**Step 3: Commit**

```bash
git add netlify/functions/analysis.mjs
git commit -m "Add analysis GET function"
```

---

### Task 5: Create a seed script to migrate existing article to Blobs

**Files:**
- Create: `netlify/functions/seed.mjs`

This is a one-time function to populate Blobs with the existing Coober Pedy article. It will be removed after use.

**Step 1: Write the seed function**

```javascript
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  const token = process.env.GLOSS_API_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const articles = getStore("articles");
  const analyses = getStore("analyses");
  const meta = getStore("meta");

  // Seed article 1
  await articles.setJSON("1", {
    id: 1,
    title: "The Town Where People Live Underground",
    relevance: "How <em>Coober Pedy's underground dwellings</em> offer a glimpse at climate-adapted architecture.",
    url: "https://www.bbc.com/future/article/20230803-the-town-where-people-live-underground",
    tags: ["architecture", "culture"],
    read: false,
    hasAnalysis: true,
    createdAt: "2026-03-02T00:00:00Z",
  });

  // Seed analysis 1 — copy the existing paper1Analysis content from index.html
  // This will be filled in during execution by reading the current analysis from index.html
  const analysis = req.headers.get("x-analysis-source") === "inline"
    ? await req.text()
    : "PLACEHOLDER — run with analysis content in body";

  if (analysis !== "PLACEHOLDER — run with analysis content in body") {
    await analyses.set("1", analysis);
  }

  // Set index
  await meta.setJSON("index", { nextId: 2, count: 1 });

  return new Response(JSON.stringify({ seeded: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

**Step 2: Commit**

```bash
git add netlify/functions/seed.mjs
git commit -m "Add seed function for initial data migration"
```

---

### Task 6: Update index.html to fetch from API

**Files:**
- Modify: `index.html`

This is the biggest change. The site currently loads articles from the `CONTENT` array (via `content.js`) and analyses from inline `paper{N}Analysis` variables. We need to switch to fetching from the API.

**Step 1: Remove the content.js script tag**

Find and remove the `<script src="content.js"></script>` tag from `index.html`.

**Step 2: Remove analysis variables and update papers loading**

Replace the analysis constants block (lines ~1837-1853) and the `papers` declaration with:

```javascript
// ── Content loaded from API ──
let papers = [];
let analysisCache = {};

async function loadArticles() {
  try {
    const res = await fetch('/.netlify/functions/articles');
    if (res.ok) {
      papers = await res.json();
    }
  } catch (e) {
    console.error('Failed to load articles:', e);
    // Fallback to CONTENT array if it exists (for offline/dev)
    if (typeof CONTENT !== 'undefined') {
      papers = CONTENT;
    }
  }
  renderPapers();
}

async function loadAnalysis(id) {
  if (analysisCache[id]) return analysisCache[id];
  try {
    const res = await fetch(\`/.netlify/functions/analysis?id=\${id}\`);
    if (res.ok) {
      const data = await res.json();
      analysisCache[id] = data.analysis;
      return data.analysis;
    }
  } catch (e) {
    console.error(\`Failed to load analysis for \${id}:\`, e);
  }
  return '';
}
```

**Step 3: Update the `renderPapers()` function**

Find the `analysisMap` lookup inside `renderPapers()` and replace it with a reference to `analysisCache`:

Replace:
```javascript
const analysisMap = { 1: paper1Analysis };
const analysisContent = p.hasAnalysis && analysisOpen[p.id] ? (analysisMap[p.id] || '') : '';
```

With:
```javascript
const analysisContent = p.hasAnalysis && analysisOpen[p.id] ? (analysisCache[p.id] || '<div class="analysis-loading">Loading analysis...</div>') : '';
```

**Step 4: Update the card expand function**

Find the `expandCard` function (or equivalent click handler) and add analysis lazy-loading. When a card with `hasAnalysis` is expanded, call `loadAnalysis(id)` and re-render:

After the existing expand logic, add:
```javascript
if (p.hasAnalysis && !analysisCache[p.id]) {
  loadAnalysis(p.id).then(() => renderPapers());
}
```

**Step 5: Call `loadArticles()` on page load**

Find where `renderPapers()` is currently called on page load (likely near the bottom of the script or in a `DOMContentLoaded` handler). Replace the direct `renderPapers()` call with `loadArticles()`.

**Step 6: Verify locally**

Run: `npx netlify dev`
Open: `http://localhost:8888`
Expected: Page loads, shows either articles from Blobs (if seeded) or empty state

**Step 7: Commit**

```bash
git add index.html
git commit -m "Switch frontend to fetch content from Netlify Functions API"
```

---

### Task 7: Remove GitHub Action and queue workflow

**Files:**
- Delete: `.github/workflows/process-queue.yml`
- Delete: `queue.md`

**Step 1: Remove the files**

```bash
rm .github/workflows/process-queue.yml
rm queue.md
rmdir .github/workflows 2>/dev/null
rmdir .github 2>/dev/null
```

**Step 2: Remove `content.js`**

This file is no longer needed as the source of truth. The seed function migrates its data to Blobs.

```bash
rm content.js
```

**Step 3: Commit**

```bash
git add -A
git commit -m "Remove GitHub Action pipeline and static content files"
```

---

### Task 8: Deploy and seed

**Step 1: Push to GitHub**

```bash
git push origin main
```

Netlify will auto-deploy from the push.

**Step 2: Set GLOSS_API_TOKEN in Netlify**

Go to Netlify dashboard → Site settings → Environment variables → Add:
- Key: `GLOSS_API_TOKEN`
- Value: (generate a random token, e.g., `openssl rand -hex 32`)

**Step 3: Run the seed function**

Extract the existing analysis HTML from the current `index.html` (the `paper1Analysis` content) and POST it to the seed endpoint:

```bash
curl -X POST https://YOUR-SITE.netlify.app/.netlify/functions/seed \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: text/plain" \
  -H "x-analysis-source: inline" \
  --data-binary @- <<'ANALYSIS'
[paste the analysis HTML here]
ANALYSIS
```

**Step 4: Verify the site loads articles from Blobs**

Open the deployed site. Confirm:
- The Coober Pedy article appears
- Expanding it shows the analysis
- TTS controls work

**Step 5: Remove the seed function**

```bash
rm netlify/functions/seed.mjs
git add -A
git commit -m "Remove seed function after initial migration"
git push origin main
```

---

### Task 9: Test the full add-article flow

**Step 1: POST a new article via the API**

```bash
curl -X POST https://YOUR-SITE.netlify.app/.netlify/functions/articles \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bbc.com/future/article/20230803-the-town-where-people-live-underground","tags":["architecture","culture"]}'
```

Expected: 201 with article JSON including `id: 2`

**Step 2: Verify on the site**

Refresh the site. The new article should appear immediately (no deploy needed).

**Step 3: Verify analysis loads**

Click the article to expand. Analysis should load from the API.
