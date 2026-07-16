/**
 * Cloudflare Worker: CORS proxy for syosetu / kakuyomu public pages.
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
const ALLOWED_HOSTS = new Set([
  "ncode.syosetu.com",
  "novel18.syosetu.com",
  "api.syosetu.com",
  "syosetu.com",
  "www.syosetu.com",
  "kakuyomu.jp",
  "www.kakuyomu.jp",
]);

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Only GET/HEAD allowed" }, 405, request);
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

    if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return json({ error: `Host not allowed: ${parsed.hostname}` }, 403, request);
    }

    const isApi = parsed.hostname.includes("api.syosetu.com");
    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: isApi
        ? "application/json,text/javascript,*/*;q=0.8"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        upstream.headers.get("Content-Type") || (isApi ? "application/json; charset=utf-8" : "text/html; charset=utf-8")
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
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
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
