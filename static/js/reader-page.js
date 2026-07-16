const readerNcode = getQueryParam("ncode").toLowerCase();
let currentChapter = parsePositiveInt(getQueryParam("chapter"), 1);
let prevChapter = null;
let nextChapter = null;
let prefs = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
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

catalogLink.href = readerNcode ? getNovelUrl(readerNcode) : "index.html";
catalogLinkBottom.href = catalogLink.href;

if (!readerNcode) {
  showReaderError("缺少小说编号");
} else {
  applyPrefs();
  registerSettingHandlers();
  registerNavigationHandlers();
  loadContent().catch((error) => {
    console.error(error);
    showReaderError(error?.message || "内容加载失败");
  });
}

document.getElementById("settingsBtn").addEventListener("click", toggleSettings);
document.getElementById("reloadBtn").addEventListener("click", () => {
  loadContent().catch((error) => {
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
});

document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT") {
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
  currentChapter = parsePositiveInt(getQueryParam("chapter"), currentChapter);
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

async function loadContent() {
  readerArticle.style.display = "none";
  readerLoading.style.display = "flex";
  readerError.style.display = "none";

  const html = await fetchProxyHtml(getOriginChapterUrl(readerNcode, currentChapter));
  const doc = parseHtml(html);

  const title = parseChapterTitle(doc, currentChapter);
  const novelTitle = parseNovelTitleFromChapter(doc, readerNcode);
  const contentHtml = parseMainContent(doc);

  if (!contentHtml) {
    throw new Error("章节正文为空（代理可能未拿到原站页面）");
  }

  document.title = `${title} · ${novelTitle} · 日文小说`;
  document.getElementById("toolbarNovelTitle").textContent = novelTitle;
  document.getElementById("toolbarChTitle").textContent = title;
  document.getElementById("readerChTitle").textContent = title;
  document.getElementById("readerContent").innerHTML = contentHtml;

  const foreword = parseForeword(doc);
  const afterword = parseAfterword(doc);
  document.getElementById("readerForeword").innerHTML = foreword ? `<div class="word-wrap"><h4>前言</h4>${foreword}</div>` : "";
  document.getElementById("readerAfterword").innerHTML = afterword ? `<div class="word-wrap"><h4>后记</h4>${afterword}</div>` : "";

  const nav = parseChapterNavigation(doc, currentChapter);
  prevChapter = nav.prevChapter;
  nextChapter = nav.nextChapter;
  // When prev link is missing, still allow going back by sequence.
  if (prevChapter === null && currentChapter > 1) {
    prevChapter = currentChapter - 1;
  }
  // Only invent a next chapter if page looks mid-series (has prev) — avoid infinite next.
  if (nextChapter === null && prevChapter !== null) {
    nextChapter = currentChapter + 1;
  }
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
    document.getElementById(id).disabled = prevChapter === null;
  });
  ["nextBtn", "nextBtnBottom"].forEach((id) => {
    document.getElementById(id).disabled = nextChapter === null;
  });
}

function goChapter(direction) {
  const target = direction === "prev" ? prevChapter : nextChapter;
  if (target === null) {
    return;
  }
  saveReadingProgressNow();
  currentChapter = target;
  chapterChangedByNavigation = true;
  history.pushState({}, "", getReadUrl(readerNcode, currentChapter));
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
  readerArticle.style.fontFamily = font === "serif" ? "'Noto Serif SC', serif" : "'Noto Sans SC', sans-serif";
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
  const origin = readerNcode ? getOriginChapterUrl(readerNcode, currentChapter) : "https://syosetu.com/";
  readerError.innerHTML = `
    <p>⚠️ ${escapeHtml(message || "内容加载失败，请稍后重试")}</p>
    <p style="margin-top:8px;font-size:14px;opacity:.85">
      公开 CORS 代理经常失效。可打开原站阅读，或配置自建代理（localStorage.ncodeProxyBase）。
    </p>
    <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button class="btn-primary" id="reloadBtn">重新加载</button>
      <a class="btn-primary" style="display:inline-flex;align-items:center;text-decoration:none" href="${origin}" target="_blank" rel="noopener">原站打开此话</a>
    </p>`;
  document.getElementById("reloadBtn")?.addEventListener("click", () => {
    loadContent().catch((error) => {
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
  const progress = getReadingProgress(readerNcode);
  const savedChapter = parsePositiveInt(progress?.chapter, 0);
  const savedRatio = Number(progress?.scrollRatio);
  if (chapterChangedByNavigation || savedChapter !== currentChapter || !Number.isFinite(savedRatio) || savedRatio <= 0) {
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
  if (!readerNcode) {
    return;
  }
  setReadingProgress(readerNcode, {
    chapter: currentChapter,
    scrollRatio: getScrollRatio(),
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
