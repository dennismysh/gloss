# Design: Customize Gloss for Personal Workflow

## Summary

Customize a forked Gloss instance for a mixed reading list (personal interests + professional development), with content ranging from academic papers to blog posts.

## Identity

- **Name:** Gloss (unchanged)
- **Tagline:** "Reading List" (unchanged)
- **Content labels:** "article" / "articles" (neutral for mixed content)

## Colors (from BeanieAndPen)

- **Accent:** `#F25623` (was `#FF5021`)
- **Accent hover:** `#D94A1E` (was `#E8481D`)
- **Teal/secondary:** `#2C5F6F` (unchanged)

## Tags

| Key          | CSS Class        | Label        |
|--------------|------------------|--------------|
| ai           | tag-primary      | AI           |
| rust         | tag-secondary    | Rust         |
| android      | tag-highlight    | Android      |
| systems      | tag-muted        | Systems      |
| architecture | tag-primary      | Architecture |
| tooling      | tag-secondary    | Tooling      |
| web          | tag-highlight    | Web          |
| culture      | tag-muted        | Culture      |

## Features

All enabled: TTS, GitHub sync, voice notes, ratings, streaks, dark mode, queue.

## Content

- Clear 5 sample articles from `content.js`
- Seed with first article: https://www.bbc.com/future/article/20230803-the-town-where-people-live-underground
- Analysis badge: "Article Analysis · TTS Optimized" (unchanged)

## Files Touched

- `config.js` — tags, accent color
- `content.js` — replace sample content with seed article
- `index.html` — add analysis for seed article, update analysisMap
