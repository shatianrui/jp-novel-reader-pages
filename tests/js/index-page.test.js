/**
 * Tests for static/js/index-page.js
 *
 * index-page.js depends on DOM elements at its top level, so we set up the
 * required DOM first, then evaluate both scripts at module scope so that all
 * function declarations are hoisted into the module-level scope and remain
 * accessible in every test.
 */

const fs = require("fs");
const path = require("path");

const commonSrc = fs.readFileSync(
  path.join(__dirname, "../../static/js/common.js"),
  "utf8"
);
const indexPageSrc = fs.readFileSync(
  path.join(__dirname, "../../static/js/index-page.js"),
  "utf8"
);

// Minimal HTML that satisfies all getElementById / querySelectorAll calls
// at the top of index-page.js.  Must be set up BEFORE the scripts are eval'd.
document.body.innerHTML = `
  <input id="searchInput" value="" />
  <button id="searchBtn">Search</button>
  <select id="sortSelect"><option value="hyoka">hyoka</option></select>
  <div id="novelGrid"></div>
  <div id="loading" style="display:none"></div>
  <div id="emptyState" style="display:none"></div>
  <div id="resultsBar" style="display:none"></div>
  <span id="resultsInfo"></span>
  <div id="pagination"></div>
`;

// Evaluate at module scope so function declarations are hoisted here.
eval(commonSrc); // eslint-disable-line no-eval
eval(indexPageSrc); // eslint-disable-line no-eval

beforeEach(() => {
  localStorage.clear();
  // Clear only the containers used by individual tests; don't reset body
  // (module-level vars like `pagination` still point to the live elements).
  document.getElementById("novelGrid").innerHTML = "";
  document.getElementById("pagination").innerHTML = "";
});

// ------------------------------------------------------------------
// highlightGenre
// ------------------------------------------------------------------

describe("highlightGenre", () => {
  beforeEach(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <button class="chip" data-genre="201">Fantasy</button>
      <button class="chip" data-genre="101">Romance</button>
      <button class="chip" data-genre="">All</button>
    `
    );
  });

  afterEach(() => {
    // Remove the chip buttons added in this suite
    document.querySelectorAll(".chip").forEach((el) => el.remove());
  });

  test("activates the matching chip", () => {
    highlightGenre("201");
    expect(document.querySelector('[data-genre="201"]').classList.contains("active")).toBe(true);
  });

  test("deactivates non-matching chips", () => {
    highlightGenre("201");
    expect(document.querySelector('[data-genre="101"]').classList.contains("active")).toBe(false);
  });

  test("activates empty-genre chip when genre is empty string", () => {
    highlightGenre("");
    expect(document.querySelector('[data-genre=""]').classList.contains("active")).toBe(true);
  });
});

// ------------------------------------------------------------------
// buildCard
// ------------------------------------------------------------------

describe("buildCard", () => {
  const baseNovel = () => ({
    ncode: "n0001a",
    title: "Test Novel",
    writer: "Author",
    genre_icon: "⚔️",
    genre_name: "高幻想·奇幻",
    is_completed: false,
    is_series: true,
    length_label: "50000字",
    story: "A great story about adventure.",
    fav_novel_cnt: 1234,
    general_all_no: 5678,
  });

  test("returns a div element", () => {
    const card = buildCard(baseNovel());
    expect(card.tagName).toBe("DIV");
  });

  test("card has novel-card class", () => {
    const card = buildCard(baseNovel());
    expect(card.classList.contains("novel-card")).toBe(true);
  });

  test("card contains novel title", () => {
    const card = buildCard(baseNovel());
    expect(card.innerHTML).toContain("Test Novel");
  });

  test("card contains author", () => {
    const card = buildCard(baseNovel());
    expect(card.innerHTML).toContain("Author");
  });

  test("shows 连载中 badge for ongoing series", () => {
    const card = buildCard(baseNovel());
    expect(card.innerHTML).toContain("连载中");
  });

  test("shows 完结 badge for completed novel", () => {
    const novel = { ...baseNovel(), is_completed: true };
    const card = buildCard(novel);
    expect(card.innerHTML).toContain("完结");
  });

  test("shows 短篇 badge for non-series", () => {
    const novel = { ...baseNovel(), is_series: false };
    const card = buildCard(novel);
    expect(card.innerHTML).toContain("短篇");
  });

  test("does not show 短篇 badge for series", () => {
    const card = buildCard(baseNovel());
    expect(card.innerHTML).not.toContain("短篇");
  });

  test("story is truncated to 100 chars with ellipsis", () => {
    const long = "a".repeat(200);
    const card = buildCard({ ...baseNovel(), story: long });
    expect(card.innerHTML).toContain("…");
  });

  test("story under 100 chars has no ellipsis", () => {
    const short = "short story";
    const card = buildCard({ ...baseNovel(), story: short });
    expect(card.innerHTML).not.toContain("…");
  });

  test("escapes HTML in title to prevent XSS", () => {
    const novel = { ...baseNovel(), title: '<script>alert("xss")</script>' };
    const card = buildCard(novel);
    expect(card.innerHTML).not.toContain("<script>");
    expect(card.innerHTML).toContain("&lt;script&gt;");
  });

  test("card link points to novel page", () => {
    const card = buildCard(baseNovel());
    const link = card.querySelector("a.card-link");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toContain("n0001a");
  });
});

// ------------------------------------------------------------------
// buildPagination
// ------------------------------------------------------------------

describe("buildPagination", () => {
  let paginationEl;

  beforeEach(() => {
    paginationEl = document.getElementById("pagination");
    paginationEl.innerHTML = "";
  });

  test("does nothing when total fits on one page", () => {
    buildPagination(10, 1);
    expect(paginationEl.children.length).toBe(0);
  });

  test("does nothing when total is exactly 20", () => {
    buildPagination(20, 1);
    expect(paginationEl.children.length).toBe(0);
  });

  test("renders buttons when more than one page", () => {
    buildPagination(100, 1);
    expect(paginationEl.children.length).toBeGreaterThan(0);
  });

  test("prev button is disabled on first page", () => {
    buildPagination(100, 1);
    const prevBtn = paginationEl.querySelector("button");
    expect(prevBtn.disabled).toBe(true);
  });

  test("next button is disabled on last page", () => {
    buildPagination(40, 2); // 40 total = 2 pages, on page 2
    const buttons = paginationEl.querySelectorAll("button");
    const lastBtn = buttons[buttons.length - 1];
    expect(lastBtn.disabled).toBe(true);
  });

  test("active page button has active class", () => {
    buildPagination(100, 3);
    const activeBtn = Array.from(paginationEl.querySelectorAll("button")).find(
      (b) => b.classList.contains("active")
    );
    expect(activeBtn).not.toBeNull();
    expect(activeBtn.textContent).toBe("3");
  });

  test("renders first page button when far from start", () => {
    buildPagination(200, 6); // 10 pages, on page 6
    const buttons = Array.from(paginationEl.querySelectorAll("button"));
    const firstPageBtn = buttons.find((b) => b.textContent === "1");
    expect(firstPageBtn).not.toBeNull();
  });

  test("renders last page button when far from end", () => {
    buildPagination(200, 2); // 10 pages, on page 2
    const buttons = Array.from(paginationEl.querySelectorAll("button"));
    const lastPageBtn = buttons.find((b) => b.textContent === "10");
    expect(lastPageBtn).not.toBeNull();
  });

  test("ellipsis shown when pages are skipped", () => {
    buildPagination(400, 8); // 20 pages, on page 8
    const ellipses = paginationEl.querySelectorAll(".page-ellipsis");
    expect(ellipses.length).toBeGreaterThan(0);
  });
});

