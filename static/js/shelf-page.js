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
    const progress = getReadingProgress(item.ncode);
    const chapter = parsePositiveInt(progress?.chapter, 0);
    const card = document.createElement("div");
    card.className = "novel-card shelf-card";
    const resumeLabel = chapter > 0 ? `续读第 ${chapter} 话` : "开始阅读";
    const resumeUrl = getReadUrl(item.ncode, chapter > 0 ? chapter : 1);
    card.innerHTML = `
      <div class="card-header">
        <span class="card-genre">${escapeHtml(item.genre_icon || "📖")} 书架</span>
        <button type="button" class="shelf-remove-btn" data-ncode="${escapeAttribute(item.ncode)}" title="移出书架">✕</button>
      </div>
      <a href="${getNovelUrl(item.ncode)}" class="card-link">
        <h3 class="card-title">${escapeHtml(item.title || item.ncode)}</h3>
        <p class="card-author">作者：${escapeHtml(item.writer || "未知")}</p>
        <p class="card-story">${escapeHtml(String(item.story || "").replace(/\r?\n/g, " ").slice(0, 90))}${String(item.story || "").length > 90 ? "…" : ""}</p>
      </a>
      <div class="shelf-card-actions">
        <a class="btn-primary shelf-action" href="${resumeUrl}">${resumeLabel}</a>
        <a class="btn-outline shelf-action" href="${getNovelUrl(item.ncode)}">详情</a>
      </div>
    `;
    shelfGrid.appendChild(card);
  });

  shelfGrid.querySelectorAll(".shelf-remove-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ncode = button.dataset.ncode;
      if (!ncode) {
        return;
      }
      removeFromShelf(ncode);
      renderShelf();
    });
  });
}

renderShelf();
