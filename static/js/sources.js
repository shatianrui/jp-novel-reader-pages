/**
 * Multi reading-source registry.
 * Browse tabs: narou (remote) + shelf/recent/link (local/tool).
 * Content hosts: narou + kakuyomu (detail/read via CORS proxy).
 */

const SOURCE_STORAGE_KEY = "readingSource";

const SOURCE_DEFS = {
  narou: {
    id: "narou",
    name: "なろう",
    fullName: "小説家になろう",
    originHome: "https://syosetu.com/",
    kind: "remote",
    searchPlaceholder: "搜索标题/作者/关键词，或粘贴 ncode / なろう URL",
    heroSub: "「小説家になろう」公开作品 · 支持搜索与排行",
    defaultOrder: "hyoka",
    genres: [
      { id: "", label: "全部" },
      { id: "201", label: "⚔️ 高幻想" },
      { id: "101", label: "💕 异世界恋爱" },
      { id: "401", label: "🎮 VR游戏" },
      { id: "306", label: "💥 动作" },
      { id: "304", label: "🔍 推理" },
      { id: "305", label: "👻 恐怖" },
      { id: "307", label: "😂 喜剧" },
      { id: "303", label: "🏯 历史" },
      { id: "402", label: "🚀 科幻" },
      { id: "302", label: "🎭 人情剧" },
    ],
    orders: [
      { id: "hyoka", label: "综合评分" },
      { id: "favnovelcnt", label: "收藏数" },
      { id: "new", label: "最新更新" },
      { id: "weekly", label: "本周热门" },
      { id: "lengthdesc", label: "字数最多" },
    ],
  },
  shelf: {
    id: "shelf",
    name: "书架",
    fullName: "我的书架",
    originHome: "bookshelf.html",
    kind: "local",
    searchPlaceholder: "筛选书架中的书名或作者…",
    heroSub: "本地书架 · 秒开 · 数据只存在本浏览器",
    defaultOrder: "updated",
    genres: [{ id: "", label: "全部" }],
    orders: [
      { id: "updated", label: "最近更新" },
      { id: "added", label: "加入时间" },
      { id: "title", label: "书名" },
    ],
  },
  recent: {
    id: "recent",
    name: "最近",
    fullName: "最近阅读",
    originHome: "index.html?source=recent",
    kind: "local",
    searchPlaceholder: "筛选最近阅读…",
    heroSub: "根据本机阅读进度生成 · 秒开",
    defaultOrder: "updated",
    genres: [{ id: "", label: "全部" }],
    orders: [
      { id: "updated", label: "最近阅读" },
      { id: "title", label: "书名" },
    ],
  },
  link: {
    id: "link",
    name: "链接",
    fullName: "粘贴链接打开",
    originHome: "https://kakuyomu.jp/",
    kind: "tool",
    searchPlaceholder: "粘贴 なろう / カクヨム 作品链接或 ncode…",
    heroSub: "不爬列表 · 粘贴 URL 直接打开 · 最快",
    defaultOrder: "",
    genres: [],
    orders: [],
  },
};

/** Content hosts used on novel/read pages (not browse tabs). */
const CONTENT_SOURCE_META = {
  narou: {
    id: "narou",
    name: "なろう",
    fullName: "小説家になろう",
    originHome: "https://syosetu.com/",
  },
  kakuyomu: {
    id: "kakuyomu",
    name: "カクヨム",
    fullName: "カクヨム",
    originHome: "https://kakuyomu.jp/",
  },
};

function listSources() {
  return Object.values(SOURCE_DEFS);
}

function getSourceDef(sourceId) {
  const id = String(sourceId || "").trim().toLowerCase();
  if (SOURCE_DEFS[id]) {
    return SOURCE_DEFS[id];
  }
  if (CONTENT_SOURCE_META[id]) {
    return {
      ...CONTENT_SOURCE_META[id],
      kind: "remote",
      searchPlaceholder: "",
      heroSub: "",
      defaultOrder: "",
      genres: [],
      orders: [],
    };
  }
  return SOURCE_DEFS.narou;
}

/** Browse-tab id (なろう / 书架 / 最近 / 链接). */
function normalizeSourceId(value) {
  const id = String(value || "").trim().toLowerCase();
  // legacy kakuyomu browse tab -> link tool
  if (id === "kakuyomu") {
    return "link";
  }
  return SOURCE_DEFS[id] ? id : "narou";
}

/** Infer content host (narou / kakuyomu) from an id or URL fragment. */
function inferSourceFromId(id) {
  const text = String(id || "").trim();
  if (!text) {
    return "narou";
  }
  if (parseKakuyomuUrlOrId(text)) {
    return "kakuyomu";
  }
  if (parseNarouUrlOrNcode(text)) {
    return "narou";
  }
  return "narou";
}

function normalizeNovelId(source, id) {
  const contentSource = normalizeContentSource(source);
  const raw = String(id || "").trim();
  if (contentSource === "narou" && /^n\d+[a-z0-9]*$/i.test(raw)) {
    return raw.toLowerCase();
  }
  return raw;
}

function makeItemKey(source, id) {
  let s = String(source || "narou").toLowerCase();
  if (s === "shelf" || s === "recent" || s === "link") {
    s = inferSourceFromId(id);
  } else if (s !== "narou" && s !== "kakuyomu") {
    s = inferSourceFromId(id);
  }
  const contentSource = s === "kakuyomu" ? "kakuyomu" : "narou";
  return `${contentSource}:${normalizeNovelId(contentSource, id)}`;
}

function parseItemKey(key) {
  const raw = String(key || "");
  if (raw.includes(":")) {
    const [source, ...rest] = raw.split(":");
    const id = rest.join(":");
    if (source === "kakuyomu") {
      return { source: "kakuyomu", id };
    }
    return { source: "narou", id };
  }
  // legacy bare ncode
  if (/^n\d+[a-z0-9]*$/i.test(raw)) {
    return { source: "narou", id: raw.toLowerCase() };
  }
  return { source: inferSourceFromId(raw), id: raw };
}

/** Content host for novel/read pages (narou | kakuyomu). */
function normalizeContentSource(value) {
  const id = String(value || "").trim().toLowerCase();
  if (id === "kakuyomu") {
    return "kakuyomu";
  }
  if (id === "narou" || !id) {
    return "narou";
  }
  // browse tabs are not content hosts
  if (id === "shelf" || id === "recent" || id === "link") {
    return "narou";
  }
  return inferSourceFromId(id) === "kakuyomu" ? "kakuyomu" : "narou";
}

function resolveOriginArgs(refOrNcode, second, third) {
  if (typeof refOrNcode === "object" && refOrNcode) {
    return {
      source: normalizeContentSource(refOrNcode.source || "narou"),
      id: refOrNcode.id || refOrNcode.ncode,
      rest: second,
    };
  }
  const first = String(refOrNcode || "").trim().toLowerCase();
  // (source, id, rest) when first arg is a known content host
  if (first === "narou" || first === "kakuyomu") {
    return { source: first, id: second, rest: third };
  }
  // legacy (ncode, rest)
  return { source: "narou", id: refOrNcode, rest: second };
}

function getStoredSource() {
  try {
    return normalizeSourceId(localStorage.getItem(SOURCE_STORAGE_KEY) || "narou");
  } catch (error) {
    return "narou";
  }
}

function setStoredSource(sourceId) {
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, normalizeSourceId(sourceId));
  } catch (error) {
    // ignore
  }
}

function getNovelRefFromQuery() {
  const sourceParam = getQueryParam("source");
  const id = getQueryParam("id") || getQueryParam("ncode");
  let source = sourceParam;
  if (source === "shelf" || source === "recent" || source === "link") {
    source = inferSourceFromId(id);
  }
  if (!source && id) {
    source = inferSourceFromId(id);
  }
  source = normalizeContentSource(source || "narou");
  return {
    source,
    id: normalizeNovelId(source, id),
  };
}

function getNovelUrl(refOrNcode, maybeId) {
  let source;
  let id;
  if (typeof refOrNcode === "object" && refOrNcode) {
    source = refOrNcode.source || "narou";
    id = refOrNcode.id || refOrNcode.ncode;
  } else if (maybeId !== undefined) {
    source = refOrNcode;
    id = maybeId;
  } else {
    source = "narou";
    id = refOrNcode;
  }
  if (source === "shelf" || source === "recent" || source === "link") {
    source = inferSourceFromId(id);
  }
  const contentSource = normalizeContentSource(source);
  const novelId = normalizeNovelId(contentSource, id);
  return buildLocalUrl("novel.html", {
    source: contentSource,
    id: novelId,
    ncode: contentSource === "narou" ? novelId : "",
  });
}

function getReadUrl(refOrNcode, chapter, maybeChapter) {
  let source;
  let id;
  let ch;
  if (typeof refOrNcode === "object" && refOrNcode) {
    source = refOrNcode.source || "narou";
    id = refOrNcode.id || refOrNcode.ncode;
    ch = chapter;
  } else if (maybeChapter !== undefined) {
    source = refOrNcode;
    id = chapter;
    ch = maybeChapter;
  } else {
    source = "narou";
    id = refOrNcode;
    ch = chapter;
  }
  if (source === "shelf" || source === "recent" || source === "link") {
    source = inferSourceFromId(id);
  }
  const contentSource = normalizeContentSource(source);
  const novelId = normalizeNovelId(contentSource, id);
  return buildLocalUrl("read.html", {
    source: contentSource,
    id: novelId,
    ncode: contentSource === "narou" ? novelId : "",
    chapter: ch,
  });
}

function getOriginIndexUrl(refOrNcode, pageOrMaybeId, maybePage) {
  const { source, id, rest: page } = resolveOriginArgs(refOrNcode, pageOrMaybeId, maybePage);
  if (source === "kakuyomu") {
    return `https://kakuyomu.jp/works/${id}`;
  }
  const ncode = normalizeNovelId("narou", id);
  const base = `https://ncode.syosetu.com/${ncode}/`;
  return page && page > 1 ? `${base}?p=${page}` : base;
}

function getOriginChapterUrl(refOrNcode, chapterOrMaybeId, maybeChapter) {
  const { source, id, rest: chapter } = resolveOriginArgs(refOrNcode, chapterOrMaybeId, maybeChapter);
  if (source === "kakuyomu") {
    return `https://kakuyomu.jp/works/${id}/episodes/${chapter}`;
  }
  return `https://ncode.syosetu.com/${normalizeNovelId("narou", id)}/${chapter}/`;
}

function parseKakuyomuUrlOrId(input) {
  const text = String(input || "").trim();
  if (!text) {
    return "";
  }
  const fromUrl = text.match(/kakuyomu\.jp\/works\/(\d+)/i);
  if (fromUrl) {
    return fromUrl[1];
  }
  if (/^\d{10,}$/.test(text)) {
    return text;
  }
  return "";
}

function parseNarouUrlOrNcode(input) {
  const text = String(input || "").trim();
  if (!text) {
    return "";
  }
  const fromUrl = text.match(/(?:ncode|novel18)\.syosetu\.com\/(n[0-9]+[a-z0-9]*)/i);
  if (fromUrl) {
    return fromUrl[1].toLowerCase();
  }
  if (/^n\d+[a-z0-9]*$/i.test(text)) {
    return text.toLowerCase();
  }
  return "";
}

function parseAnyWorkRef(input) {
  const kakuyomuId = parseKakuyomuUrlOrId(input);
  if (kakuyomuId) {
    return { source: "kakuyomu", id: kakuyomuId };
  }
  const ncode = parseNarouUrlOrNcode(input);
  if (ncode) {
    return { source: "narou", id: ncode };
  }
  return null;
}

/* ---------- Kakuyomu parse helpers (detail/read only) ---------- */
const CHAPTER_LIST_CACHE_KEY = "chapterListCache";
const CHAPTER_LIST_TTL_MS = 10 * 60 * 1000;

/**
 * Kakuyomu snowflake IDs exceed Number.MAX_SAFE_INTEGER.
 * Quote 16+ digit integers before JSON.parse to keep them as strings.
 */
function parseJsonPreservingBigInts(text) {
  const prepared = String(text).replace(
    /([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g,
    '$1"$2"'
  );
  return JSON.parse(prepared);
}

function extractNextData(html) {
  try {
    const doc = parseHtml(html);
    const node = doc.querySelector("#__NEXT_DATA__");
    if (!node?.textContent) {
      return null;
    }
    return parseJsonPreservingBigInts(node.textContent);
  } catch (error) {
    return null;
  }
}

function readChapterListCache(source, id) {
  try {
    const raw = sessionStorage.getItem(CHAPTER_LIST_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const key = makeItemKey(source, id);
    const hit = map[key];
    if (!hit || !hit.expiresAt || hit.expiresAt < Date.now()) {
      return null;
    }
    return hit.data;
  } catch (error) {
    return null;
  }
}

function writeChapterListCache(source, id, data) {
  try {
    const raw = sessionStorage.getItem(CHAPTER_LIST_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const key = makeItemKey(source, id);
    map[key] = { data, expiresAt: Date.now() + CHAPTER_LIST_TTL_MS };
    const keys = Object.keys(map);
    if (keys.length > 20) {
      keys.slice(0, keys.length - 20).forEach((k) => delete map[k]);
    }
    sessionStorage.setItem(CHAPTER_LIST_CACHE_KEY, JSON.stringify(map));
  } catch (error) {
    // ignore quota
  }
}

function adjacentChapterIds(chapters, currentId) {
  if (!Array.isArray(chapters) || !chapters.length) {
    return { prevChapter: null, nextChapter: null };
  }
  const index = chapters.findIndex((item) => String(item.num) === String(currentId));
  if (index < 0) {
    return { prevChapter: null, nextChapter: null };
  }
  return {
    prevChapter: index > 0 ? chapters[index - 1].num : null,
    nextChapter: index < chapters.length - 1 ? chapters[index + 1].num : null,
  };
}

function getApolloState(htmlOrData) {
  const data = typeof htmlOrData === "string" ? extractNextData(htmlOrData) : htmlOrData;
  return data?.props?.pageProps?.__APOLLO_STATE__ || data?.props?.pageProps?.apolloState || {};
}

function enrichKakuyomuWork(work, apollo = {}) {
  if (!work) {
    return null;
  }
  const id = String(work.id || work.workId || "").replace(/^Work:/, "");
  const author = work.author || apollo[`User:${work.author?.id}`] || {};
  const genreKey = work.genre || work.topLevelGenre || "";
  const genreMeta = {
    FANTASY: { name: "异世界幻想", icon: "⚔️" },
    ACTION: { name: "现代幻想", icon: "🌆" },
    SF: { name: "科幻", icon: "🚀" },
    MYSTERY: { name: "推理", icon: "🔍" },
    HORROR: { name: "恐怖", icon: "👻" },
    ROMANCE: { name: "恋爱喜剧", icon: "💕" },
    HISTORY: { name: "历史时代", icon: "🏯" },
    NONFICTION: { name: "随笔纪实", icon: "✍️" },
  }[genreKey] || { name: "カクヨム", icon: "📖" };

  return {
    source: "kakuyomu",
    id,
    ncode: id,
    title: work.title || work.workTitle || id,
    writer: author.name || author.activityName || work.authorName || "未知",
    story: work.introduction || work.catchphrase || "",
    genre: genreKey,
    genre_name: genreMeta.name,
    genre_icon: genreMeta.icon,
    fav_novel_cnt: Number(work.totalFollowers || work.followerCount || 0),
    general_all_no: Number(work.totalEpisodeCount || work.episodeCount || 0),
    length: Number(work.totalCharacterCount || 0),
    length_label: formatLength(Number(work.totalCharacterCount || 0)),
    end: work.serialStatus === "COMPLETED" || work.isCompleted ? 1 : 0,
    is_completed: work.serialStatus === "COMPLETED" || Boolean(work.isCompleted),
    is_series: Number(work.totalEpisodeCount || work.episodeCount || 1) > 1,
  };
}

function parseKakuyomuWorkDetail(html, workId) {
  const apollo = getApolloState(html);
  const work = apollo[`Work:${workId}`] || Object.values(apollo).find((item) => item?.__typename === "Work" && String(item.id) === String(workId));
  const enriched = enrichKakuyomuWork(work, apollo);
  if (enriched) {
    return enriched;
  }
  const doc = parseHtml(html);
  const title = doc.querySelector("h1")?.textContent?.trim() || workId;
  return {
    source: "kakuyomu",
    id: workId,
    ncode: workId,
    title,
    writer: "",
    story: doc.querySelector("[class*='introduction'], .widget-toc-introduction")?.textContent?.trim() || "",
    genre_name: "カクヨム",
    genre_icon: "📖",
    fav_novel_cnt: 0,
    general_all_no: 0,
    length_label: "",
    is_completed: false,
    is_series: true,
  };
}

function parseKakuyomuChapterList(html, workId) {
  const apollo = getApolloState(html);
  const work = apollo[`Work:${workId}`] || Object.values(apollo).find(
    (item) => item?.__typename === "Work" && String(item.id) === String(workId)
  );

  const episodeFromRef = (ref) => {
    if (!ref) {
      return null;
    }
    if (typeof ref === "object" && (ref.title || ref.episodeTitle || ref.id)) {
      return ref;
    }
    const key = typeof ref === "object" ? ref.__ref || ref.id : ref;
    const normalized = String(key || "").replace(/^Episode:/, "");
    return apollo[`Episode:${normalized}`] || apollo[key] || null;
  };

  const pushEpisode = (chapters, ep, index) => {
    if (!ep) {
      return;
    }
    const num = String(ep.id || ep.episodeId || "").replace(/^Episode:/, "");
    if (!num || chapters.some((item) => item.num === num)) {
      return;
    }
    chapters.push({
      num,
      title: ep.title || ep.episodeTitle || `第${index + 1}话`,
      date: ep.publishedAt || ep.editLastUpdatedAt || "",
    });
  };

  // Prefer ordered TOC when available.
  const toc = work?.tableOfContentsV2 || work?.tableOfContents || [];
  if (Array.isArray(toc) && toc.length) {
    const chapters = [];
    const arcs = [];
    let currentArc = null;
    toc.forEach((node, index) => {
      const entry = typeof node === "object" && node.__ref ? apollo[node.__ref] : node;
      if (!entry) {
        return;
      }
      if (
        entry.__typename === "TableOfContentsChapter" ||
        entry.chapterTitle ||
        (entry.title && entry.episodeUnions)
      ) {
        currentArc = { title: entry.chapterTitle || entry.title || "章节", chapters: [] };
        arcs.push(currentArc);
        const unions = entry.episodeUnions || entry.episodes || entry.episode || [];
        (Array.isArray(unions) ? unions : [unions]).forEach((ref, epIndex) => {
          const before = chapters.length;
          pushEpisode(chapters, episodeFromRef(ref), before || epIndex);
          if (chapters.length > before && currentArc) {
            currentArc.chapters.push(chapters[chapters.length - 1]);
          }
        });
        return;
      }
      if (entry.__typename === "Episode" || entry.__typename === "WorkEpisode" || entry.episodeId || entry.title) {
        // Top-level episode (outside a chapter block) — do not attach to previous arc.
        currentArc = null;
        pushEpisode(chapters, episodeFromRef(entry), index);
      }
    });
    if (chapters.length) {
      return { chapters, arcs };
    }
  }

  const episodes = Object.values(apollo)
    .filter((item) => item?.__typename === "Episode" || item?.__typename === "WorkEpisode")
    .map((ep, index) => ({
      num: String(ep.id || ep.episodeId || "").replace(/^Episode:/, "") || String(index + 1),
      title: ep.title || ep.episodeTitle || `第${index + 1}话`,
      date: ep.publishedAt || ep.editLastUpdatedAt || "",
      _sort: Date.parse(ep.publishedAt || ep.editLastUpdatedAt || 0) || index,
    }))
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...rest }) => rest);
  if (episodes.length) {
    return { chapters: episodes, arcs: [] };
  }

  const doc = parseHtml(html);
  const chapters = [];
  doc.querySelectorAll(`a[href*="/works/${workId}/episodes/"]`).forEach((link) => {
    const href = link.getAttribute("href") || "";
    const match = href.match(/episodes\/(\d+)/);
    if (!match) {
      return;
    }
    const id = match[1];
    if (chapters.some((item) => item.num === id)) {
      return;
    }
    chapters.push({
      num: id,
      title: link.textContent.trim() || id,
      date: "",
    });
  });
  return { chapters, arcs: [] };
}

function parseKakuyomuEpisode(html, workId = "", episodeId = "") {
  const doc = parseHtml(html);
  const title =
    doc.querySelector("h1, .widget-episodeTitle, [class*='episodeTitle']")?.textContent?.trim() || "章节";
  const novelTitle =
    doc.querySelector("a[href*='/works/']")?.textContent?.trim() || "";
  const body =
    doc.querySelector(".widget-episodeBody, .episode-body, [class*='episodeBody'], article") ||
    doc.querySelector("main");
  const contentHtml = parseContentBlock(body);
  const links = Array.from(doc.querySelectorAll("a[href*='/episodes/']"));
  let prevChapter = null;
  let nextChapter = null;
  links.forEach((link) => {
    const text = link.textContent || "";
    const href = link.getAttribute("href") || "";
    const match = href.match(/episodes\/(\d+)/);
    if (!match) {
      return;
    }
    if (/前|prev/i.test(text)) {
      prevChapter = match[1];
    }
    if (/次|next/i.test(text)) {
      nextChapter = match[1];
    }
  });

  // Prefer ordered TOC adjacency when link labels are missing/ambiguous.
  if ((prevChapter === null || nextChapter === null) && workId && episodeId) {
    const cached = readChapterListCache("kakuyomu", workId);
    if (cached?.chapters?.length) {
      const adj = adjacentChapterIds(cached.chapters, episodeId);
      if (prevChapter === null) {
        prevChapter = adj.prevChapter;
      }
      if (nextChapter === null) {
        nextChapter = adj.nextChapter;
      }
    }
  }

  return {
    title,
    novelTitle,
    contentHtml,
    foreword: "",
    afterword: "",
    prevChapter,
    nextChapter,
  };
}

/* ---------- Search providers ---------- */
async function searchNarouSource({ query = "", genre = "", order = "hyoka", page = 1 } = {}) {
  const data = await narouJsonp({
    of: "t-n-w-s-g-ga-f-l-e-nt",
    lim: "20",
    st: String((page - 1) * 20 + 1),
    order,
    word: query,
    genre,
  });
  const total = Number(data?.[0]?.allcount || 0);
  const novels = (data || []).slice(1).map((novel) => ({
    ...enrichNovel(novel),
    source: "narou",
    id: normalizeNcode(novel.ncode),
  }));
  return {
    total,
    novels,
    page,
    pageSize: 20,
    demo: Boolean(data?._demo),
    message: data?._demo ? "离线示例数据（なろう API 不可达）" : "",
  };
}

function searchShelfSource({ query = "", order = "updated" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  let novels = listBookshelf().map((item) => {
    const contentSource = item.source === "kakuyomu" ? "kakuyomu" : inferSourceFromId(item.id || item.ncode);
    return {
      ...item,
      source: contentSource,
      id: item.id || item.ncode,
      ncode: item.id || item.ncode,
      genre_name: contentSource === "kakuyomu" ? "カクヨム" : item.genre_name || "书架",
      genre_icon: item.genre_icon || "📚",
      length_label: item.length_label || "",
      is_completed: Boolean(item.is_completed),
      is_series: item.is_series !== false,
      fav_novel_cnt: item.fav_novel_cnt || 0,
      general_all_no: item.general_all_no || 0,
    };
  });
  if (q) {
    novels = novels.filter((item) =>
      `${item.title} ${item.writer} ${item.id}`.toLowerCase().includes(q)
    );
  }
  novels.sort((a, b) => {
    if (order === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""), "zh");
    }
    if (order === "added") {
      return Date.parse(b.addedAt || 0) - Date.parse(a.addedAt || 0);
    }
    return Date.parse(b.updatedAt || b.addedAt || 0) - Date.parse(a.updatedAt || a.addedAt || 0);
  });
  return {
    total: novels.length,
    novels,
    page: 1,
    pageSize: novels.length || 1,
    demo: false,
    message: novels.length ? "本地书架" : "书架为空，去なろう搜书并加入书架",
    browseMode: "shelf",
  };
}

function searchRecentSource({ query = "", order = "updated" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const progressMap = loadReadingProgressMap();
  const shelfMap = loadBookshelfMap();
  let novels = Object.entries(progressMap).map(([key, progress]) => {
    const ref = parseItemKey(key);
    const contentSource = ref.source === "kakuyomu" ? "kakuyomu" : "narou";
    const shelf = shelfMap[makeItemKey(contentSource, ref.id)] || shelfMap[key] || {};
    const chapterLabel = progress.chapter != null && progress.chapter !== ""
      ? String(progress.chapter)
      : "1";
    return {
      source: contentSource,
      id: ref.id,
      ncode: ref.id,
      title: progress.title || shelf.title || ref.id,
      writer: progress.writer || shelf.writer || "",
      story: shelf.story || (contentSource === "kakuyomu"
        ? "继续阅读"
        : `读到第 ${chapterLabel} 话`),
      genre_name: contentSource === "kakuyomu" ? "カクヨム" : "なろう",
      genre_icon: contentSource === "kakuyomu" ? "📖" : "📘",
      fav_novel_cnt: 0,
      general_all_no: contentSource === "narou" ? parsePositiveInt(progress.chapter, 1) : 0,
      length_label: contentSource === "kakuyomu" ? "カクヨム" : `进度 ${chapterLabel} 话`,
      is_completed: false,
      is_series: true,
      updatedAt: progress.updatedAt,
    };
  });
  if (q) {
    novels = novels.filter((item) =>
      `${item.title} ${item.writer} ${item.id}`.toLowerCase().includes(q)
    );
  }
  novels.sort((a, b) => {
    if (order === "title") {
      return String(a.title || "").localeCompare(String(b.title || ""), "zh");
    }
    return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
  });
  return {
    total: novels.length,
    novels,
    page: 1,
    pageSize: novels.length || 1,
    demo: false,
    message: novels.length ? "本机最近阅读" : "还没有阅读记录",
    browseMode: "recent",
  };
}

function searchLinkSource() {
  return {
    total: 0,
    novels: [],
    page: 1,
    pageSize: 1,
    demo: false,
    message: "在上方粘贴 なろう 或 カクヨム 作品链接后回车即可打开",
    browseMode: "link",
  };
}

async function searchSource(sourceId, options = {}) {
  const source = normalizeSourceId(sourceId);
  if (source === "shelf") {
    return searchShelfSource(options);
  }
  if (source === "recent") {
    return searchRecentSource(options);
  }
  if (source === "link") {
    return searchLinkSource(options);
  }
  return searchNarouSource(options);
}

async function fetchNovelDetail(ref) {
  const source = ref.source === "kakuyomu" ? "kakuyomu" : "narou";
  const id = normalizeNovelId(source, ref.id || ref.ncode);
  if (!id) {
    throw new Error("缺少作品编号");
  }

  if (source === "kakuyomu") {
    const html = await fetchProxyHtml(getOriginIndexUrl({ source, id }));
    // Warm chapter cache while we already have the work HTML.
    const chapters = parseKakuyomuChapterList(html, id);
    if (chapters.chapters?.length) {
      writeChapterListCache(source, id, chapters);
    }
    return parseKakuyomuWorkDetail(html, id);
  }

  try {
    const detailData = await narouJsonp({
      of: "t-n-w-s-g-ga-f-l-e-nt-k",
      ncode: id,
    });
    const novel = detailData?.[1] ? enrichNovel(detailData[1]) : null;
    if (novel) {
      return {
        ...novel,
        source: "narou",
        id: normalizeNcode(novel.ncode),
      };
    }
  } catch (error) {
    // fall through to local metadata
  }

  const shelf = listBookshelf().find(
    (item) => (item.source || "narou") === "narou" && normalizeNcode(item.id || item.ncode) === id
  );
  if (shelf) {
    return { ...shelf, source: "narou", id };
  }
  throw new Error("未找到该小说（なろう API 不可用且本地无记录）");
}

async function fetchNovelChapters(ref) {
  const source = ref.source === "kakuyomu" ? "kakuyomu" : "narou";
  const id = normalizeNovelId(source, ref.id || ref.ncode);
  const cached = readChapterListCache(source, id);
  if (cached?.chapters?.length) {
    return cached;
  }
  if (source === "kakuyomu") {
    const html = await fetchProxyHtml(getOriginIndexUrl({ source, id }));
    const parsed = parseKakuyomuChapterList(html, id);
    if (parsed.chapters?.length) {
      writeChapterListCache(source, id, parsed);
    }
    return parsed;
  }
  const parsed = await fetchAllChapters(id);
  if (parsed.chapters?.length) {
    writeChapterListCache(source, id, parsed);
  }
  return parsed;
}

async function fetchChapterContent(ref, chapter) {
  const source = ref.source === "kakuyomu" ? "kakuyomu" : "narou";
  const id = normalizeNovelId(source, ref.id || ref.ncode);
  const html = await fetchProxyHtml(getOriginChapterUrl({ source, id }, chapter));

  if (source === "kakuyomu") {
    // Warm TOC cache in background so prev/next works without a second wait.
    if (!readChapterListCache(source, id)) {
      fetchNovelChapters({ source, id }).catch(() => {});
    }
    const parsed = parseKakuyomuEpisode(html, id, chapter);
    if (!parsed.contentHtml) {
      throw new Error("章节正文为空（代理可能未拿到原站页面）");
    }
    // Re-resolve adjacency if TOC arrived after first parse.
    if (parsed.prevChapter === null || parsed.nextChapter === null) {
      const cached = readChapterListCache(source, id);
      if (cached?.chapters?.length) {
        const adj = adjacentChapterIds(cached.chapters, chapter);
        if (parsed.prevChapter === null) {
          parsed.prevChapter = adj.prevChapter;
        }
        if (parsed.nextChapter === null) {
          parsed.nextChapter = adj.nextChapter;
        }
      }
    }
    return parsed;
  }

  const doc = parseHtml(html);
  const title = parseChapterTitle(doc, chapter);
  const novelTitle = parseNovelTitleFromChapter(doc, id);
  const contentHtml = parseMainContent(doc);
  if (!contentHtml) {
    throw new Error("章节正文为空（代理可能未拿到原站页面）");
  }
  const chapterNum = parsePositiveInt(chapter, 1);
  const nav = parseChapterNavigation(doc, chapterNum);
  let { prevChapter, nextChapter } = nav;
  if (prevChapter === null && chapterNum > 1) {
    prevChapter = chapterNum - 1;
  }
  // Prefer cached TOC adjacency when the current chapter is known (avoids fake "next" on last ep).
  const cached = readChapterListCache(source, id);
  if (cached?.chapters?.length) {
    const known = cached.chapters.some((item) => String(item.num) === String(chapterNum));
    if (known) {
      const adj = adjacentChapterIds(cached.chapters, chapterNum);
      prevChapter = adj.prevChapter;
      nextChapter = adj.nextChapter;
    }
  }
  return {
    title,
    novelTitle,
    contentHtml,
    foreword: parseForeword(doc),
    afterword: parseAfterword(doc),
    prevChapter,
    nextChapter,
  };
}

function renderSourceSwitcher(container, activeSource, onChange) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  container.classList.add("source-switcher");

  listSources().forEach((source) => {
    const isActive = source.id === activeSource;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-chip${isActive ? " active" : ""}`;
    button.dataset.source = source.id;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.textContent = source.name;
    button.addEventListener("click", () => {
      onChange?.(source.id);
    });
    container.appendChild(button);
  });
}

function applySourceFiltersUi(sourceId, { genreChips, sortSelect, searchInput, heroSub, activeGenre = "", activeOrder = "" } = {}) {
  const def = getSourceDef(sourceId);
  if (heroSub) {
    heroSub.textContent = def.heroSub;
  }
  if (searchInput) {
    searchInput.placeholder = def.searchPlaceholder;
  }

  const genreGroup = genreChips?.closest?.(".filter-group");
  const sortGroup = sortSelect?.closest?.(".filter-group");
  const filtersBar = genreChips?.closest?.(".filters-bar") || sortSelect?.closest?.(".filters-bar");

  if (genreChips) {
    if (!def.genres.length) {
      genreChips.innerHTML = "";
      if (genreGroup) {
        genreGroup.style.display = "none";
      } else {
        genreChips.style.display = "none";
      }
    } else {
      if (genreGroup) {
        genreGroup.style.display = "";
      }
      genreChips.style.display = "";
      genreChips.innerHTML = def.genres
        .map(
          (genre) =>
            `<button class="chip${genre.id === activeGenre ? " active" : ""}" data-genre="${escapeAttribute(genre.id)}">${escapeHtml(genre.label)}</button>`
        )
        .join("");
    }
  }

  if (sortSelect) {
    if (!def.orders.length) {
      sortSelect.innerHTML = "";
      if (sortGroup) {
        sortGroup.style.display = "none";
      } else {
        sortSelect.style.display = "none";
      }
    } else {
      if (sortGroup) {
        sortGroup.style.display = "";
      }
      sortSelect.style.display = "";
      sortSelect.innerHTML = def.orders
        .map(
          (order) =>
            `<option value="${escapeAttribute(order.id)}"${order.id === activeOrder ? " selected" : ""}>${escapeHtml(order.label)}</option>`
        )
        .join("");
    }
  }

  if (filtersBar) {
    const hideBar = !def.genres.length && !def.orders.length;
    filtersBar.style.display = hideBar ? "none" : "";
  }
}

function formatFooterSourceHtml(sourceId) {
  const def = getSourceDef(sourceId);
  const href = def.originHome || "#";
  const isExternal = /^https?:\/\//i.test(href);
  const attrs = isExternal ? ' target="_blank" rel="noopener"' : "";
  return `<a href="${escapeAttribute(href)}"${attrs}>${escapeHtml(def.fullName || def.name)}</a>`;
}
