# Rewire Add Article Button — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the localStorage-based "Add to Inbox" flow with a direct POST to the Netlify Functions API, showing a skeleton loading card while the article is being analyzed.

**Architecture:** The modal submits directly to `/.netlify/functions/articles`. A skeleton card appears in the article list while the API processes (~30-60s). On success, the list re-fetches and re-renders. On failure, the skeleton becomes an error card with retry. All old Inbox/queue code is removed.

**Tech Stack:** Vanilla JS, Netlify Functions (ES modules), Netlify Blobs, Anthropic SDK

---

### Task 1: Remove auth from API

**Files:**
- Modify: `netlify/functions/articles.mjs:41-46` (remove `checkAuth` function)
- Modify: `netlify/functions/articles.mjs:82-87` (remove auth check in `handlePost`)
- Modify: `netlify/functions/articles.mjs:165-170` (remove auth check in `handlePatch`)

**Step 1: Remove the `checkAuth` function and its calls**

In `netlify/functions/articles.mjs`, delete the `checkAuth` function (lines 41-46):

```javascript
// DELETE this entire function:
function checkAuth(req) {
  const token = process.env.GLOSS_API_TOKEN;
  if (!token) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${token}`;
}
```

Remove the auth check block at the top of `handlePost` (lines 82-87):

```javascript
// DELETE this block:
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
```

Remove the identical auth check block at the top of `handlePatch` (lines 165-170).

**Step 2: Verify function still loads**

Run: `cd netlify/functions && node -c articles.mjs`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add netlify/functions/articles.mjs
git commit -m "Remove auth checks from articles API"
```

---

### Task 2: Extend API to accept title and note

**Files:**
- Modify: `netlify/functions/articles.mjs` — `handlePost` function and `buildPrompt` function

**Step 1: Update `handlePost` to read title and note from body**

In `handlePost`, update the destructuring on line 90 and pass the new fields through:

Change:
```javascript
  const { url, tags } = body;
```
To:
```javascript
  const { url, tags, title, note } = body;
```

Update the `buildPrompt` call (line 117) to pass the new fields:

Change:
```javascript
  const prompt = buildPrompt(articleContent, url, tags);
```
To:
```javascript
  const prompt = buildPrompt(articleContent, url, tags, title, note);
```

Update the article object (around line 137) to include `note`:

Change:
```javascript
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
```
To:
```javascript
  const article = {
    id,
    title: parsed.title,
    relevance: parsed.relevance,
    url,
    tags: parsed.tags || tags || [],
    read: false,
    hasAnalysis: true,
    note: note || '',
    createdAt: new Date().toISOString(),
  };
```

**Step 2: Update `buildPrompt` to use title and note**

Change the function signature and add context to the prompt:

Change:
```javascript
function buildPrompt(content, url, suggestedTags) {
```
To:
```javascript
function buildPrompt(content, url, suggestedTags, suggestedTitle, readerNote) {
```

Add after the `tagList` line:

```javascript
  const titleHint = suggestedTitle ? `\n\nThe reader suggested this title: "${suggestedTitle}". Use it if accurate, otherwise use the actual article title.` : '';
  const noteContext = readerNote ? `\n\nThe reader added this note about why they saved it: "${readerNote}". Keep this context in mind when writing the analysis.` : '';
```

Then append these to the prompt string, right before the `Article URL:` line:

```javascript
${titleHint}${noteContext}

Article URL: ${url}
```

**Step 3: Verify function still loads**

Run: `cd netlify/functions && node -c articles.mjs`
Expected: No syntax errors

**Step 4: Commit**

```bash
git add netlify/functions/articles.mjs
git commit -m "Extend articles API to accept title and note fields"
```

---

### Task 3: Add skeleton card CSS

**Files:**
- Modify: `index.html` — CSS section, after the `.add-article-btn:hover` block (around line 1426)

**Step 1: Add skeleton card and error card styles**

Insert after the `.add-article-btn:hover { ... }` block (line 1426), replacing the old `/* Inbox Panel */` comment and all inbox/queue CSS (lines 1428-1549):

```css
  /* Skeleton Loading Card */
  .skeleton-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-xl) var(--space-xl) var(--space-lg);
    margin-bottom: var(--space-md);
    max-width: var(--max-width);
    margin-left: auto;
    margin-right: auto;
    animation: cardIn 0.3s var(--ease-out) both;
  }
  .skeleton-card .skeleton-label {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--accent);
    margin-bottom: var(--space-md);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .skeleton-card .skeleton-label .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .skeleton-card .skeleton-url {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-tertiary);
    margin-bottom: var(--space-md);
    word-break: break-all;
  }
  .skeleton-card .skeleton-url a {
    color: var(--text-tertiary);
    text-decoration: none;
  }
  .skeleton-card .skeleton-url a:hover { color: var(--accent); }
  .skeleton-line {
    height: 14px;
    background: linear-gradient(90deg, var(--bg-sunken) 25%, var(--bg-hover) 50%, var(--bg-sunken) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
    margin-bottom: var(--space-sm);
  }
  .skeleton-line.title { width: 65%; height: 18px; margin-bottom: var(--space-md); }
  .skeleton-line.relevance { width: 90%; }
  .skeleton-line.tags { width: 40%; height: 12px; margin-top: var(--space-md); }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* Error Card */
  .skeleton-card.error {
    border-color: var(--rose);
    border-style: dashed;
  }
  .skeleton-card.error .skeleton-label {
    color: var(--rose);
  }
  .skeleton-card .error-message {
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--rose);
    margin-bottom: var(--space-md);
  }
  .skeleton-card .retry-btn {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 14px;
    border: 1px solid var(--rose);
    border-radius: var(--radius-sm);
    background: var(--rose-subtle);
    color: var(--rose);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }
  .skeleton-card .retry-btn:hover {
    background: var(--rose);
    color: white;
  }
  .skeleton-card .dismiss-btn {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    margin-left: var(--space-sm);
    transition: all var(--duration-fast) var(--ease-out);
  }
  .skeleton-card .dismiss-btn:hover {
    border-color: var(--text-secondary);
    color: var(--text-secondary);
  }
```

**Step 2: Delete all old inbox/queue CSS**

Delete everything from `/* Inbox Panel */` (line 1428) through `.queue-done-btn:hover { ... }` (line 1549), since the new skeleton CSS replaces it.

**Step 3: Commit**

```bash
git add index.html
git commit -m "Add skeleton and error card CSS, remove inbox/queue CSS"
```

---

### Task 4: Remove Inbox HTML and update modal text

**Files:**
- Modify: `index.html` — HTML section

**Step 1: Remove Inbox tab button**

Find the view-tabs section (lines 1707-1718). Remove the Inbox button (lines 1711-1714):

```html
<!-- DELETE these lines: -->
    <button class="view-tab" data-view="inbox" onclick="switchView('inbox')">
      <i data-lucide="inbox" style="width:14px;height:14px;"></i> Inbox
      <span class="tab-badge" id="inboxBadge"></span>
    </button>
```

**Step 2: Remove the inbox panel div**

Delete lines 1740-1742:

```html
<!-- DELETE these lines: -->
  <div class="inbox-panel" id="inboxPanel">
    <div class="inbox-list" id="inboxList"></div>
  </div>
```

**Step 3: Update modal text**

On line 1782, change:
```html
<div class="add-modal-title"><i data-lucide="plus-circle" style="width:18px;height:18px;color:var(--accent);"></i> Add to Inbox</div>
```
To:
```html
<div class="add-modal-title"><i data-lucide="plus-circle" style="width:18px;height:18px;color:var(--accent);"></i> Add Article</div>
```

On line 1797, change:
```html
<button class="add-modal-submit" id="addSubmitBtn" onclick="submitAddArticle()">Add to queue</button>
```
To:
```html
<button class="add-modal-submit" id="addSubmitBtn" onclick="submitAddArticle()">Add article</button>
```

Delete the hint div (lines 1799-1801):
```html
<!-- DELETE these lines: -->
    <div class="add-modal-hint">
      <strong>Tip:</strong> Tell Claude <em>"Check my Gloss inbox"</em> and it will read &amp; summarize everything in your queue. Articles are saved to <code>queue.md</code> in your GitHub notes folder.
    </div>
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "Remove Inbox tab and panel, update modal text"
```

---

### Task 5: Remove Inbox/Queue JavaScript

**Files:**
- Modify: `index.html` — JS section

**Step 1: Remove queue/inbox functions**

Delete the entire `// ── Queue / Inbox ──` section (lines 3012-3201), which includes:
- `QUEUE_KEY` constant
- `getQueue()`
- `saveQueue()`
- `updateInboxBadge()`
- `switchView()` — but NOTE: we still need `switchView` without the inbox logic, so **rewrite it** instead of deleting
- `renderInbox()`
- `removeFromQueue()`
- `markQueueDone()`
- `pushQueueToGitHub()`

Replace the entire block (lines 3012-3201) with a simplified `switchView`:

```javascript
// ── View Switching ──
function switchView(view) {
  // No-op — single view (library) only
}
```

**Step 2: Remove `updateInboxBadge()` from init**

On line 3213, delete:
```javascript
updateInboxBadge();
```

**Step 3: Commit**

```bash
git add index.html
git commit -m "Remove inbox/queue JS, simplify switchView"
```

---

### Task 6: Rewrite submitAddArticle to call the API

**Files:**
- Modify: `index.html` — JS section, `submitAddArticle()` function (currently lines 3106-3130)

**Step 1: Replace `submitAddArticle` with the new API-calling version**

Replace the existing `submitAddArticle()` function with:

```javascript
function submitAddArticle() {
  const url = document.getElementById('addUrl').value.trim();
  if (!url) return;

  const note = document.getElementById('addNote').value.trim();
  const title = document.getElementById('addTitle').value.trim();

  closeAddModal();

  // Insert skeleton card at the top of the paper list
  const paperList = document.getElementById('paperList');
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-card';
  skeleton.innerHTML = `
    <div class="skeleton-label"><div class="spinner"></div> Analyzing article...</div>
    <div class="skeleton-url"><a href="${url}" target="_blank" rel="noopener">${url}</a></div>
    <div class="skeleton-line title"></div>
    <div class="skeleton-line relevance"></div>
    <div class="skeleton-line relevance" style="width:70%"></div>
    <div class="skeleton-line tags"></div>
  `;
  paperList.prepend(skeleton);

  // Call the API
  fetch('/.netlify/functions/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title: title || undefined, note: note || undefined })
  })
    .then(res => {
      if (!res.ok) return res.json().then(e => Promise.reject(e));
      return res.json();
    })
    .then(article => {
      // Success — reload article list
      skeleton.remove();
      papers.unshift(article);
      renderPapers();
      updateStats();
      showToast('Article added');
      if (window.lucide) lucide.createIcons();
    })
    .catch(err => {
      // Error — transform skeleton into error card
      const message = (err && err.error) || 'Something went wrong. The article may be paywalled or unavailable.';
      skeleton.classList.add('error');
      skeleton.innerHTML = `
        <div class="skeleton-label">Failed to add article</div>
        <div class="skeleton-url"><a href="${url}" target="_blank" rel="noopener">${url}</a></div>
        <div class="error-message">${message}</div>
        <div>
          <button class="retry-btn" onclick="retryAddArticle(this, '${url.replace(/'/g, "\\'")}', '${(title || '').replace(/'/g, "\\'")}', '${(note || '').replace(/'/g, "\\'")}')">Retry</button>
          <button class="dismiss-btn" onclick="this.closest('.skeleton-card').remove()">Dismiss</button>
        </div>
      `;
    });
}

function retryAddArticle(btn, url, title, note) {
  const skeleton = btn.closest('.skeleton-card');
  skeleton.classList.remove('error');
  skeleton.innerHTML = `
    <div class="skeleton-label"><div class="spinner"></div> Analyzing article...</div>
    <div class="skeleton-url"><a href="${url}" target="_blank" rel="noopener">${url}</a></div>
    <div class="skeleton-line title"></div>
    <div class="skeleton-line relevance"></div>
    <div class="skeleton-line relevance" style="width:70%"></div>
    <div class="skeleton-line tags"></div>
  `;

  fetch('/.netlify/functions/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title: title || undefined, note: note || undefined })
  })
    .then(res => {
      if (!res.ok) return res.json().then(e => Promise.reject(e));
      return res.json();
    })
    .then(article => {
      skeleton.remove();
      papers.unshift(article);
      renderPapers();
      updateStats();
      showToast('Article added');
      if (window.lucide) lucide.createIcons();
    })
    .catch(err => {
      const message = (err && err.error) || 'Something went wrong. The article may be paywalled or unavailable.';
      skeleton.classList.add('error');
      skeleton.innerHTML = `
        <div class="skeleton-label">Failed to add article</div>
        <div class="skeleton-url"><a href="${url}" target="_blank" rel="noopener">${url}</a></div>
        <div class="error-message">${message}</div>
        <div>
          <button class="retry-btn" onclick="retryAddArticle(this, '${url.replace(/'/g, "\\'")}', '${(title || '').replace(/'/g, "\\'")}', '${(note || '').replace(/'/g, "\\'")}')">Retry</button>
          <button class="dismiss-btn" onclick="this.closest('.skeleton-card').remove()">Dismiss</button>
        </div>
      `;
    });
}
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "Rewire submitAddArticle to POST to API with skeleton card"
```

---

### Task 7: Deploy and test

**Step 1: Deploy to Netlify**

Run: `netlify deploy --prod`
Expected: Successful deploy

**Step 2: Manual test — open the site**

Open: `https://gloss-reader.netlify.app`
Verify:
- No Inbox tab visible
- "Add article" button visible next to Library tab
- Clicking "Add article" opens modal with title "Add Article" and submit button "Add article"

**Step 3: Manual test — add an article**

Enter a URL (e.g., a short blog post) and click "Add article".
Verify:
- Modal closes
- Skeleton card appears at top of list with shimmer animation and the URL
- After ~30-60 seconds, skeleton is replaced with the real article card
- Toast shows "Article added"

**Step 4: Commit deploy verification**

No code changes — just verify the deployment works end-to-end.
