const NAROU_API_BASE = "https://api.syosetu.com/novelapi/api/";
const NCODE_PROXY_BASE = "https://cors.eu.org/";

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

function getOriginIndexUrl(ncode) {
  return `https://ncode.syosetu.com/${String(ncode).toLowerCase()}/`;
}

function getOriginChapterUrl(ncode, chapter) {
  return `${getOriginIndexUrl(ncode)}${chapter}/`;
}

function narouJsonp(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `narouJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const query = new URLSearchParams({ ...params, out: "jsonp", callback: callbackName });
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("API 请求超时"));
    }, 12000);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("API 请求失败"));
    };
    script.src = `${NAROU_API_BASE}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

async function fetchProxyHtml(url) {
  const response = await fetch(`${NCODE_PROXY_BASE}${url}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`代理请求失败：${response.status}`);
  }
  return response.text();
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
  const lastPart = parts[parts.length - 1];
  const parsed = Number.parseInt(lastPart, 10);
  return Number.isInteger(parsed) ? parsed : fallbackValue;
}

function parseContentBlock(container) {
  if (!container) {
    return "";
  }

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

function setErrorText(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
  }
}
