/**
 * Cloudflare Worker: CORS proxy for syosetu / any public URL.
 *
 * Deploy (free):
 *   1. npm i -g wrangler
 *   2. wrangler login
 *   3. cd workers && wrangler deploy
 *
 * Then in the reader site console:
 *   localStorage.setItem('ncodeProxyBase', 'https://YOUR_WORKER.workers.dev/?url=')
 * or open any page with ?proxy=https://YOUR_WORKER.workers.dev/?url=
 */
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const incoming = new URL(request.url);
    let target = incoming.searchParams.get("url") || incoming.searchParams.get("u");

    // Also support /https://example.com path style
    if (!target) {
      const path = incoming.pathname.replace(/^\/+/, "");
      if (path.startsWith("http://") || path.startsWith("https://")) {
        target = path + incoming.search;
      }
    }

    if (!target) {
      return json({ error: "Missing url. Use ?url=https://ncode.syosetu.com/..." }, 400, request);
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return json({ error: "Invalid url" }, 400, request);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return json({ error: "Only http/https allowed" }, 400, request);
    }

    // Optional allowlist — keep open for novel mirrors but block obvious junk schemes already handled.
    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,ja-JP;q=0.9,en;q=0.8",
      Cookie: "over18=yes; sasieno=0",
    });

    try {
      const upstream = await fetch(parsed.toString(), {
        headers,
        redirect: "follow",
        cf: { cacheTtl: 120, cacheEverything: false },
      });

      const body = await upstream.arrayBuffer();
      const responseHeaders = corsHeaders(request);
      responseHeaders.set(
        "Content-Type",
        upstream.headers.get("Content-Type") || "text/html; charset=utf-8"
      );
      responseHeaders.set("Cache-Control", "public, max-age=60");

      return new Response(body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (error) {
      return json({ error: String(error) }, 502, request);
    }
  },
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...Object.fromEntries(corsHeaders(request)),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
