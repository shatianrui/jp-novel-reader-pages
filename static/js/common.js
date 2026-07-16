const NAROU_API_BASE = "https://api.syosetu.com/novelapi/api/";
const READING_PROGRESS_KEY = "readingProgress";
const BOOKSHELF_KEY = "bookshelf";
const PROXY_STORAGE_KEY = "ncodeProxyBase";
const PROXY_WINNER_KEY = "ncodeProxyWinner";
const API_CACHE_KEY = "narouApiCache";
const API_BLOCKED_KEY = "narouApiBlocked";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const JSONP_TIMEOUT_MS = 2500;
const PROXY_TIMEOUT_MS = 5000;

// Public CORS proxies. Override via localStorage ncodeProxyBase or ?proxy=
const DEFAULT_PROXY_BUILDERS = [
  (url) => `https://proxy.cors.sh/${url}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://cors.eu.org/${url}`,
];

const GENRE_MAP = {
  "101": "异世界·恋爱", "102": "现实世界·恋爱",
  "201": "高幻想·奇幻", "202": "低幻想·奇幻",
  "301": "纯文学", "302": "人情剧", "303": "历史",
  "304": "推理", "305": "恐怖", "306": "动作", "307": "喜剧",
  "401": "VR游戏", "402": "宇宙", "403": "科幻", "404": "惊悚",
  "9901": "童话", "9902": "诗歌", "9903": "随笔",
  "9904": "对战记录", "9999": "其他", "9801": "无分类",
};

const GENRE_ICON = {
  "101": "💕", "102": "💝", "201": "⚔️", "202": "🌿",
  "301": "📚", "302": "🎭", "303": "🏯", "304": "🔍",
  "305": "👻", "306": "💥", "307": "😂",
  "401": "🎮", "402": "🚀", "403": "🔬", "404": "⚡",
  "9901": "🧸", "9902": "🌸", "9903": "✍️", "9999": "📖", "9801": "📄",
};

function parsePositiveInt(value, defaultValue = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatLength(length) {
  return length >= 100000 ? `${Math.floor(length / 10000)}万字` : `${length}字`;
}

function enrichNovel(novel) {
  const genre = String(novel.genre ?? "");
  const length = Number(novel.length || 0);
  return {
    ...novel,
    genre_name: GENRE_MAP[genre] || "其他",
    genre_icon: GENRE_ICON[genre] || "📖",
    is_completed: Number(novel.end || 0) === 1,
    is_series: Number(novel.noveltype || 1) === 1,
    length_label: formatLength(length),
  };
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function buildLocalUrl(page, params = {}) {
  const url = new URL(page, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  });
  return `${url.pathname.split("/").pop()}${url.search}`;
}

function getNovelUrl(ncode) {
  return buildLocalUrl("novel.html", { ncode: ncode.toLowerCase() });
}

function getReadUrl(ncode, chapter) {
  return buildLocalUrl("read.html", { ncode: ncode.toLowerCase(), chapter });
}

function getOriginIndexUrl(ncode, page) {
  const base = `https://ncode.syosetu.com/${String(ncode).toLowerCase()}/`;
  return page && page > 1 ? `${base}?p=${page}` : base;
}

function getOriginChapterUrl(ncode, chapter) {
  return `${getOriginIndexUrl(ncode)}${chapter}/`;
}

function getCustomProxyBase() {
  const fromQuery = getQueryParam("proxy").trim();
  if (fromQuery) {
    return fromQuery.endsWith("/") ? fromQuery : `${fromQuery}/`;
  }
  try {
    const stored = localStorage.getItem(PROXY_STORAGE_KEY);
    if (stored) {
      return stored.endsWith("/") ? stored : `${stored}/`;
    }
  } catch (error) {
    // ignore
  }
  return "";
}

function buildProxyCandidates(targetUrl) {
  const builders = [];
  const custom = getCustomProxyBase();
  if (custom) {
    builders.push(() => {
      // Support both prefix style (proxy/URL) and query style (...?url=)
      if (custom.includes("?") || custom.endsWith("=")) {
        return `${custom}${encodeURIComponent(targetUrl)}`;
      }
      return `${custom}${targetUrl}`;
    });
  }
  DEFAULT_PROXY_BUILDERS.forEach((fn) => builders.push(() => fn(targetUrl)));
  return builders;
}

function looksLikeBlockedOrErrorPage(html) {
  if (!html || html.length < 200) {
    return true;
  }
  const sample = html.slice(0, 800).toLowerCase();
  if (sample.includes("403 forbidden") || sample.includes("access denied")) {
    return true;
  }
  if (sample.includes("just a moment") && sample.includes("cloudflare")) {
    return true;
  }
  if (sample.includes("rate limit exceeded")) {
    return true;
  }
  // Real syosetu pages (old or new markup) contain at least one of these.
  const hasNovelMarkup =
    html.includes("p-eplist") ||
    html.includes("index_box") ||
    html.includes("p-novel__body") ||
    html.includes("novel_honbun") ||
    html.includes("p-novel__title") ||
    html.includes("novel_subtitle") ||
    html.includes("ncode.syosetu.com");
  return !hasNovelMarkup;
}

function cleanNarouParams(params, outMode) {
  const cleanParams = { ...params, out: outMode };
  Object.keys(cleanParams).forEach((key) => {
    if (cleanParams[key] === "" || cleanParams[key] == null) {
      delete cleanParams[key];
    }
  });
  return cleanParams;
}

function apiCacheKey(params) {
  const clean = cleanNarouParams(params, "json");
  return JSON.stringify(Object.keys(clean).sort().reduce((acc, key) => {
    acc[key] = clean[key];
    return acc;
  }, {}));
}

function readApiCache(params) {
  try {
    const raw = sessionStorage.getItem(API_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const hit = map[apiCacheKey(params)];
    if (!hit || !hit.expiresAt || hit.expiresAt < Date.now()) {
      return null;
    }
    return hit.data;
  } catch (error) {
    return null;
  }
}

function writeApiCache(params, data) {
  try {
    const raw = sessionStorage.getItem(API_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[apiCacheKey(params)] = { data, expiresAt: Date.now() + API_CACHE_TTL_MS };
    const keys = Object.keys(map);
    if (keys.length > 30) {
      keys.slice(0, keys.length - 30).forEach((key) => delete map[key]);
    }
    sessionStorage.setItem(API_CACHE_KEY, JSON.stringify(map));
  } catch (error) {
    // ignore quota
  }
}

function isApiMarkedBlocked() {
  try {
    return localStorage.getItem(API_BLOCKED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function markApiBlocked(blocked) {
  try {
    if (blocked) {
      localStorage.setItem(API_BLOCKED_KEY, "1");
    } else {
      localStorage.removeItem(API_BLOCKED_KEY);
    }
  } catch (error) {
    // ignore
  }
}

function fetchWithTimeout(url, options = {}, timeoutMs = PROXY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}

function reorderProxyBuilders(builders) {
  let winner = "";
  try {
    winner = localStorage.getItem(PROXY_WINNER_KEY) || "";
  } catch (error) {
    winner = "";
  }
  if (!winner) {
    return builders;
  }
  const scored = builders.map((builder, index) => {
    try {
      const sample = builder();
      return { builder, index, hit: sample.includes(winner) };
    } catch (error) {
      return { builder, index, hit: false };
    }
  });
  scored.sort((a, b) => Number(b.hit) - Number(a.hit) || a.index - b.index);
  return scored.map((item) => item.builder);
}

function rememberProxyWinner(proxyUrl) {
  try {
    const host = new URL(proxyUrl).host;
    localStorage.setItem(PROXY_WINNER_KEY, host);
  } catch (error) {
    // ignore
  }
}

function narouJsonpOnce(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `narouJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const query = new URLSearchParams(cleanNarouParams({ ...params, callback: callbackName }, "jsonp"));
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("API 请求超时"));
    }, JSONP_TIMEOUT_MS);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("API JSONP 失败（可能被网络拦截）"));
    };
    script.src = `${NAROU_API_BASE}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

async function narouFetchOneProxy(builder) {
  const proxyUrl = builder();
  const response = await fetchWithTimeout(proxyUrl, {
    cache: "no-store",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  }, PROXY_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) {
    throw new Error("非 JSON 响应");
  }
  const data = JSON.parse(trimmed);
  if (!Array.isArray(data)) {
    throw new Error("JSON 格式异常");
  }
  rememberProxyWinner(proxyUrl);
  return data;
}

async function narouFetchViaProxy(params) {
  const query = new URLSearchParams(cleanNarouParams(params, "json"));
  const apiUrl = `${NAROU_API_BASE}?${query.toString()}`;
  const builders = reorderProxyBuilders(buildProxyCandidates(apiUrl));
  const errors = [];

  const firstBatch = builders.slice(0, 2);
  if (firstBatch.length) {
    try {
      return await Promise.any(firstBatch.map((builder) => narouFetchOneProxy(builder)));
    } catch (error) {
      errors.push("首批代理失败");
    }
  }

  for (const builder of builders.slice(2)) {
    try {
      return await narouFetchOneProxy(builder);
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  throw new Error(`なろう API 代理全部失败：${errors.slice(0, 2).join(" | ")}`);
}

async function loadDemoNovels() {
  const response = await fetch("static/data/demo-novels.json", { cache: "force-cache" });
  if (!response.ok) {
    throw new Error("示例数据加载失败");
  }
  const demo = await response.json();
  demo._demo = true;
  return demo;
}

/** Race JSONP + proxy; cache hits; demo fallback for home list when blocked. */
async function narouJsonp(params) {
  const cached = readApiCache(params);
  if (cached) {
    return cached;
  }

  const canUseDemo = !params.ncode && !params.word && !params.genre;
  if (isApiMarkedBlocked() && canUseDemo) {
    return loadDemoNovels();
  }

  const tasks = [];
  if (!isApiMarkedBlocked()) {
    tasks.push(narouJsonpOnce(params).then((data) => ({ source: "jsonp", data })));
  }
  tasks.push(narouFetchViaProxy(params).then((data) => ({ source: "proxy", data })));

  try {
    const winner = await Promise.any(tasks);
    markApiBlocked(false);
    writeApiCache(params, winner.data);
    return winner.data;
  } catch (error) {
    markApiBlocked(true);
    if (canUseDemo) {
      return loadDemoNovels();
    }
    throw new Error("なろう API 不可用");
  }
}

async function fetchViaBuilder(builder) {
  const proxyUrl = builder();
  const response = await fetchWithTimeout(proxyUrl, {
    cache: "no-store",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  }, PROXY_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`代理 HTTP ${response.status}`);
  }
  const text = await response.text();
  if (looksLikeBlockedOrErrorPage(text)) {
    throw new Error("代理返回了无效/拦截页面");
  }
  rememberProxyWinner(proxyUrl);
  return text;
}

async function fetchProxyHtml(url) {
  const builders = reorderProxyBuilders(buildProxyCandidates(url));
  const errors = [];

  const firstBatch = builders.slice(0, 2);
  if (firstBatch.length) {
    try {
      return await Promise.any(firstBatch.map((builder) => fetchViaBuilder(builder)));
    } catch (error) {
      errors.push("首批 HTML 代理失败");
    }
  }

  for (const builder of builders.slice(2)) {
    try {
      return await fetchViaBuilder(builder);
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }

  // Last-resort: Jina Reader (markdown). Useful when pure HTML proxies fail.
  try {
    const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
      cache: "no-store",
      headers: { Accept: "text/plain" },
    });
    if (jinaResponse.ok) {
      const markdown = await jinaResponse.text();
      if (markdown && markdown.length > 80 && !markdown.includes("AuthenticationRequiredError")) {
        return wrapMarkdownAsHtml(markdown);
      }
    }
  } catch (error) {
    errors.push(`jina: ${error?.message || error}`);
  }

  throw new Error(`所有代理均失败：${errors.slice(0, 3).join(" | ")}`);
}

function wrapMarkdownAsHtml(markdown) {
  // Convert jina markdown dump into a minimal DOM the existing parsers can read.
  const lines = String(markdown).split(/\r?\n/);
  let title = "";
  const bodyLines = [];
  for (const line of lines) {
    if (!title) {
      const m = line.match(/^Title:\s*(.+)$/i) || line.match(/^#\s+(.+)$/);
      if (m) {
        title = m[1].trim();
        continue;
      }
    }
    if (/^(URL Source:|Published Time:|Markdown Content:|Warning:)/i.test(line)) {
      continue;
    }
    bodyLines.push(line);
  }

  const paragraphs = bodyLines
    .join("\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
  <h1 class="p-novel__title">${escapeHtml(title || "章节")}</h1>
  <div class="p-novel__body"><div class="p-novel__text">${paragraphs}</div></div>
</body></html>`;
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function getChildElements(node) {
  return Array.from(node.childNodes).filter((child) => child.nodeType === Node.ELEMENT_NODE);
}

function extractChapterNumber(href, fallbackValue) {
  const parts = String(href || "")
    .split("/")
    .filter(Boolean);
  // Prefer trailing numeric segment: /ncode/12/ or ncode/12
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const parsed = Number.parseInt(parts[i], 10);
    if (Number.isInteger(parsed) && String(parsed) === parts[i]) {
      return parsed;
    }
  }
  return fallbackValue;
}

function normalizeNcode(value) {
  return String(value || "").trim().toLowerCase();
}

function loadReadingProgressMap() {
  try {
    const raw = localStorage.getItem(READING_PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getReadingProgress(ncode) {
  const key = normalizeNcode(ncode);
  if (!key) {
    return null;
  }
  const map = loadReadingProgressMap();
  const progress = map[key];
  if (!progress || typeof progress !== "object") {
    return null;
  }
  return progress;
}

function setReadingProgress(ncode, progress) {
  const key = normalizeNcode(ncode);
  if (!key || !progress || typeof progress !== "object") {
    return;
  }
  const map = loadReadingProgressMap();
  map[key] = {
    ...map[key],
    ...progress,
    chapter: parsePositiveInt(progress.chapter, parsePositiveInt(map[key]?.chapter, 1)),
    scrollRatio: Number.isFinite(Number(progress.scrollRatio))
      ? Math.min(1, Math.max(0, Number(progress.scrollRatio)))
      : Number(map[key]?.scrollRatio) || 0,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(map));
  if (isOnShelf(key) || progress.title) {
    touchShelfFromProgress(key, {
      title: progress.title || map[key].title,
      writer: progress.writer,
      genre_icon: progress.genre_icon,
    });
  }
}

function getResumeChapter(ncode, chapters, defaultChapter = 1) {
  const progress = getReadingProgress(ncode);
  const savedChapter = parsePositiveInt(progress?.chapter, defaultChapter);
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return savedChapter;
  }
  const chapterSet = new Set(chapters.map((item) => parsePositiveInt(item?.num, NaN)).filter(Number.isInteger));
  return chapterSet.has(savedChapter) ? savedChapter : parsePositiveInt(chapters[0]?.num, defaultChapter);
}

function parseContentBlock(container) {
  if (!container) {
    return "";
  }

  // Prefer direct paragraph children / descendants, skipping nested note blocks when requested.
  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length === 0) {
    const text = container.textContent.trim();
    return text ? `<p>${escapeHtml(text)}</p>` : "";
  }

  return paragraphs
    .map((paragraph) => {
      const html = paragraph.innerHTML.trim();
      return html ? `<p>${html}</p>` : '<p class="blank-line">&nbsp;</p>';
    })
    .join("\n");
}

function parseMainContent(doc) {
  // New markup puts preface/body/afterword inside .p-novel__body
  const body = doc.querySelector("div#novel_honbun, div.p-novel__body");
  if (!body) {
    return "";
  }

  // If separate text blocks exist, take the main one (not preface/afterword).
  const textBlocks = Array.from(body.querySelectorAll(":scope > .p-novel__text, :scope .p-novel__text"));
  if (textBlocks.length > 0) {
    const mainBlocks = textBlocks.filter((block) => {
      const cls = block.className || "";
      return !cls.includes("preface") && !cls.includes("afterword");
    });
    if (mainBlocks.length > 0) {
      return mainBlocks.map((block) => parseContentBlock(block)).filter(Boolean).join("\n");
    }
  }

  // Fallback: strip known note blocks then parse remaining paragraphs.
  const clone = body.cloneNode(true);
  clone.querySelectorAll(".p-novel__text--preface, .p-novel__text--afterword, #novel_p, #novel_a").forEach((node) => node.remove());
  return parseContentBlock(clone);
}

function parseForeword(doc) {
  const modern = doc.querySelector(".p-novel__text--preface, div.p-novel__text--preface");
  if (modern) {
    return parseContentBlock(modern);
  }
  return parseContentBlock(doc.querySelector("div#novel_p"));
}

function parseAfterword(doc) {
  const modern = doc.querySelector(".p-novel__text--afterword, div.p-novel__text--afterword");
  if (modern) {
    return parseContentBlock(modern);
  }
  return parseContentBlock(doc.querySelector("div#novel_a"));
}

function parseChapterTitle(doc, fallbackChapter) {
  const titleElement = doc.querySelector(
    "h1.p-novel__title, .p-novel__title, p.novel_subtitle, h1.novel_subtitle"
  );
  return titleElement?.textContent.trim() || `第${fallbackChapter}话`;
}

function parseNovelTitleFromChapter(doc, ncode) {
  const novelTitleElement =
    doc.querySelector("a.c-announce__text, a.p-novel__series-title, a.novel_title, p.novel_title") ||
    doc.querySelector(`a[href='/${ncode}/'], a[href='/${ncode}']`);
  return novelTitleElement?.textContent.trim() || ncode;
}

function parseChapterNavigation(doc, currentChapter) {
  let prevChapter = null;
  let nextChapter = null;
  const selectors = [
    "div.novel_bn",
    "div.p-novel__navigation",
    "nav.p-novel__navi",
    "div.c-pager",
    "div.p-novel__navi",
  ];
  const roots = [];
  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => roots.push(node));
  });
  // Fallback: scan all links if nav containers missing
  const links = roots.length > 0
    ? roots.flatMap((root) => Array.from(root.querySelectorAll("a")))
    : Array.from(doc.querySelectorAll("a"));

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const text = (link.textContent || "").trim();
    const number = extractChapterNumber(href, NaN);
    if (!Number.isInteger(number)) {
      return;
    }
    if (number < currentChapter) {
      prevChapter = number;
    } else if (number > currentChapter) {
      if (nextChapter === null || number < nextChapter) {
        nextChapter = number;
      }
    }
    // Text-based fallback for relative labels
    if (/前/.test(text) && Number.isInteger(number)) {
      prevChapter = number;
    }
    if (/次/.test(text) && Number.isInteger(number)) {
      nextChapter = number;
    }
  });

  return { prevChapter, nextChapter };
}

function getTocPageCount(doc) {
  const last = doc.querySelector("a.c-pager__item--last, a.novelview_pager-last");
  if (!last) {
    return 1;
  }
  const href = last.getAttribute("href") || "";
  const match = href.match(/[?&]p=(\d+)/);
  return match ? parsePositiveInt(match[1], 1) : 1;
}

function parseChapterListFromDoc(doc) {
  const chapters = [];
  const arcs = [];
  let currentArc = null;

  // ---- New markup: div.p-eplist ----
  const eplist = doc.querySelector("div.p-eplist");
  if (eplist) {
    eplist.querySelectorAll(".p-eplist__chapter-title, a").forEach((element) => {
      if (element.classList?.contains("p-eplist__chapter-title")) {
        currentArc = { title: element.textContent.trim(), chapters: [] };
        arcs.push(currentArc);
        return;
      }
      if (element.tagName !== "A") {
        return;
      }
      const href = element.getAttribute("href") || "";
      const num = extractChapterNumber(href, chapters.length + 1);
      if (!Number.isInteger(num)) {
        return;
      }
      // Skip non-episode links (info, bookmark, etc.)
      if (!/\/n?\d+[a-z]*\/\d+\/?/i.test(href) && !/\/\d+\/?$/.test(href)) {
        // still allow bare /ncode/1/
        if (!href.split("/").filter(Boolean).some((part) => /^\d+$/.test(part))) {
          return;
        }
      }

      let date = "";
      const row = element.closest(".p-eplist__sublist, li, div");
      if (row) {
        const dateNode = row.querySelector(".p-eplist__update, .long_update, time, .p-eplist__date");
        if (dateNode && dateNode !== element) {
          date = dateNode.textContent.trim();
        }
      }

      const entry = {
        num,
        title: element.textContent.trim(),
        date,
      };
      // de-dupe by chapter number
      if (chapters.some((item) => item.num === entry.num)) {
        return;
      }
      chapters.push(entry);
      if (currentArc) {
        currentArc.chapters.push(entry);
      }
    });
    return { chapters, arcs };
  }

  // ---- Legacy markup: div.index_box ----
  const indexBox = doc.querySelector("div.index_box");
  if (!indexBox) {
    return { chapters, arcs };
  }

  getChildElements(indexBox).forEach((element) => {
    if (element.classList.contains("chapter_title")) {
      currentArc = { title: element.textContent.trim(), chapters: [] };
      arcs.push(currentArc);
      return;
    }

    if (element.tagName !== "DL") {
      return;
    }

    const dd = element.querySelector("dd.subtitle");
    const dt = element.querySelector("dt");
    const link = dd?.querySelector("a");
    if (!link) {
      return;
    }

    const entry = {
      num: extractChapterNumber(link.getAttribute("href"), chapters.length + 1),
      title: link.textContent.trim(),
      date: dt?.textContent.trim() || "",
    };
    chapters.push(entry);
    if (currentArc) {
      currentArc.chapters.push(entry);
    }
  });

  return { chapters, arcs };
}

async function fetchAllChapters(ncode) {
  const firstHtml = await fetchProxyHtml(getOriginIndexUrl(ncode, 1));
  const firstDoc = parseHtml(firstHtml);
  const pageCount = getTocPageCount(firstDoc);
  const merged = parseChapterListFromDoc(firstDoc);

  if (pageCount > 1) {
    for (let page = 2; page <= pageCount; page += 1) {
      try {
        const html = await fetchProxyHtml(getOriginIndexUrl(ncode, page));
        const doc = parseHtml(html);
        const partial = parseChapterListFromDoc(doc);
        partial.chapters.forEach((entry) => {
          if (!merged.chapters.some((item) => item.num === entry.num)) {
            merged.chapters.push(entry);
          }
        });
        // Keep arc titles from later pages too
        partial.arcs.forEach((arc) => {
          if (!arc.chapters.length) {
            return;
          }
          const existing = merged.arcs.find((item) => item.title === arc.title);
          if (existing) {
            arc.chapters.forEach((entry) => {
              if (!existing.chapters.some((item) => item.num === entry.num)) {
                existing.chapters.push(entry);
              }
            });
          } else {
            merged.arcs.push(arc);
          }
        });
      } catch (error) {
        console.warn(`目录第 ${page} 页加载失败`, error);
        break;
      }
    }
  }

  merged.chapters.sort((a, b) => a.num - b.num);
  return merged;
}


/* ---------- Bookshelf (local memory) ---------- */
function loadBookshelfMap() {
  try {
    const raw = localStorage.getItem(BOOKSHELF_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveBookshelfMap(map) {
  localStorage.setItem(BOOKSHELF_KEY, JSON.stringify(map));
}

function listBookshelf() {
  return Object.values(loadBookshelfMap()).sort((a, b) => {
    const ta = Date.parse(b.updatedAt || b.addedAt || 0) || 0;
    const tb = Date.parse(a.updatedAt || a.addedAt || 0) || 0;
    return ta - tb;
  });
}

function isOnShelf(ncode) {
  const key = normalizeNcode(ncode);
  return Boolean(key && loadBookshelfMap()[key]);
}

function addToShelf(novel) {
  const key = normalizeNcode(novel?.ncode);
  if (!key) {
    return null;
  }
  const map = loadBookshelfMap();
  const prev = map[key] || {};
  const now = new Date().toISOString();
  map[key] = {
    ncode: key,
    title: novel.title || prev.title || key,
    writer: novel.writer || prev.writer || "",
    genre: novel.genre ?? prev.genre ?? "",
    genre_icon: novel.genre_icon || prev.genre_icon || "📖",
    story: novel.story || prev.story || "",
    addedAt: prev.addedAt || now,
    updatedAt: now,
  };
  saveBookshelfMap(map);
  return map[key];
}

function removeFromShelf(ncode) {
  const key = normalizeNcode(ncode);
  if (!key) {
    return;
  }
  const map = loadBookshelfMap();
  delete map[key];
  saveBookshelfMap(map);
}

function touchShelfFromProgress(ncode, extra = {}) {
  const key = normalizeNcode(ncode);
  if (!key) {
    return;
  }
  const map = loadBookshelfMap();
  if (!map[key] && !extra.title) {
    return;
  }
  const now = new Date().toISOString();
  map[key] = {
    ncode: key,
    title: extra.title || map[key]?.title || key,
    writer: extra.writer || map[key]?.writer || "",
    genre: extra.genre ?? map[key]?.genre ?? "",
    genre_icon: extra.genre_icon || map[key]?.genre_icon || "📖",
    story: extra.story || map[key]?.story || "",
    addedAt: map[key]?.addedAt || now,
    updatedAt: now,
  };
  saveBookshelfMap(map);
}

function setErrorText(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
  }
}
