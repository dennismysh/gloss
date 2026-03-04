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
