# Claude Code Instructions — Gloss

## What This Repo Is

Gloss is a configurable reading list and note-taking app that runs on GitHub Pages. It's a single-page app with no build step — one HTML file (`index.html`), one config file (`config.js`), and one content file (`content.js`).

When a user adds a URL to the reading queue, you:
1. Fetch and read the article
2. Synthesize it into a TTS-optimized analysis
3. Add the article + analysis to the reading list
4. Commit and push

## Two Workflows

### Workflow 1: Queue (automated via GitHub Action)

The user adds URLs to `queue.md` under `## Pending` (one per line). A GitHub Action detects the change and runs Claude Code to process them.

When processing the queue:
1. Read `queue.md` and find all URLs under `## Pending`
2. For each URL, follow the steps in Workflow 2 below
3. After each article is successfully added, move its URL from `## Pending` to `## Processed` in `queue.md`, prefixed with the article number (e.g., `- #6 https://example.com`)
4. If a URL cannot be fetched (paywalled, 404, etc.), leave it in Pending with a note: `- https://... (fetch failed — retry later)`
5. Commit after each article

### Workflow 2: Direct (user gives you a URL)

When the user gives you a URL directly:

1. **Fetch and read the article** using WebFetch or by downloading the PDF
2. **Determine the next article ID** — look at the `CONTENT` array in `content.js` and find the highest existing `id`, then use `id + 1`
3. **Add the article to `content.js`** — append a new object to the `CONTENT` array
4. **Write the analysis** as a template literal `const paper{N}Analysis = \`...\`;` in `index.html` — insert it right before the `// ── Papers Data ──` comment (or after the last existing `paper{N}Analysis` variable)
5. **Update the `analysisMap`** object in the `renderPapers()` function to include the new ID and analysis variable
6. **Commit and push** to `main`

## File Structure

```
index.html              ← The app (single-file HTML/CSS/JS, ~3000 lines)
config.js               ← Branding, tags, feature toggles, GitHub defaults
content.js              ← The CONTENT array — all articles live here
queue.md                ← URL queue — add URLs here to trigger processing
notes/                  ← Exported reading notes (markdown, synced by the app)
notes/README.md         ← Reading progress summary
notes/queue.md          ← App-synced queue (may differ from root queue.md)
skills/                 ← Claude skill files for interactive use
logo.svg                ← Site logo
LICENSE                 ← MIT
README.md               ← Project overview
.github/workflows/
  process-queue.yml     ← GitHub Action that triggers Claude Code on queue changes
```

## How to Edit Files

### Adding an article to `content.js`

Append a new object to the end of the `CONTENT` array:

```javascript
  {
    id: {N},
    title: "Full Article Title",
    relevance: "One-sentence <em>relevance description</em> with key phrase emphasized.",
    pdf: "https://link-to-pdf-or-article",
    arxiv: "https://link-to-source",    // optional — original source URL
    tags: ["tag1", "tag2"],              // use existing tags from config.js or create new ones
    read: false,
    hasAnalysis: true                    // set to true if you're adding an analysis
  }
```

Tags are defined in `config.js` under `CONFIG.tags` but any new tag will auto-render.

### Adding an analysis to `index.html`

Find the existing `paper{N}Analysis` variables (around line 1838+). Add your new one after the last existing analysis variable:

```javascript
const paper{N}Analysis = `
<div class="analysis-panel open">
  <!-- analysis HTML here — see template below -->
</div>
`;
```

Then find the `analysisMap` object inside the `renderPapers()` function and add the new entry:

```javascript
const analysisMap = { 1: paper1Analysis, ..., {N}: paper{N}Analysis };
```

## Analysis HTML Template

Every analysis must follow this structure. Write in **conversational prose** optimized for text-to-speech. No bullet points in the body — use flowing paragraphs.

```html
<div class="analysis-panel open">
  <div class="analysis-header">
    <div class="analysis-badge">{CONFIG.analysis.badge}</div>
    <div class="analysis-meta">~{X} min listen</div>
  </div>

  <div class="tts-controls">
    <button class="tts-btn" onclick="ttsPlayAll()">▶ Play All</button>
    <button class="tts-btn" onclick="ttsPause()">⏸ Pause</button>
    <button class="tts-btn" onclick="ttsStop()">⏹ Stop</button>
    <span class="tts-status">Click any paragraph to start</span>
  </div>

  <div class="tts-vitals">
    <strong>Title:</strong> {title}<br>
    <strong>Authors:</strong> {authors}<br>
    <strong>Source:</strong> {venue / publication / blog}<br>
    <strong>One-liner:</strong> {single sentence summary}
  </div>

  <div class="tts-section">
    <div class="tts-section-title">TL;DR — Why You Should Care</div>
    <p class="tts-paragraph" onclick="ttsSpeak(this)">{2-3 paragraphs}</p>
  </div>

  <div class="divider"></div>

  <div class="tts-section">
    <div class="tts-section-title">The Core Contribution</div>
    <p class="tts-paragraph" onclick="ttsSpeak(this)">{what the work contributes}</p>
  </div>

  <div class="divider"></div>

  <div class="tts-section">
    <div class="tts-section-title">Key Insights and Evaluation</div>
    <p class="tts-paragraph" onclick="ttsSpeak(this)">{strengths, weaknesses, evidence}</p>
  </div>

  <div class="divider"></div>

  <div class="tts-section">
    <div class="tts-section-title">Why This Matters</div>
    <p class="tts-paragraph" onclick="ttsSpeak(this)">{practical implications, connections}</p>
  </div>

  <div class="divider"></div>

  <div class="tts-section">
    <div class="tts-section-title">Content Angle</div>
    <p class="tts-paragraph" onclick="ttsSpeak(this)">{the dinner party version — how to explain this to someone}</p>
  </div>
</div>
```

### Section Guide

For **academic papers**, use all sections and add:
- **Paper Evaluation** — Strengths and weaknesses
- **Similar Reading** — Key references from the paper's own citations only
- **Empirical Evidence Worth Citing** — Stats useful in writing/presentations
- **Industry vs. Theory** — Practical applicability

For **blog posts / news / non-academic content**, use the lighter 5-section structure shown above.

### Detecting Content Type

Determine analysis depth from the source:
- **arxiv.org, ACM DL, IEEE, conference proceedings** → Academic paper (deep, 8 sections, ~12 min)
- **News sites, product announcements, funding rounds** → News article (quick, 5 sections, ~3 min)
- **Substack, Medium, personal blogs, essays** → Blog post (medium, 5 sections, ~5 min)
- **API docs, whitepapers, technical specs** → Technical doc (medium, 6 sections, ~7 min)

## Writing Style

- Conversational, second-person ("you") prose — like explaining to a smart friend
- Optimized for TTS listening — spell out numbers, avoid acronym soup
- No bullet points in analysis body — use flowing paragraphs
- Use `<span class="highlight">key insight here</span>` for important ideas
- Use `<span class="stat-highlight">42% improvement</span>` for citable numbers
- Every `<p>` gets `class="tts-paragraph" onclick="ttsSpeak(this)"`
- Escape backticks in the analysis text since it lives inside a JS template literal (use `\``)
- Short-to-medium sentences — long compound sentences are hard to follow in audio

## Config Awareness

Read `config.js` before processing. Key fields:
- `CONFIG.name` — the site name (use in badge text)
- `CONFIG.content.singular / plural` — "article" vs "paper" etc.
- `CONFIG.tags` — existing tag taxonomy
- `CONFIG.analysis.badge` — text for the analysis header badge
- `CONFIG.github.default_repo` — the repo to sync with
- `CONFIG.github.default_path` — the notes subfolder

## Git Workflow

- Always commit and push to `main` after adding an article
- Commit message format: `Add #{N}: {Short Title}`
- One article per commit
- When processing multiple queue items, commit after each one
