const shelfGrid = document.getElementById("shelfGrid");
const shelfEmpty = document.getElementById("shelfEmpty");

function renderShelf() {
  const items = listBookshelf();
  shelfGrid.innerHTML = "";

  if (items.length === 0) {
    shelfEmpty.style.display = "block";
    return;
  }

  shelfEmpty.style.display = "none";
  items.forEach((item) => {
    const ref = { source: item.source || "narou", id: item.id || item.ncode };
    const progress = getReadingProgress(ref);
    const chapter = progress?.chapter;
    const card = document.createElement("div");
    card.className = "novel-card shelf-card";
    const sourceName = getSourceDef(ref.source).name;
    let resumeLabel = "开始阅读";
    let resumeChapter = chapter || (ref.source === "narou" ? 1 : "");
    if (chapter != null && chapter !== "") {
      resumeLabel = ref.source === "kakuyomu" ? "继续阅读" : `续读第 ${chapter} 话`;
    }
    const resumeUrl = resumeChapter !== ""
      ? getReadUrl(ref, resumeChapter)
      : getNovelUrl(ref);

    card.innerHTML = `
      <div class="card-header">
        <span class="card-genre">${escapeHtml(sourceName)}</span>
        <button type="button" class="shelf-remove-btn" data-key="${escapeAttribute(item.key || makeItemKey(ref.source, ref.id))}" title="移出书架">✕</button>
      </div>
      <a href="${getNovelUrl(ref)}" class="card-link">
        <h3 class="card-title">${escapeHtml(item.title || ref.id)}</h3>
        <p class="card-author">作者：${escapeHtml(item.writer || "未知")}</p>
        <p class="card-story">${escapeHtml(String(item.story || "").replace(/\r?\n/g, " ").slice(0, 90))}${String(item.story || "").length > 90 ? "…" : ""}</p>
      </a>
      <div class="shelf-card-actions">
        <a class="btn-primary shelf-action" href="${resumeUrl}">${resumeLabel}</a>
        <a class="btn-outline shelf-action" href="${getNovelUrl(ref)}">详情</a>
      </div>
    `;
    shelfGrid.appendChild(card);
  });

  shelfGrid.querySelectorAll(".shelf-remove-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.key;
      if (!key) {
        return;
      }
      removeFromShelf(key);
      renderShelf();
    });
  });
}

renderShelf();
