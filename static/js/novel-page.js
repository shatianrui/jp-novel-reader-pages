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
const originLink = document.getElementById("originLink");

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
  const targetChapter = allChapters.length > 0 ? allChapters[0].num : 1;
  window.location.href = getReadUrl(currentNcode, targetChapter);
});

async function loadNovelPage() {
  const detailData = await narouJsonp({
    of: "t-n-w-s-g-ga-f-l-e-nt-k",
    ncode: currentNcode,
  });
  const novel = detailData?.[1] ? enrichNovel(detailData[1]) : null;
  if (!novel) {
    throw new Error("未找到该小说");
  }

  renderNovel(novel);
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
    const html = await fetchProxyHtml(getOriginIndexUrl(currentNcode));
    const doc = parseHtml(html);
    const parsed = parseChapterList(doc);
    allChapters = parsed.chapters;
    renderChapters(parsed.arcs, parsed.chapters);
    chapterLoading.style.display = "none";
  } catch (error) {
    console.error(error);
    chapterLoading.style.display = "none";
    chapterError.style.display = "flex";
  }
}

function parseChapterList(doc) {
  const chapters = [];
  const arcs = [];
  let currentArc = null;
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

function renderChapters(arcs, chapters) {
  if (chapters.length === 0) {
    chapterContent.innerHTML = `<p class="no-chapters">该小说为短篇，<a href="${getReadUrl(currentNcode, 1)}">点击直接阅读</a></p>`;
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
    return;
  }

  const list = document.createElement("ul");
  list.className = "chapter-ul";
  chapters.forEach((chapter) => list.appendChild(buildChapterItem(chapter)));
  chapterContent.appendChild(list);
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
