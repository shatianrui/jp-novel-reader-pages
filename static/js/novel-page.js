const currentNcode = getQueryParam("ncode").toLowerCase();
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
let currentNovel = null;

originLink.href = getOriginIndexUrl(currentNcode || "");

if (!currentNcode) {
  showDetailError("缺少小说编号，无法加载页面");
} else {
  loadNovelPage().catch((error) => {
    console.error(error);
    showDetailError("小说信息加载失败，请返回首页重试");
  });
}

startReadBtn.addEventListener("click", () => {
  if (currentNovel) {
    addToShelf(currentNovel);
  }
  const targetChapter = getResumeChapter(currentNcode, allChapters, 1);
  window.location.href = getReadUrl(currentNcode, targetChapter);
});

if (shelfBtn) {
  shelfBtn.addEventListener("click", () => {
    if (!currentNovel) {
      return;
    }
    if (isOnShelf(currentNcode)) {
      removeFromShelf(currentNcode);
    } else {
      addToShelf(currentNovel);
    }
    syncShelfButton();
  });
}

function syncShelfButton() {
  if (!shelfBtn) {
    return;
  }
  const on = isOnShelf(currentNcode);
  shelfBtn.textContent = on ? "✓ 已在书架" : "加入书架";
  shelfBtn.classList.toggle("active", on);
}


async function loadNovelPage() {
  const detailData = await narouJsonp({
    of: "t-n-w-s-g-ga-f-l-e-nt-k",
    ncode: currentNcode,
  });
  const novel = detailData?.[1] ? enrichNovel(detailData[1]) : null;
  if (!novel) {
    throw new Error("未找到该小说");
  }

  currentNovel = novel;
  renderNovel(novel);
  syncShelfButton();
  updateStartReadText();
  detailLoading.style.display = "none";
  detailContent.style.display = "block";
  await loadChapters();
}

function renderNovel(novel) {
  document.title = `${novel.title} · 日文小说`;
  document.getElementById("coverIcon").textContent = novel.genre_icon;
  document.getElementById("novelTitle").textContent = novel.title || "";
  document.getElementById("novelWriter").textContent = novel.writer || "";
  document.getElementById("favCount").textContent = formatNumber(novel.fav_novel_cnt || 0);
  document.getElementById("scoreCount").textContent = formatNumber(novel.general_all_no || 0);
  document.getElementById("lengthLabel").textContent = novel.length_label;
  document.getElementById("synopsisText").innerHTML = escapeHtml(novel.story || "").replace(/\r?\n/g, "<br>");

  const badges = [];
  badges.push(novel.is_completed ? '<span class="badge badge-done">完结</span>' : '<span class="badge badge-ongoing">连载中</span>');
  if (!novel.is_series) {
    badges.push('<span class="badge badge-short">短篇</span>');
  }
  badges.push(`<span class="badge badge-genre">${escapeHtml(novel.genre_icon)} ${escapeHtml(novel.genre_name)}</span>`);
  document.getElementById("novelBadges").innerHTML = badges.join("");

  const tagList = document.getElementById("tagList");
  const tags = String(novel.keyword || "").split(/\s+/).filter(Boolean);
  if (tags.length > 0) {
    tagList.style.display = "flex";
    tagList.innerHTML = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  } else {
    tagList.style.display = "none";
  }
}

async function loadChapters() {
  try {
    const parsed = await fetchAllChapters(currentNcode);
    allChapters = parsed.chapters;
    renderChapters(parsed.arcs, parsed.chapters);
    updateStartReadText();
    chapterLoading.style.display = "none";
    if (parsed.chapters.length === 0) {
      chapterError.style.display = "flex";
      chapterError.innerHTML = `
        <p>未能解析章节列表（站点结构可能已变更，或代理暂时不可用）</p>
        <p><a href="${getOriginIndexUrl(currentNcode)}" target="_blank" rel="noopener">在原站查看目录</a>
        · <a href="${getReadUrl(currentNcode, 1)}">尝试直接阅读第 1 话</a></p>`;
    }
  } catch (error) {
    console.error(error);
    chapterLoading.style.display = "none";
    chapterError.style.display = "flex";
    chapterError.innerHTML = `
      <p>章节加载失败：${escapeHtml(error?.message || "未知错误")}</p>
      <p>可先通过“原站查看”继续阅读，或稍后重试。</p>
      <p><a href="${getOriginIndexUrl(currentNcode)}" target="_blank" rel="noopener">打开原站目录</a>
      · <a href="${getReadUrl(currentNcode, 1)}">尝试直接阅读第 1 话</a></p>`;
  }
}

function renderChapters(arcs, chapters) {
  chapterContent.innerHTML = "";
  if (chapters.length === 0) {
    chapterContent.innerHTML = `<p class="no-chapters">暂未获取到章节。该小说也可能是短篇，<a href="${getReadUrl(currentNcode, 1)}">点击尝试阅读</a></p>`;
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
    // Append any chapters not grouped into arcs
    const arcNums = new Set(arcs.flatMap((arc) => arc.chapters.map((c) => c.num)));
    const orphans = chapters.filter((chapter) => !arcNums.has(chapter.num));
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
  const resumeChapter = getResumeChapter(currentNcode, allChapters, 1);
  const firstChapter = allChapters.length > 0 ? parsePositiveInt(allChapters[0].num, 1) : 1;
  startReadBtn.textContent = resumeChapter > firstChapter ? `继续阅读（第 ${resumeChapter} 话）` : "开始阅读";
}

function buildChapterItem(chapter) {
  const item = document.createElement("li");
  item.className = "chapter-item";
  item.innerHTML = `
    <a href="${getReadUrl(currentNcode, chapter.num)}" class="chapter-link">
      <span class="ch-num">第 ${chapter.num} 话</span>
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
