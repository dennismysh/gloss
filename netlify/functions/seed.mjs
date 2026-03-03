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

  // Seed analysis 1
  const analysis = req.headers.get("x-analysis-source") === "inline"
    ? await req.text()
    : "PLACEHOLDER";

  if (analysis !== "PLACEHOLDER") {
    await analyses.set("1", analysis);
  }

  // Set index
  await meta.setJSON("index", { nextId: 2, count: 1 });

  return new Response(JSON.stringify({ seeded: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
