const novelRef = getNovelRefFromQuery();
const readerSource = novelRef.source;
const readerId = novelRef.id;
let currentChapter = getQueryParam("chapter") || "1";
let prevChapter = null;
let nextChapter = null;
let prefs = loadReaderPrefs();
const DEFAULT_FONT_SIZE = 21;
let chapterChangedByNavigation = false;
let progressSaveTimer = null;

const catalogLink = document.getElementById("catalogLink");
const catalogLinkBottom = document.getElementById("catalogLinkBottom");
const readerArticle = document.getElementById("readerArticle");
const readerLoading = document.getElementById("readerLoading");
const readerError = document.getElementById("readerError");
const progressBar = document.getElementById("progressBar");
const settingsPanel = document.getElementById("settingsPanel");
const footerSource = document.getElementById("footerSource");

catalogLink.href = readerId ? getNovelUrl(novelRef) : "index.html";
catalogLinkBottom.href = catalogLink.href;
updateFooterSource();

if (!readerId) {
  showReaderError("缺少小说编号");
} else {
  applyPrefs();
  registerSettingHandlers();
  registerNavigationHandlers();
  // Warm TOC for reliable prev/next (especially Kakuyomu episode ids).
  fetchNovelChapters(novelRef).catch(() => {});
  loadContent().catch((error) => {
    console.error(error);
    showReaderError(error?.message || "内容加载失败");
  });
}

document.getElementById("settingsBtn").addEventListener("click", toggleSettings);
document.getElementById("reloadBtn")?.addEventListener("click", () => {
  loadContent({ bypassCache: true }).catch((error) => {
    console.error(error);
    showReaderError(error?.message || "内容加载失败");
  });
});

window.addEventListener("scroll", () => {
  const doc = document.documentElement;
  const denominator = doc.scrollHeight - doc.clientHeight;
  const percentage = denominator > 0 ? (doc.scrollTop / denominator) * 100 : 0;
  progressBar.style.width = `${Math.min(100, percentage)}%`;
  scheduleSaveProgress();
}, { passive: true });

document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") {
    return;
  }
  if (event.key === "ArrowLeft") {
    goChapter("prev");
  }
  if (event.key === "ArrowRight") {
    goChapter("next");
  }
  if (event.key.toLowerCase() === "s") {
    toggleSettings();
  }
});

window.addEventListener("popstate", () => {
  currentChapter = getQueryParam("chapter") || currentChapter;
  chapterChangedByNavigation = false;
  loadContent().catch((error) => {
    console.error(error);
    showReaderError(error?.message || "内容加载失败");
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveReadingProgressNow();
  }
});

window.addEventListener("beforeunload", saveReadingProgressNow);

function loadReaderPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function updateFooterSource() {
  if (footerSource) {
    footerSource.innerHTML = formatFooterSourceHtml(readerSource);
  }
}

async function loadContent({ bypassCache = false } = {}) {
  readerArticle.style.display = "none";
  readerLoading.style.display = "flex";
  readerError.style.display = "none";

  if (bypassCache && typeof htmlFetchInflight !== "undefined") {
    // Soft bypass: drop cached chapter HTML for this URL if present.
    try {
      const url = getOriginChapterUrl(novelRef, currentChapter);
      htmlFetchCache?.delete?.(url);
    } catch (error) {
      // ignore
    }
  }

  const parsed = await fetchChapterContent(novelRef, currentChapter);

  document.title = `${parsed.title} · ${parsed.novelTitle || readerId} · 日文小说`;
  document.getElementById("toolbarNovelTitle").textContent = parsed.novelTitle || readerId;
  document.getElementById("toolbarChTitle").textContent = parsed.title;
  document.getElementById("readerChTitle").textContent = parsed.title;
  document.getElementById("readerContent").innerHTML = parsed.contentHtml;

  const foreword = parsed.foreword || "";
  const afterword = parsed.afterword || "";
  document.getElementById("readerForeword").innerHTML = foreword ? `<div class="word-wrap"><h4>前言</h4>${foreword}</div>` : "";
  document.getElementById("readerAfterword").innerHTML = afterword ? `<div class="word-wrap"><h4>后记</h4>${afterword}</div>` : "";

  prevChapter = parsed.prevChapter ?? null;
  nextChapter = parsed.nextChapter ?? null;

  updateNavButtons();
  syncSettingButtons();

  readerLoading.style.display = "none";
  readerArticle.style.display = "block";
  const restored = restoreReadingPosition();
  if (chapterChangedByNavigation || !restored) {
    saveReadingProgressNow();
  } else {
    scheduleSaveProgress();
  }
  chapterChangedByNavigation = false;
}

function registerNavigationHandlers() {
  ["prevBtn", "prevBtnBottom"].forEach((id) => {
    document.getElementById(id).addEventListener("click", () => goChapter("prev"));
  });
  ["nextBtn", "nextBtnBottom"].forEach((id) => {
    document.getElementById(id).addEventListener("click", () => goChapter("next"));
  });
}

function updateNavButtons() {
  ["prevBtn", "prevBtnBottom"].forEach((id) => {
    document.getElementById(id).disabled = prevChapter === null || prevChapter === undefined;
  });
  ["nextBtn", "nextBtnBottom"].forEach((id) => {
    document.getElementById(id).disabled = nextChapter === null || nextChapter === undefined;
  });
}

function goChapter(direction) {
  const target = direction === "prev" ? prevChapter : nextChapter;
  if (target === null || target === undefined || target === "") {
    return;
  }
  saveReadingProgressNow();
  currentChapter = String(target);
  chapterChangedByNavigation = true;
  history.pushState({}, "", getReadUrl(novelRef, currentChapter));
  loadContent().catch((error) => {
    console.error(error);
    showReaderError(error?.message || "内容加载失败");
  });
}

function toggleSettings() {
  settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
}

function registerSettingHandlers() {
  document.querySelectorAll("[data-font-size]").forEach((button) => {
    button.addEventListener("click", () => setFontSize(Number(button.dataset.fontSize)));
  });
  document.querySelectorAll("[data-font]").forEach((button) => {
    button.addEventListener("click", () => setFont(button.dataset.font));
  });
  document.querySelectorAll("[data-line-height]").forEach((button) => {
    button.addEventListener("click", () => setLineHeight(Number(button.dataset.lineHeight)));
  });
  document.querySelectorAll("[data-bg]").forEach((button) => {
    button.addEventListener("click", () => setReaderBg(button.dataset.bg));
  });
}

function savePrefs() {
  localStorage.setItem("readerPrefs", JSON.stringify(prefs));
}

function setFontSize(size) {
  readerArticle.style.fontSize = `${size}px`;
  prefs.fontSize = size;
  savePrefs();
  syncSettingButtons();
}

function setFont(font) {
  // Novel body uses JP fonts; UI chrome stays Chinese via CSS.
  const isSans = font === "sans";
  readerArticle.classList.toggle("font-sans", isSans);
  readerArticle.style.fontFamily = isSans
    ? "var(--font-jp-sans)"
    : "var(--font-jp-serif)";
  prefs.font = font;
  savePrefs();
  syncSettingButtons();
}

function setLineHeight(lineHeight) {
  readerArticle.style.lineHeight = String(lineHeight);
  prefs.lineHeight = lineHeight;
  savePrefs();
  syncSettingButtons();
}

function setReaderBg(background) {
  document.body.dataset.readerBg = background;
  prefs.readerBg = background;
  savePrefs();
  syncSettingButtons();
}

function applyPrefs() {
  setFontSize(prefs.fontSize || DEFAULT_FONT_SIZE);
  setFont(prefs.font || "serif");
  setLineHeight(prefs.lineHeight || 2);
  setReaderBg(prefs.readerBg || "sepia");
}

function syncSettingButtons() {
  document.querySelectorAll("[data-font-size]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.fontSize) === (prefs.fontSize || DEFAULT_FONT_SIZE));
  });
  document.querySelectorAll("[data-font]").forEach((button) => {
    button.classList.toggle("active", button.dataset.font === (prefs.font || "serif"));
  });
  document.querySelectorAll("[data-line-height]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.lineHeight) === Number(prefs.lineHeight || 2));
  });
  document.querySelectorAll("[data-bg]").forEach((button) => {
    button.classList.toggle("active", button.dataset.bg === (prefs.readerBg || "sepia"));
  });
}

function showReaderError(message) {
  readerLoading.style.display = "none";
  readerArticle.style.display = "none";
  readerError.style.display = "flex";
  const origin = readerId
    ? getOriginChapterUrl(novelRef, currentChapter)
    : getSourceDef(readerSource).originHome;
  readerError.innerHTML = `
    <p>⚠️ ${escapeHtml(message || "内容加载失败，请稍后重试")}</p>
    <p style="margin-top:8px;font-size:14px;opacity:.85">
      公开 CORS 代理经常失效。可打开原站阅读，或配置自建代理（localStorage.ncodeProxyBase）。
    </p>
    <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button class="btn-primary" id="reloadBtn" type="button">重新加载</button>
      <a class="btn-primary" style="display:inline-flex;align-items:center;text-decoration:none" href="${escapeAttribute(origin)}" target="_blank" rel="noopener">原站打开此话</a>
    </p>`;
  document.getElementById("reloadBtn")?.addEventListener("click", () => {
    loadContent({ bypassCache: true }).catch((error) => {
      console.error(error);
      showReaderError(error?.message || "内容加载失败");
    });
  });
}

function getScrollRatio() {
  const doc = document.documentElement;
  const denominator = doc.scrollHeight - doc.clientHeight;
  if (denominator <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, doc.scrollTop / denominator));
}

function restoreReadingPosition() {
  const progress = getReadingProgress(novelRef);
  const savedChapter = progress?.chapter;
  const savedRatio = Number(progress?.scrollRatio);
  if (
    chapterChangedByNavigation ||
    String(savedChapter) !== String(currentChapter) ||
    !Number.isFinite(savedRatio) ||
    savedRatio <= 0
  ) {
    window.scrollTo(0, 0);
    return false;
  }

  window.requestAnimationFrame(() => {
    const doc = document.documentElement;
    const denominator = doc.scrollHeight - doc.clientHeight;
    const targetTop = denominator > 0 ? Math.round(Math.min(1, Math.max(0, savedRatio)) * denominator) : 0;
    window.scrollTo(0, targetTop);
  });
  return true;
}

function saveReadingProgressNow() {
  if (!readerId) {
    return;
  }
  const title = document.getElementById("toolbarNovelTitle")?.textContent || "";
  setReadingProgress(novelRef, {
    chapter: currentChapter,
    scrollRatio: getScrollRatio(),
    title: title && title !== "加载中…" ? title : undefined,
    source: readerSource,
  });
}

function scheduleSaveProgress() {
  if (progressSaveTimer !== null) {
    return;
  }
  progressSaveTimer = window.setTimeout(() => {
    progressSaveTimer = null;
    saveReadingProgressNow();
  }, 300);
}
