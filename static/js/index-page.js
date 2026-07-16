let currentPage = parsePositiveInt(getQueryParam("page"), 1);
let currentQuery = getQueryParam("q");
let currentGenre = getQueryParam("genre");
let currentOrder = getQueryParam("order") || "hyoka";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const sortSelect = document.getElementById("sortSelect");
const novelGrid = document.getElementById("novelGrid");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const resultsBar = document.getElementById("resultsBar");
const resultsInfo = document.getElementById("resultsInfo");
const pagination = document.getElementById("pagination");

searchInput.value = currentQuery;
sortSelect.value = currentOrder;
highlightGenre(currentGenre);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    currentGenre = chip.dataset.genre || "";
    currentPage = 1;
    highlightGenre(currentGenre);
    doSearch();
  });
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    doSearch();
  }
});

searchBtn.addEventListener("click", () => doSearch());
sortSelect.addEventListener("change", () => doSearch());

function highlightGenre(genre) {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.genre === genre);
  });
}

function updateUrl() {
  const params = new URLSearchParams();
  if (currentQuery) {
    params.set("q", currentQuery);
  }
  if (currentGenre) {
    params.set("genre", currentGenre);
  }
  if (currentOrder && currentOrder !== "hyoka") {
    params.set("order", currentOrder);
  }
  if (currentPage > 1) {
    params.set("page", currentPage);
  }
  history.replaceState({}, "", `index.html${params.toString() ? `?${params}` : ""}`);
}

async function doSearch(page) {
  currentPage = page || 1;
  currentQuery = searchInput.value.trim();
  currentOrder = sortSelect.value;
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
    const data = await narouJsonp({
      of: "t-n-w-s-g-ga-f-l-e-nt",
      lim: "20",
      st: String((currentPage - 1) * 20 + 1),
      order: currentOrder,
      word: currentQuery,
      genre: currentGenre,
    });

    const total = Number(data?.[0]?.allcount || 0);
    const novels = (data || []).slice(1).map(enrichNovel);
    loading.style.display = "none";

    if (novels.length === 0) {
      emptyState.style.display = "block";
      return;
    }

    resultsBar.style.display = "block";
    const demoNote = data?._demo ? " · ⚠️ 离线示例数据（なろう API 不可达）" : "";
    resultsInfo.textContent = `共 ${formatNumber(total)} 部，当前第 ${currentPage} 页${demoNote}`;
    novels.forEach((novel) => {
      novelGrid.appendChild(buildCard(novel));
    });
    buildPagination(total, currentPage);
  } catch (error) {
    console.error(error);
    loading.style.display = "none";
    emptyState.style.display = "block";
    emptyState.innerHTML = `<p>😔 小说列表加载失败</p>
      <p style="margin-top:8px;font-size:14px;opacity:.85">${escapeHtml(error?.message || "网络或 API 不可用")}</p>
      <p style="margin-top:8px;font-size:13px;opacity:.75">若在国内网络，なろう API 可能被拦截；已尝试代理回退。可刷新重试。</p>`;
  }
}

function buildCard(novel) {
  const card = document.createElement("div");
  const story = String(novel.story || "").replace(/\r?\n/g, " ").slice(0, 100);
  const status = novel.is_completed
    ? '<span class="badge badge-done">完结</span>'
    : '<span class="badge badge-ongoing">连载中</span>';
  const shortBadge = novel.is_series ? "" : '<span class="badge badge-short">短篇</span>';

  card.className = "novel-card";
  card.innerHTML = `
    <a href="${getNovelUrl(novel.ncode)}" class="card-link">
      <div class="card-header">
        <span class="card-genre">${escapeHtml(novel.genre_icon)} ${escapeHtml(novel.genre_name)}</span>
        <div class="card-badges">${status}${shortBadge}</div>
      </div>
      <h3 class="card-title">${escapeHtml(novel.title || "")}</h3>
      <p class="card-author">作者：${escapeHtml(novel.writer || "")}</p>
      <p class="card-story">${escapeHtml(story)}${story.length >= 100 ? "…" : ""}</p>
      <div class="card-meta">
        <span title="收藏">⭐ ${formatNumber(novel.fav_novel_cnt || 0)}</span>
        <span title="综合评分">🏆 ${formatNumber(novel.general_all_no || 0)}</span>
        <span title="字数">📝 ${escapeHtml(novel.length_label)}</span>
      </div>
    </a>
  `;
  return card;
}

function buildPagination(total, page) {
  const totalPages = Math.ceil(total / 20);
  if (totalPages <= 1) {
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

  addButton("下一页 ›", page + 1, page === totalPages, false);
}

loadNovels();
