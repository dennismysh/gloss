# API Key Auth — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Protect all write endpoints with a secret API key so the site is read-only for visitors.

**Architecture:** A single `GLOSS_API_KEY` env var on Netlify. Backend checks `Authorization: Bearer <key>` on all write endpoints. Frontend stores the key in localStorage, injects it into write requests, and conditionally hides write UI when no key is present.

**Tech Stack:** Vanilla JS frontend, Netlify Functions (ESM), Netlify env vars.

---

### Task 1: Backend Auth Guard

Add a `requireAuth` helper and protect all write endpoints.

**Files:**
- Modify: `netlify/functions/articles.mjs`

**Step 1: Add `requireAuth` helper**

After the `corsHeaders()` function (line 43), add:

```javascript
function requireAuth(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const expected = Netlify.env.get("GLOSS_API_KEY");
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
  return null;
}
```

**Step 2: Guard `handlePost`**

At the top of `handlePost` (before `const body = await req.json()`), add:

```javascript
  const authErr = requireAuth(req);
  if (authErr) return authErr;
```

**Step 3: Guard `handleReanalyze`**

Change the route dispatch to pass `req`:

Replace:
```javascript
    const reanalyzeId = url.searchParams.get("reanalyze");
    if (reanalyzeId) return handleReanalyze(reanalyzeId);
```

With:
```javascript
    const reanalyzeId = url.searchParams.get("reanalyze");
    if (reanalyzeId) return handleReanalyze(reanalyzeId, req);
```

Then update `handleReanalyze` signature and add auth check:

Replace:
```javascript
async function handleReanalyze(id) {
```

With:
```javascript
async function handleReanalyze(id, req) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
```

**Step 4: Guard `handlePatch`**

At the top of `handlePatch` (before `const id = url.searchParams.get("id")`), add:

```javascript
  const authErr = requireAuth(req);
  if (authErr) return authErr;
```

**Step 5: Guard `handleDelete`**

At the top of `handleDelete` (before `const id = url.searchParams.get("id")`), add:

Replace `async function handleDelete(url) {` with:

```javascript
async function handleDelete(url, req) {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
```

And update the route dispatch to pass `req`:

Replace:
```javascript
  if (method === "DELETE") {
    return handleDelete(url);
  }
```

With:
```javascript
  if (method === "DELETE") {
    return handleDelete(url, req);
  }
```

**Step 6: Set the env var on Netlify**

```bash
netlify env:set GLOSS_API_KEY "<generate-a-random-key>" --context production
```

Use a strong random key (e.g., `openssl rand -hex 32`).

**Step 7: Commit**

```bash
git add netlify/functions/articles.mjs
git commit -m "Add API key auth guard on all write endpoints"
```

---

### Task 2: Frontend Auth Helpers and Settings UI

Add API key field to settings modal, auth header helper, and key management.

**Files:**
- Modify: `index.html`

**Step 1: Add `getApiKey` and `authHeaders` helpers**

After the state declarations (after `let collapsedCards = new Set();` around line 1860), add:

```javascript
function getApiKey() {
  return localStorage.getItem('gloss_api_key') || '';
}

function authHeaders() {
  const key = getApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  return headers;
}

function isAdmin() {
  return !!getApiKey();
}
```

**Step 2: Repurpose settings modal**

Replace the settings modal (lines 1711-1740) with:

```html
<!-- Settings Modal -->
<div class="settings-overlay" id="settingsOverlay" onclick="if(event.target===this)closeSettings()">
  <div class="settings-modal">
    <div class="settings-header">
      <span class="settings-title">Settings</span>
      <button class="settings-close" onclick="closeSettings()">×</button>
    </div>
    <div class="settings-body">
      <label class="settings-label">API Key</label>
      <input type="password" class="settings-input" id="apiKeyInput" placeholder="Enter your API key to enable editing" autocomplete="off">
      <p class="settings-hint">Required to add, edit, or delete articles. Leave blank for read-only mode.</p>
      <div class="settings-actions">
        <button class="settings-btn settings-btn-save" onclick="saveApiKey()">Save</button>
        <button class="settings-btn" onclick="clearApiKey()">Clear key</button>
      </div>
      <div class="settings-status" id="settingsStatus"></div>
    </div>
  </div>
</div>
```

**Step 3: Replace `openSettings` / `saveGitHubSettings` with API key functions**

Find and replace the `openSettings`, `closeSettings`, and `saveGitHubSettings` functions with:

```javascript
function openSettings() {
  document.getElementById('apiKeyInput').value = getApiKey();
  document.getElementById('settingsStatus').textContent = '';
  document.getElementById('settingsOverlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
}

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (key) {
    localStorage.setItem('gloss_api_key', key);
    document.getElementById('settingsStatus').textContent = '✓ Key saved — editing enabled';
  } else {
    localStorage.removeItem('gloss_api_key');
    document.getElementById('settingsStatus').textContent = '✓ Key cleared — read-only mode';
  }
  renderPapers();
  if (window.lucide) lucide.createIcons();
}

function clearApiKey() {
  localStorage.removeItem('gloss_api_key');
  document.getElementById('apiKeyInput').value = '';
  document.getElementById('settingsStatus').textContent = '✓ Key cleared — read-only mode';
  renderPapers();
  if (window.lucide) lucide.createIcons();
}
```

**Step 4: Update the settings gear icon**

Replace the GitHub icon button (line 1648):

```html
        <button class="theme-toggle" id="ghSyncStatus" onclick="openSettings()" title="GitHub sync settings" style="font-size:16px;opacity:0.5;"><i data-lucide="github"></i></button>
```

With:

```html
        <button class="theme-toggle" onclick="openSettings()" title="Settings" style="font-size:16px;opacity:0.5;"><i data-lucide="settings"></i></button>
```

**Step 5: Commit**

```bash
git add index.html
git commit -m "Add API key settings UI and auth helpers"
```

---

### Task 3: Inject Auth Headers into Write Requests

Update all fetch calls for POST/PATCH/DELETE to include the auth header.

**Files:**
- Modify: `index.html`

**Step 1: Update `patchArticle`**

Replace line 1895-1901:

```javascript
function patchArticle(id, updates) {
  fetch(`/.netlify/functions/articles?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  }).catch(e => console.error('Failed to patch article:', e));
}
```

With:

```javascript
function patchArticle(id, updates) {
  fetch(`/.netlify/functions/articles?id=${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(updates)
  })
    .then(res => { if (res.status === 401) handleAuthError(); })
    .catch(e => console.error('Failed to patch article:', e));
}
```

**Step 2: Update `deleteArticle`**

Replace the fetch in `deleteArticle` (line 1907):

```javascript
  fetch(`/.netlify/functions/articles?id=${id}`, { method: 'DELETE' })
```

With:

```javascript
  fetch(`/.netlify/functions/articles?id=${id}`, { method: 'DELETE', headers: authHeaders() })
```

Add 401 handling in the `.then`:

```javascript
    .then(res => {
      if (res.status === 401) { handleAuthError(); return; }
      if (!res.ok) throw new Error('Delete failed');
```

**Step 3: Update `reanalyzeArticle`**

Replace the fetch in `reanalyzeArticle` (line 1931):

```javascript
  fetch(`/.netlify/functions/articles?reanalyze=${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
```

With:

```javascript
  fetch(`/.netlify/functions/articles?reanalyze=${id}`, {
    method: 'POST',
    headers: authHeaders(),
  })
```

**Step 4: Update `addArticleViaStream`**

Replace the fetch in `addArticleViaStream` (line 3211-3214):

```javascript
  fetch('/.netlify/functions/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title: title || undefined, note: note || undefined })
  })
```

With:

```javascript
  fetch('/.netlify/functions/articles', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ url, title: title || undefined, note: note || undefined })
  })
```

**Step 5: Add `handleAuthError` function**

After `clearApiKey`, add:

```javascript
function handleAuthError() {
  localStorage.removeItem('gloss_api_key');
  showToast('Invalid API key — editing disabled');
  renderPapers();
  if (window.lucide) lucide.createIcons();
}
```

**Step 6: Commit**

```bash
git add index.html
git commit -m "Inject auth headers into all write requests with 401 handling"
```

---

### Task 4: Conditionally Hide Write UI

Hide add/edit/delete controls when no API key is present.

**Files:**
- Modify: `index.html`

**Step 1: Conditionally show "Add article" button**

Replace line 1685-1687:

```html
    <button class="add-article-btn" onclick="openAddModal()">
      <i data-lucide="plus" style="width:14px;height:14px;"></i> Add article
    </button>
```

With:

```html
    <button class="add-article-btn" onclick="openAddModal()" id="addArticleBtn" style="display:none;">
      <i data-lucide="plus" style="width:14px;height:14px;"></i> Add article
    </button>
```

Then at the bottom of the init section (after `loadPapers()`), add:

```javascript
if (isAdmin()) document.getElementById('addArticleBtn').style.display = '';
```

**Step 2: Conditionally render card write controls in `renderPapers`**

Replace the delete button (line 2569-2571):

```javascript
            <button class="action-btn btn-delete" onclick="deleteArticle(${p.id})" title="Delete article">
              <i data-lucide="trash-2" style="font-size:12px;"></i>
            </button>
```

With:

```javascript
            ${isAdmin() ? `<button class="action-btn btn-delete" onclick="deleteArticle(${p.id})" title="Delete article">
              <i data-lucide="trash-2" style="font-size:12px;"></i>
            </button>` : ''}
```

Replace the read toggle button (line 2566-2568):

```javascript
            <button class="action-btn btn-read ${p.read ? 'marked' : ''}" onclick="toggleRead(${p.id})">
              <i data-lucide="check-circle" style="font-size:12px;margin-right:3px;"></i>${p.read ? 'Read' : 'Mark read'}
            </button>
```

With:

```javascript
            ${isAdmin() ? `<button class="action-btn btn-read ${p.read ? 'marked' : ''}" onclick="toggleRead(${p.id})">
              <i data-lucide="check-circle" style="font-size:12px;margin-right:3px;"></i>${p.read ? 'Read' : 'Mark read'}
            </button>` : ''}
```

Replace the re-analyze button in `analysisBtn` (the second button inside the ternary):

```javascript
         <button class="action-btn" onclick="reanalyzeArticle(${p.id})" title="Re-run analysis">
           <i data-lucide="refresh-cw" style="font-size:12px;margin-right:3px;"></i>Re-analyze
         </button>`
```

With:

```javascript
         ${isAdmin() ? `<button class="action-btn" onclick="reanalyzeArticle(${p.id})" title="Re-run analysis">
           <i data-lucide="refresh-cw" style="font-size:12px;margin-right:3px;"></i>Re-analyze
         </button>` : ''}`
```

Replace the note badge (line 2541) — show note count for visitors but hide "Add note" action:

```javascript
    const noteBadge = `<button class="action-btn" onclick="focusNoteForPaper(${p.id})"><i data-lucide="pen-line" style="font-size:12px;margin-right:3px;"></i>${noteCount > 0 ? noteCount + ' note' + (noteCount !== 1 ? 's' : '') : 'Add note'}</button>`;
```

With:

```javascript
    const noteBadge = isAdmin()
      ? `<button class="action-btn" onclick="focusNoteForPaper(${p.id})"><i data-lucide="pen-line" style="font-size:12px;margin-right:3px;"></i>${noteCount > 0 ? noteCount + ' note' + (noteCount !== 1 ? 's' : '') : 'Add note'}</button>`
      : (noteCount > 0 ? `<span class="action-btn" style="cursor:default;"><i data-lucide="pen-line" style="font-size:12px;margin-right:3px;"></i>${noteCount} note${noteCount !== 1 ? 's' : ''}</span>` : '');
```

Conditionally hide rating stars. Find the `ratingHtml` generation (around line 2085 in `getRatingHtml`). Wrap the interactive stars so visitors see the rating but can't change it.

Find the rating HTML generation and make it read-only when not admin. Replace:

```javascript
    stars += `<span class="rating-star ${i <= current ? 'filled' : ''}" onclick="event.stopPropagation(); setRating(${paperId}, ${i === current ? 0 : i})">★</span>`;
```

With:

```javascript
    stars += isAdmin()
      ? `<span class="rating-star ${i <= current ? 'filled' : ''}" onclick="event.stopPropagation(); setRating(${paperId}, ${i === current ? 0 : i})">★</span>`
      : `<span class="rating-star ${i <= current ? 'filled' : ''}" style="cursor:default;">★</span>`;
```

**Step 3: Commit**

```bash
git add index.html
git commit -m "Hide write UI controls when no API key is present"
```

---

### Task 5: Remove Unused GitHub Sync Code

Clean up the now-unused GitHub sync functions and references.

**Files:**
- Modify: `index.html`

**Step 1: Remove GitHub sync functions**

Delete `testGitHubConnection`, `syncNotesToGitHub`, `pullNotesFromGitHub`, and any related GitHub token/repo localStorage operations that are no longer referenced by the settings modal.

Search for these functions and remove them. Also remove the `#ghSyncStatus` button reference and `#ghSyncSection` if it was in the old modal.

**Step 2: Commit**

```bash
git add index.html
git commit -m "Remove unused GitHub sync code"
```

---

### Task 6: Deploy and Set API Key

**Step 1: Generate and set the API key**

```bash
openssl rand -hex 32
netlify env:set GLOSS_API_KEY "<the-generated-key>" --context production
```

**Step 2: Deploy**

```bash
netlify deploy --prod --no-build
```

**Step 3: Test**

1. Visit the site without an API key in localStorage — should see read-only view (no add/delete/edit controls).
2. Open Settings, paste the API key, save — write controls appear.
3. Add an article — should work.
4. Clear the API key — write controls disappear.
5. Try a write request with a wrong key — should get 401 and toast.

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "Fix integration issues from API key auth"
```
