# Customize Gloss Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Customize a forked Gloss instance with personal branding, tags, and a seed article with analysis.

**Architecture:** Config-only changes to `config.js`, `content.js`, and `index.html`. No new files, no structural changes. Replace sample content with real content.

**Tech Stack:** Vanilla JS, HTML, CSS (no build step)

---

### Task 1: Update accent colors in index.html

**Files:**
- Modify: `index.html:27-30` (light mode CSS variables)
- Modify: `index.html:110-111` (dark mode CSS variables)
- Modify: `index.html:47` (light mode tag-primary-bg)
- Modify: `index.html:118` (dark mode tag-primary-bg)

**Step 1: Replace all `#FF5021` hex references with `#F25623`**

Find and replace all occurrences in `index.html`:
- `#FF5021` → `#F25623` (7 occurrences across lines 27, 29, 30, 47, 110, 111, 118)

**Step 2: Replace accent hover color**

- `#E8481D` → `#D94A1E` (line 28)

**Step 3: Verify in browser**

Open `index.html` in browser, confirm orange accent appears slightly warmer/darker.

**Step 4: Commit**

```bash
git add index.html
git commit -m "Update accent colors to match BeanieAndPen branding"
```

---

### Task 2: Update config.js — tags and accent colors

**Files:**
- Modify: `config.js`

**Step 1: Replace the tags object**

Replace the existing tags block (lines 23-28) with:

```javascript
  tags: {
    ai:           ['tag-primary',   'AI'],
    rust:         ['tag-secondary', 'Rust'],
    android:      ['tag-highlight', 'Android'],
    systems:      ['tag-muted',     'Systems'],
    architecture: ['tag-primary',   'Architecture'],
    tooling:      ['tag-secondary', 'Tooling'],
    web:          ['tag-highlight', 'Web'],
    culture:      ['tag-muted',     'Culture'],
  },
```

**Step 2: Update branding colors**

Replace branding block (lines 31-35) with:

```javascript
  branding: {
    accent: "#F25623",
    accent_hover: "#D94A1E",
    teal: "#2C5F6F",
  },
```

**Step 3: Commit**

```bash
git add config.js
git commit -m "Update tags and branding colors in config"
```

---

### Task 3: Replace sample content with seed article

**Files:**
- Modify: `content.js`

**Step 1: Replace the entire CONTENT array**

Replace the full array with a single seed article:

```javascript
const CONTENT = [
  {
    id: 1,
    title: "The Town Where People Live Underground",
    relevance: "How <em>Coober Pedy's underground dwellings</em> offer a glimpse at climate-adapted architecture.",
    pdf: "",
    arxiv: "https://www.bbc.com/future/article/20230803-the-town-where-people-live-underground",
    tags: ["architecture", "culture"],
    read: false,
    hasAnalysis: true
  }
];
```

**Step 2: Commit**

```bash
git add content.js
git commit -m "Replace sample content with seed article"
```

---

### Task 4: Add analysis and clean up analysis variables in index.html

**Files:**
- Modify: `index.html:1838-1852` (analysis variables)
- Modify: `index.html:2376` (analysisMap)

**Step 1: Replace all analysis variables with just paper1Analysis**

Replace lines 1838-1852 (the 8 empty analysis variables) with a single `paper1Analysis` containing the full analysis HTML for the Coober Pedy article. Use the blog post template (5 sections, ~5 min listen).

The analysis content should cover:
- **Title:** The Town Where People Live Underground
- **Authors:** BBC Future
- **Source:** BBC Future
- **One-liner:** How an Australian opal-mining town became a case study in climate-adapted architecture
- **TL;DR:** Coober Pedy — 846km north of Adelaide — where 50% of residents live in underground "dugouts" carved into sandstone, maintaining a constant 23-25C while surface temps exceed 40C. Originally an opal mining necessity, now a model for climate adaptation.
- **Core Contribution:** The dugout concept — homes, churches, hotels, shops all underground. Stable temperature without air conditioning. Started with opal miners in 1915, evolved into a full underground town.
- **Key Insights:** 85% of world's opals come from this region. Underground homes cost about the same as surface construction. Rooms can span huge ceiling areas in the stable soil. Some homes reach 450 sqm underground.
- **Why This Matters:** As climate change pushes surface temperatures higher globally, Coober Pedy's century-old solution becomes increasingly relevant — passive cooling through architecture rather than energy-intensive AC.
- **Content Angle:** The dinner party version — "There's a town in the Australian outback where it gets so hot birds fall from the sky, so half the population just... moved underground."

**Step 2: Update the analysisMap**

Replace line 2376:
```javascript
    const analysisMap = { 1: paper1Analysis };
```

**Step 3: Verify**

Open `index.html` in browser. Confirm:
- One article card shows with "Architecture" and "Culture" tags
- Clicking it opens the analysis panel with TTS controls
- Orange accent color is the updated `#F25623`

**Step 4: Commit**

```bash
git add index.html
git commit -m "Add #1: The Town Where People Live Underground"
```

---

### Task 5: Push to main

**Step 1: Push all commits**

```bash
git push origin main
```
