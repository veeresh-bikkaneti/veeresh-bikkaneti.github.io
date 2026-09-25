/**
 * veer-search-proxy — a minimal Cloudflare Worker that stands between Veer
 * (the client-side chatbot on veeresh-bikkaneti.github.io) and the Brave
 * Search API.
 *
 * Why this exists: Veer is otherwise 100% static client-side JS with no
 * backend. That's fine for everything it does today (resume KB, live GitHub
 * repos, live blog feed) because none of it needs a secret. Web search does:
 * the Brave Search API requires an API key, and a key embedded in public
 * client-side code would be visible to (and abusable by) every visitor. This
 * Worker holds that key server-side instead — it's the smallest possible
 * proxy that fixes that one problem, nothing else.
 *
 * It does NOT call an LLM and holds no LLM API key. The "reasoning" side
 * (deciding whether to search, and turning results into a natural-language
 * answer) happens entirely client-side via Chrome's built-in on-device AI
 * (window.LanguageModel) — see the "webSearch" integration in index.html.
 * That keeps this Worker single-purpose and cheap to run indefinitely on
 * Cloudflare's free tier.
 *
 * Endpoint: GET /?q=<search query>
 * Response: { results: [{ title, url, description }, ...] } — top 5 results,
 * trimmed to just what an LLM needs for grounding (no tracking params, no
 * Brave-specific metadata).
 */

// Restrict CORS to the portfolio's own origin — this proxy has no other
// legitimate caller. Update if the site ever moves to a custom domain.
const ALLOWED_ORIGIN = "https://veeresh-bikkaneti.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, origin);
    }
    if (origin !== ALLOWED_ORIGIN) {
      // Not a hard security boundary (Origin can be spoofed by non-browser
      // clients), just keeps casual/browser-based abuse off the free tier.
      return json({ error: "Origin not allowed" }, 403, origin);
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 400); // cap query length
    if (!q) {
      return json({ error: "Missing ?q= query parameter" }, 400, origin);
    }
    if (!env.BRAVE_API_KEY) {
      return json({ error: "Search proxy is not configured (missing BRAVE_API_KEY secret)" }, 500, origin);
    }

    let braveRes;
    try {
      braveRes = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`,
        { headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_API_KEY } }
      );
    } catch (e) {
      return json({ error: "Upstream search request failed" }, 502, origin);
    }

    if (!braveRes.ok) {
      return json({ error: `Search provider returned ${braveRes.status}` }, 502, origin);
    }

    let data;
    try {
      data = await braveRes.json();
    } catch (e) {
      return json({ error: "Search provider returned an unparseable response" }, 502, origin);
    }

    const results = (data.web?.results || []).slice(0, 5).map(r => ({
      title: r.title || "",
      url: r.url || "",
      description: (r.description || "").replace(/<\/?strong>/g, "") // Brave wraps matched terms in <strong>
    }));

    return json({ results }, 200, origin);
  }
};
