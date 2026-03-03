// ══════════════════════════════════════════════════
// Gloss Configuration
// Edit this file to customize your reading list.
// ══════════════════════════════════════════════════

const CONFIG = {
  // ── Identity ──
  name: "Gloss",
  tagline: "Reading List",
  subtitle: "Your curated reading list with analysis, notes, and TTS.",

  // ── Content Labels ──
  content: {
    singular: "article",      // Used in: "1 article"
    plural: "articles",       // Used in: "25 articles"
    venue_label: "Source",    // Or: "Conference", "Publication", "Venue"
  },

  // ── Tags ──
  // Define your tag taxonomy. Each tag maps to [css-class, display-label].
  // Content items reference tags by key (e.g., "ai", "design").
  // Tags found in content but not listed here get auto-generated buttons.
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

  // ── Branding ──
  branding: {
    accent: "#F25623",
    accent_hover: "#D94A1E",
    teal: "#2C5F6F",           // Secondary / teal
  },

  // ── Features (toggle on/off) ──
  features: {
    tts: true,
    github_sync: true,
    voice_notes: true,
    ratings: true,
    streaks: true,
    dark_mode: true,
    queue: true,            // Inbox queue for Claude to process
  },

  // ── GitHub Integration ──
  github: {
    default_repo: "dennismysh/gloss",    // e.g., "yourusername/gloss"
    default_path: "notes",     // Subfolder for note files
  },

  // ── Storage ──
  storage: {
    prefix: "gloss-",          // localStorage key prefix
  },

  // ── Analysis ──
  analysis: {
    badge: "Article Analysis · TTS Optimized",
  },
};
