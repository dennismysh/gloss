import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

export default async (req, context) => {
  const method = req.method;
  const url = new URL(req.url);

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (method === "GET") {
    return handleGet();
  }

  if (method === "POST") {
    return handlePost(req);
  }

  if (method === "PATCH") {
    return handlePatch(req, url);
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
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

async function handleGet() {
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
      ...corsHeaders(),
    },
  });
}

async function handlePost(req) {
  const body = await req.json();
  const { url, tags, title, note } = body;

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
  const prompt = buildPrompt(articleContent, url, tags, title, note);

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
    note: note || '',
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

async function handlePatch(req, url) {
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

function buildPrompt(content, url, suggestedTags, suggestedTitle, readerNote) {
  const tagList = suggestedTags ? suggestedTags.join(", ") : "auto-detect from: ai, rust, android, systems, architecture, tooling, web, culture";
  const titleHint = suggestedTitle ? `\n\nThe reader suggested this title: "${suggestedTitle}". Use it if accurate, otherwise use the actual article title.` : '';
  const noteContext = readerNote ? `\n\nThe reader added this note about why they saved it: "${readerNote}". Keep this context in mind when writing the analysis.` : '';

  return `You are analyzing an article for a reading list app. Read the following article content and return a JSON object with these fields:

1. "title": The article's title (string)
2. "relevance": A one-sentence description with one key phrase wrapped in <em> tags (string)
3. "tags": An array of 1-3 tags from this list: ai, rust, android, systems, architecture, tooling, web, culture. ${suggestedTags ? `Suggested: ${tagList}` : "Choose the best fit."}
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

${titleHint}${noteContext}

Article URL: ${url}

Article content:
${content.substring(0, 50000)}

Return ONLY valid JSON. No markdown fences. No explanation outside the JSON.`;
}
