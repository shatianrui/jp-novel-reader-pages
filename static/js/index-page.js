let currentSource = normalizeSourceId(getQueryParam("source") || getStoredSource());
let currentPage = parsePositiveInt(getQueryParam("page"), 1);
let currentQuery = getQueryParam("q");
let currentGenre = getQueryParam("genre");
let currentOrder = getQueryParam("order") || getSourceDef(currentSource).defaultOrder;

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const sortSelect = document.getElementById("sortSelect");
const novelGrid = document.getElementById("novelGrid");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const resultsBar = document.getElementById("resultsBar");
const resultsInfo = document.getElementById("resultsInfo");
const pagination = document.getElementById("pagination");
const genreChips = document.getElementById("genreChips");
const sourceSwitcher = document.getElementById("sourceSwitcher");
const heroSub = document.querySelector(".hero-sub");
const footerSource = document.getElementById("footerSource");

setStoredSource(currentSource);
searchInput.value = currentQuery;
bindSourceUi();
renderSourceSwitcher(sourceSwitcher, currentSource, switchSource);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    doSearch();
  }
});

searchBtn.addEventListener("click", () => doSearch());
sortSelect.addEventListener("change", () => doSearch());

function bindGenreChips() {
  genreChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      currentGenre = chip.dataset.genre || "";
      currentPage = 1;
      highlightGenre(currentGenre);
      doSearch();
    });
  });
}

function bindSourceUi() {
  if (!getSourceDef(currentSource).orders.some((order) => order.id === currentOrder)) {
    currentOrder = getSourceDef(currentSource).defaultOrder;
  }
  if (!getSourceDef(currentSource).genres.some((genre) => genre.id === currentGenre)) {
    currentGenre = "";
  }
  applySourceFiltersUi(currentSource, {
    genreChips,
    sortSelect,
    searchInput,
    heroSub,
    activeGenre: currentGenre,
    activeOrder: currentOrder,
  });
  sortSelect.value = currentOrder;
  highlightGenre(currentGenre);
  bindGenreChips();
  updateFooterSource();
  updateNavSourceLinks();
}

function switchSource(nextSource) {
  const normalized = normalizeSourceId(nextSource);
  if (normalized === currentSource) {
    return;
  }
  currentSource = normalized;
  setStoredSource(currentSource);
  currentPage = 1;
  currentGenre = "";
  currentOrder = getSourceDef(currentSource).defaultOrder;
  renderSourceSwitcher(sourceSwitcher, currentSource, switchSource);
  bindSourceUi();
  doSearch();
}

function highlightGenre(genre) {
  genreChips.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.genre === genre);
  });
}

function updateFooterSource() {
  if (footerSource) {
    footerSource.innerHTML = formatFooterSourceHtml(currentSource);
  }
}

function mapNavOrder(sourceId, orderKey) {
  // only narou uses remote order keys in nav
  if (sourceId !== "narou") {
    return getSourceDef(sourceId).defaultOrder || "";
  }
  return orderKey;
}

function updateNavSourceLinks() {
  document.querySelectorAll("[data-nav-order]").forEach((link) => {
    const orderId = mapNavOrder(currentSource, link.dataset.navOrder);
    link.href = `index.html?source=${encodeURIComponent(currentSource)}&order=${encodeURIComponent(orderId)}`;
  });
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set("source", currentSource);
  if (currentQuery) {
    params.set("q", currentQuery);
  }
  if (currentGenre) {
    params.set("genre", currentGenre);
  }
  if (currentOrder && currentOrder !== getSourceDef(currentSource).defaultOrder) {
    params.set("order", currentOrder);
  }
  if (currentPage > 1) {
    params.set("page", currentPage);
  }
  history.replaceState({}, "", `index.html?${params.toString()}`);
}

function tryOpenDirectRef(rawQuery) {
  const ref = parseAnyWorkRef(rawQuery);
  if (ref) {
    window.location.href = getNovelUrl(ref);
    return true;
  }
  return false;
}

async function doSearch(page) {
  currentPage = page || 1;
  currentQuery = searchInput.value.trim();
  currentOrder = sortSelect.value;
  if (currentQuery && tryOpenDirectRef(currentQuery)) {
    return;
  }
  updateUrl();
  await loadNovels();
}

async function loadNovels() {
  novelGrid.innerHTML = "";
  pagination.innerHTML = "";
  loading.style.display = "flex";
  emptyState.style.display = "none";
  resultsBar.style.display = "none";

  try {
    const data = await searchSource(currentSource, {
      query: currentQuery,
      genre: currentGenre,
      order: currentOrder,
      page: currentPage,
    });

    loading.style.display = "none";
    const total = Number(data.total || data.novels.length || 0);
    const sourceLabel = getSourceDef(currentSource).name;

    if (!data.novels.length) {
      emptyState.style.display = "block";
      if (currentSource === "link") {
        emptyState.innerHTML = "<p>粘贴链接即可打开</p>"
          + "<p style=\"margin-top:8px;font-size:14px;opacity:.85\">支持 なろう（ncode.syosetu.com/nxxxx）与 カクヨム（kakuyomu.jp/works/…）</p>"
          + "<p style=\"margin-top:8px;font-size:13px;opacity:.75\">不爬列表，打开速度最快</p>"
          + "<p style=\"margin-top:14px;font-size:13px\" id=\"linkDemoHints\"></p>";
        loadLinkDemoHints();
      } else if (currentSource === "shelf") {
        emptyState.innerHTML = "<p>书架还是空的</p>"
          + "<p style=\"margin-top:8px;font-size:14px;opacity:.85\">去「なろう」找书，详情页点「加入书架」</p>";
      } else if (currentSource === "recent") {
        emptyState.innerHTML = "<p>暂无阅读记录</p>"
          + "<p style=\"margin-top:8px;font-size:14px;opacity:.85\">打开任意章节后会出现在这里</p>";
      } else {
        emptyState.innerHTML = "<p>暂无结果，换个关键词试试</p>";
      }
      if (data.message) {
        resultsBar.style.display = "block";
        resultsInfo.textContent = "【" + sourceLabel + "】" + data.message;
      }
      return;
    }

    resultsBar.style.display = "block";
    const note = data.message || (data.demo ? "离线示例数据" : "");
    resultsInfo.textContent = note
      ? ("【" + sourceLabel + "】共 " + formatNumber(total) + " 部 · " + note)
      : ("【" + sourceLabel + "】共 " + formatNumber(total) + " 部，当前第 " + currentPage + " 页");
    data.novels.forEach((novel) => {
      novelGrid.appendChild(buildCard(novel));
    });
    buildPagination(total, currentPage, data.pageSize || 20, data.hasNext);
  } catch (error) {
    console.error(error);
    loading.style.display = "none";
    emptyState.style.display = "block";
    emptyState.innerHTML = `<p>小说列表加载失败</p>
      <p style="margin-top:8px;font-size:14px;opacity:.85">${escapeHtml(error?.message || "网络或 API 不可用")}</p>
      <p style="margin-top:8px;font-size:13px;opacity:.75">可切换阅读源，或配置自建 CORS 代理后重试。</p>`;
  }
}

function buildCard(novel) {
  const card = document.createElement("div");
  const story = String(novel.story || "").replace(/\r?\n/g, " ").slice(0, 100);
  const status = novel.is_completed
    ? '<span class="badge badge-done">完结</span>'
    : '<span class="badge badge-ongoing">连载中</span>';
  const shortBadge = novel.is_series ? "" : '<span class="badge badge-short">短篇</span>';
  const sourceBadge = `<span class="badge badge-source">${escapeHtml(novel.source === "kakuyomu" ? "カクヨム" : "なろう")}</span>`;
  const ref = { source: novel.source === "kakuyomu" ? "kakuyomu" : "narou", id: novel.id || novel.ncode };

  card.className = "novel-card";
  card.innerHTML = `
    <a href="${getNovelUrl(ref)}" class="card-link">
      <div class="card-header">
        <span class="card-genre">${escapeHtml(novel.genre_name)}</span>
        <div class="card-badges">${sourceBadge}${status}${shortBadge}</div>
      </div>
      <h3 class="card-title">${escapeHtml(novel.title || "")}</h3>
      <p class="card-author">作者：${escapeHtml(novel.writer || "")}</p>
      <p class="card-story">${escapeHtml(story)}${story.length >= 100 ? "…" : ""}</p>
      <div class="card-meta">
        <span title="收藏/评价">藏 ${formatNumber(novel.fav_novel_cnt || 0)}</span>
        <span title="话数/评分项">评 ${formatNumber(novel.general_all_no || 0)}</span>
        <span title="字数">${escapeHtml(novel.length_label)}</span>
      </div>
    </a>
  `;
  return card;
}

function buildPagination(total, page, pageSize, hasNext) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showNext = hasNext === true || page < totalPages;
  if (totalPages <= 1 && !showNext) {
    return;
  }

  const addButton = (label, targetPage, disabled, active) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.className = `page-btn${active ? " active" : ""}`;
    button.disabled = disabled;
    button.addEventListener("click", () => doSearch(targetPage));
    pagination.appendChild(button);
  };

  addButton("‹ 上一页", page - 1, page === 1, false);

  if (totalPages > 1) {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    if (start > 1) {
      addButton("1", 1, false, false);
      if (start > 2) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "page-ellipsis";
        ellipsis.textContent = "…";
        pagination.appendChild(ellipsis);
      }
    }

    for (let index = start; index <= end; index += 1) {
      addButton(String(index), index, false, index === page);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "page-ellipsis";
        ellipsis.textContent = "…";
        pagination.appendChild(ellipsis);
      }
      addButton(String(totalPages), totalPages, false, false);
    }
  } else {
    addButton(String(page), page, false, true);
  }

  addButton("下一页 ›", page + 1, !showNext, false);
}

async function loadLinkDemoHints() {
  const host = document.getElementById("linkDemoHints");
  if (!host) {
    return;
  }
  try {
    const response = await fetch("static/data/demo-kakuyomu.json", { cache: "force-cache" });
    if (!response.ok) {
      return;
    }
    const demos = await response.json();
    const samples = (Array.isArray(demos) ? demos : []).slice(0, 3);
    if (!samples.length) {
      return;
    }
    host.innerHTML = "示例："
      + samples
        .map(
          (item) =>
            `<a href="${getNovelUrl({ source: "kakuyomu", id: String(item.id) })}">${escapeHtml(item.title || item.id)}</a>`
        )
        .join(" · ");
  } catch (error) {
    // ignore
  }
}

loadNovels();
