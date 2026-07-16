const novelRef = getNovelRefFromQuery();
const currentSource = novelRef.source;
const currentId = novelRef.id;
let allChapters = [];

const detailLoading = document.getElementById("detailLoading");
const detailContent = document.getElementById("detailContent");
const detailError = document.getElementById("detailError");
const detailErrorMessage = document.getElementById("detailErrorMessage");
const chapterLoading = document.getElementById("chapterLoading");
const chapterError = document.getElementById("chapterError");
const chapterContent = document.getElementById("chapterContent");
const startReadBtn = document.getElementById("startReadBtn");
const shelfBtn = document.getElementById("shelfBtn");
const originLink = document.getElementById("originLink");
const footerSource = document.getElementById("footerSource");
let currentNovel = null;

originLink.href = currentId ? getOriginIndexUrl(novelRef) : getSourceDef(currentSource).originHome;
const backLink = document.querySelector(".back-link");
if (backLink) {
  const browseSource = currentSource === "kakuyomu" ? "link" : "narou";
  backLink.href = `index.html?source=${encodeURIComponent(browseSource)}`;
}
updateFooterSource();

if (!currentId) {
  showDetailError("缺少小说编号，无法加载页面");
} else {
  loadNovelPage().catch((error) => {
    console.error(error);
    showDetailError(error?.message || "小说信息加载失败，请返回首页重试");
  });
}

startReadBtn.addEventListener("click", () => {
  if (currentNovel) {
    addToShelf(currentNovel);
  }
  const targetChapter = getResumeChapter(novelRef, allChapters, allChapters[0]?.num || 1);
  window.location.href = getReadUrl(novelRef, targetChapter);
});

if (shelfBtn) {
  shelfBtn.addEventListener("click", () => {
    if (!currentNovel) {
      return;
    }
    if (isOnShelf(novelRef)) {
      removeFromShelf(novelRef);
    } else {
      addToShelf(currentNovel);
    }
    syncShelfButton();
  });
}

function updateFooterSource() {
  if (footerSource) {
    footerSource.innerHTML = formatFooterSourceHtml(currentSource);
  }
}

function syncShelfButton() {
  if (!shelfBtn) {
    return;
  }
  const on = isOnShelf(novelRef);
  shelfBtn.textContent = on ? "✓ 已在书架" : "加入书架";
  shelfBtn.classList.toggle("active", on);
}

async function loadNovelPage() {
  // Detail + chapters in parallel (Kakuyomu shares one work HTML via fetch cache).
  const chaptersPromise = fetchNovelChapters(novelRef);
  const novel = await fetchNovelDetail(novelRef);
  currentNovel = novel;
  renderNovel(novel);
  syncShelfButton();
  updateStartReadText();
  detailLoading.style.display = "none";
  detailContent.style.display = "block";
  await loadChapters(chaptersPromise);
}

function renderNovel(novel) {
  const sourceName = getSourceDef(novel.source || currentSource).name;
  document.title = `${novel.title} · ${sourceName} · 日文小说`;
  document.getElementById("coverIcon").textContent = "文";
  document.getElementById("novelTitle").textContent = novel.title || "";
  document.getElementById("novelWriter").textContent = novel.writer || "";
  document.getElementById("favCount").textContent = formatNumber(novel.fav_novel_cnt || 0);
  document.getElementById("scoreCount").textContent = formatNumber(novel.general_all_no || 0);
  document.getElementById("lengthLabel").textContent = novel.length_label;
  document.getElementById("synopsisText").innerHTML = escapeHtml(novel.story || "").replace(/\r?\n/g, "<br>");

  const badges = [];
  badges.push(`<span class="badge badge-source">${escapeHtml(sourceName)}</span>`);
  badges.push(novel.is_completed ? '<span class="badge badge-done">完结</span>' : '<span class="badge badge-ongoing">连载中</span>');
  if (!novel.is_series) {
    badges.push('<span class="badge badge-short">短篇</span>');
  }
  badges.push(`<span class="badge badge-genre">${escapeHtml(novel.genre_name)}</span>`);
  document.getElementById("novelBadges").innerHTML = badges.join("");

  const tagList = document.getElementById("tagList");
  const tags = String(novel.keyword || "").split(/\s+/).filter(Boolean);
  if (tags.length > 0) {
    tagList.style.display = "flex";
    tagList.innerHTML = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  } else {
    tagList.style.display = "none";
  }

  const favLabel = document.getElementById("favLabel");
  const scoreLabel = document.getElementById("scoreLabel");
  if (favLabel) {
    favLabel.textContent = currentSource === "kakuyomu" ? "评价点" : "收藏";
  }
  if (scoreLabel) {
    scoreLabel.textContent = currentSource === "kakuyomu" ? "话数" : "评分";
  }
}

async function loadChapters(chaptersPromise) {
  try {
    const parsed = await (chaptersPromise || fetchNovelChapters(novelRef));
    allChapters = parsed.chapters;
    renderChapters(parsed.arcs, parsed.chapters);
    updateStartReadText();
    chapterLoading.style.display = "none";
    if (parsed.chapters.length === 0) {
      chapterError.style.display = "flex";
      chapterError.innerHTML = `
        <p>未能解析章节列表（站点结构可能已变更，或代理暂时不可用）</p>
        <p><a href="${getOriginIndexUrl(novelRef)}" target="_blank" rel="noopener">在原站查看目录</a>
        · <a href="${getReadUrl(novelRef, 1)}">尝试直接阅读第 1 话</a></p>`;
    }
  } catch (error) {
    console.error(error);
    chapterLoading.style.display = "none";
    chapterError.style.display = "flex";
    chapterError.innerHTML = `
      <p>章节加载失败：${escapeHtml(error?.message || "未知错误")}</p>
      <p>可先通过“原站查看”继续阅读，或稍后重试。</p>
      <p><a href="${getOriginIndexUrl(novelRef)}" target="_blank" rel="noopener">打开原站目录</a>
      · <a href="${getReadUrl(novelRef, allChapters[0]?.num || 1)}">尝试直接阅读</a></p>`;
  }
}

function renderChapters(arcs, chapters) {
  chapterContent.innerHTML = "";
  if (chapters.length === 0) {
    chapterContent.innerHTML = `<p class="no-chapters">暂未获取到章节。该小说也可能是短篇，<a href="${getReadUrl(novelRef, 1)}">点击尝试阅读</a></p>`;
    return;
  }

  if (arcs.length > 0 && arcs.some((arc) => arc.chapters.length > 0)) {
    arcs.forEach((arc) => {
      if (arc.chapters.length === 0) {
        return;
      }
      const arcBlock = document.createElement("div");
      arcBlock.className = "arc-block";
      arcBlock.innerHTML = `<div class="arc-title">${escapeHtml(arc.title)}</div>`;
      const list = document.createElement("ul");
      list.className = "chapter-ul";
      arc.chapters.forEach((chapter) => list.appendChild(buildChapterItem(chapter)));
      arcBlock.appendChild(list);
      chapterContent.appendChild(arcBlock);
    });
    const arcNums = new Set(arcs.flatMap((arc) => arc.chapters.map((c) => String(c.num))));
    const orphans = chapters.filter((chapter) => !arcNums.has(String(chapter.num)));
    if (orphans.length > 0) {
      const list = document.createElement("ul");
      list.className = "chapter-ul";
      orphans.forEach((chapter) => list.appendChild(buildChapterItem(chapter)));
      chapterContent.appendChild(list);
    }
    return;
  }

  const list = document.createElement("ul");
  list.className = "chapter-ul";
  chapters.forEach((chapter) => list.appendChild(buildChapterItem(chapter)));
  chapterContent.appendChild(list);
}

function updateStartReadText() {
  const resumeChapter = getResumeChapter(novelRef, allChapters, allChapters[0]?.num || 1);
  const firstChapter = allChapters.length > 0 ? allChapters[0].num : 1;
  const resumed = String(resumeChapter) !== String(firstChapter);
  if (currentSource === "kakuyomu") {
    const idx = allChapters.findIndex((item) => String(item.num) === String(resumeChapter));
    startReadBtn.textContent = resumed && idx >= 0 ? `继续阅读（第 ${idx + 1} 话）` : "开始阅读";
    return;
  }
  startReadBtn.textContent = resumed ? `继续阅读（第 ${resumeChapter} 话）` : "开始阅读";
}

function buildChapterItem(chapter) {
  const item = document.createElement("li");
  item.className = "chapter-item";
  const indexLabel = currentSource === "kakuyomu"
    ? `第 ${allChapters.findIndex((entry) => String(entry.num) === String(chapter.num)) + 1} 话`
    : `第 ${chapter.num} 话`;
  item.innerHTML = `
    <a href="${getReadUrl(novelRef, chapter.num)}" class="chapter-link">
      <span class="ch-num">${escapeHtml(indexLabel)}</span>
      <span class="ch-title">${escapeHtml(chapter.title)}</span>
      ${chapter.date ? `<span class="ch-date">${escapeHtml(chapter.date)}</span>` : ""}
    </a>
  `;
  return item;
}

function showDetailError(message) {
  detailLoading.style.display = "none";
  detailContent.style.display = "none";
  detailError.style.display = "flex";
  detailErrorMessage.textContent = message;
}
