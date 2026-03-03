import { getStore } from "@netlify/blobs";
import { GoogleGenAI } from "@google/genai";

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

  if (method === "DELETE") {
    return handleDelete(url);
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive\n\n`));
      }, 5000);

      try {
        send({ status: "fetching" });

        // Fetch article content
        const res = await fetch(url);
        if (!res.ok) {
          send({ status: "error", error: `Failed to fetch URL (HTTP ${res.status})` });
          clearInterval(heartbeat);
          controller.close();
          return;
        }
        const articleContent = await res.text();

        send({ status: "analyzing" });

        // Get next ID
        const index = await getNextId();
        const id = index.nextId;

        // Call Gemini via AI Gateway
        const genAI = new GoogleGenAI({});
        const prompt = buildPrompt(articleContent, url, tags, title, note);

        const result = await genAI.models.generateContent({
          model: "gemini-flash-lite-latest",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        let responseText = result.text;
        // Strip markdown fences if model wraps the JSON
        responseText = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(responseText);
        } catch (e) {
          send({ status: "error", error: "Failed to parse Claude response" });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        send({ status: "storing" });

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

        send({ status: "complete", article });
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

async function handleDelete(url) {
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

  await store.delete(id);

  // Also delete the analysis
  const analyses = getStore("analyses");
  await analyses.delete(id);

  // Update count
  const index = await getNextId();
  await saveIndex({ nextId: index.nextId, count: Math.max(0, index.count - 1) });

  return new Response(JSON.stringify({ deleted: true, id: Number(id) }), {
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
${content.substring(0, 30000)}

Return ONLY valid JSON. No markdown fences. No explanation outside the JSON.`;
}
