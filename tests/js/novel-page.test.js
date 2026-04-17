/**
 * Tests for static/js/novel-page.js
 *
 * novel-page.js depends on DOM elements at its top level. We set up the
 * required DOM first, then evaluate both scripts at module scope.
 */

const fs = require("fs");
const path = require("path");

const commonSrc = fs.readFileSync(
  path.join(__dirname, "../../static/js/common.js"),
  "utf8"
);
const novelPageSrc = fs.readFileSync(
  path.join(__dirname, "../../static/js/novel-page.js"),
  "utf8"
);

// Minimal HTML satisfying all getElementById calls at the top of novel-page.js
document.body.innerHTML = `
  <div id="detailLoading"></div>
  <div id="detailContent" style="display:none"></div>
  <div id="detailError" style="display:none"></div>
  <div id="detailErrorMessage"></div>
  <div id="chapterLoading"></div>
  <div id="chapterError" style="display:none"></div>
  <div id="chapterContent"></div>
  <button id="startReadBtn">开始阅读</button>
  <a id="originLink" href="">源站</a>
  <span id="coverIcon"></span>
  <span id="novelTitle"></span>
  <span id="novelWriter"></span>
  <span id="favCount"></span>
  <span id="scoreCount"></span>
  <span id="lengthLabel"></span>
  <div id="synopsisText"></div>
  <div id="novelBadges"></div>
  <div id="tagList" style="display:none"></div>
`;

eval(commonSrc); // eslint-disable-line no-eval
eval(novelPageSrc); // eslint-disable-line no-eval

beforeEach(() => {
  localStorage.clear();
  document.getElementById("chapterContent").innerHTML = "";
});

// ------------------------------------------------------------------
// parseChapterList
// ------------------------------------------------------------------

describe("parseChapterList", () => {
  function makeDoc(html) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;
    return doc;
  }

  test("returns empty arrays when no index_box", () => {
    const doc = makeDoc("<div></div>");
    const result = parseChapterList(doc);
    expect(result.chapters).toEqual([]);
    expect(result.arcs).toEqual([]);
  });

  test("parses simple chapter list", () => {
    const doc = makeDoc(`
      <div class="index_box">
        <dl>
          <dt>2024-01-01</dt>
          <dd class="subtitle"><a href="/n1234ab/1/">第一話</a></dd>
        </dl>
        <dl>
          <dt>2024-01-02</dt>
          <dd class="subtitle"><a href="/n1234ab/2/">第二話</a></dd>
        </dl>
      </div>
    `);
    const result = parseChapterList(doc);
    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0].num).toBe(1);
    expect(result.chapters[0].title).toBe("第一話");
    expect(result.chapters[0].date).toBe("2024-01-01");
  });

  test("parses chapters with arcs", () => {
    const doc = makeDoc(`
      <div class="index_box">
        <div class="chapter_title">第一章</div>
        <dl>
          <dt>2024-01-01</dt>
          <dd class="subtitle"><a href="/n1234ab/1/">話一</a></dd>
        </dl>
        <div class="chapter_title">第二章</div>
        <dl>
          <dt>2024-01-02</dt>
          <dd class="subtitle"><a href="/n1234ab/2/">話二</a></dd>
        </dl>
      </div>
    `);
    const result = parseChapterList(doc);
    expect(result.arcs.length).toBe(2);
    expect(result.arcs[0].title).toBe("第一章");
    expect(result.arcs[0].chapters.length).toBe(1);
    expect(result.arcs[1].title).toBe("第二章");
  });

  test("chapter without arc is not added to any arc", () => {
    const doc = makeDoc(`
      <div class="index_box">
        <dl>
          <dt>2024-01-01</dt>
          <dd class="subtitle"><a href="/n1234ab/1/">話一</a></dd>
        </dl>
      </div>
    `);
    const result = parseChapterList(doc);
    expect(result.arcs.length).toBe(0);
    expect(result.chapters.length).toBe(1);
  });

  test("dl without subtitle link is skipped", () => {
    const doc = makeDoc(`
      <div class="index_box">
        <dl><dt>2024-01-01</dt><dd class="subtitle"></dd></dl>
      </div>
    `);
    const result = parseChapterList(doc);
    expect(result.chapters.length).toBe(0);
  });

  test("extracts chapter number from href", () => {
    const doc = makeDoc(`
      <div class="index_box">
        <dl>
          <dt></dt>
          <dd class="subtitle"><a href="/n1234ab/42/">話</a></dd>
        </dl>
      </div>
    `);
    const result = parseChapterList(doc);
    expect(result.chapters[0].num).toBe(42);
  });

  test("missing date yields empty string", () => {
    const doc = makeDoc(`
      <div class="index_box">
        <dl>
          <dd class="subtitle"><a href="/n1234ab/1/">話一</a></dd>
        </dl>
      </div>
    `);
    const result = parseChapterList(doc);
    expect(result.chapters[0].date).toBe("");
  });
});

// ------------------------------------------------------------------
// buildChapterItem
// ------------------------------------------------------------------

describe("buildChapterItem", () => {
  const chapter = { num: 5, title: "タイトル", date: "2024-01-05" };

  test("returns an li element", () => {
    const item = buildChapterItem(chapter);
    expect(item.tagName).toBe("LI");
  });

  test("has chapter-item class", () => {
    const item = buildChapterItem(chapter);
    expect(item.classList.contains("chapter-item")).toBe(true);
  });

  test("displays chapter number", () => {
    const item = buildChapterItem(chapter);
    expect(item.innerHTML).toContain("5");
  });

  test("displays chapter title", () => {
    const item = buildChapterItem(chapter);
    expect(item.innerHTML).toContain("タイトル");
  });

  test("displays date when present", () => {
    const item = buildChapterItem(chapter);
    expect(item.innerHTML).toContain("2024-01-05");
  });

  test("omits date span when date is empty", () => {
    const item = buildChapterItem({ num: 1, title: "話", date: "" });
    expect(item.querySelector(".ch-date")).toBeNull();
  });

  test("escapes HTML in title to prevent XSS", () => {
    const item = buildChapterItem({ num: 1, title: '<script>xss</script>', date: "" });
    expect(item.innerHTML).not.toContain("<script>");
    expect(item.innerHTML).toContain("&lt;script&gt;");
  });

  test("link href contains chapter number", () => {
    const item = buildChapterItem(chapter);
    const link = item.querySelector("a.chapter-link");
    expect(link.getAttribute("href")).toContain("5");
  });
});

// ------------------------------------------------------------------
// renderChapters
// ------------------------------------------------------------------

describe("renderChapters", () => {
  let container;

  beforeEach(() => {
    container = document.getElementById("chapterContent");
    container.innerHTML = "";
  });

  test("shows short-story message when chapters is empty", () => {
    renderChapters([], []);
    expect(container.innerHTML).toContain("短篇");
  });

  test("renders flat chapter list when no arcs", () => {
    const chapters = [
      { num: 1, title: "話一", date: "" },
      { num: 2, title: "話二", date: "" },
    ];
    renderChapters([], chapters);
    const items = container.querySelectorAll(".chapter-item");
    expect(items.length).toBe(2);
  });

  test("renders arc blocks when arcs with chapters exist", () => {
    const chapters = [{ num: 1, title: "話一", date: "" }];
    const arcs = [{ title: "第一章", chapters }];
    renderChapters(arcs, chapters);
    const arcBlocks = container.querySelectorAll(".arc-block");
    expect(arcBlocks.length).toBe(1);
    expect(arcBlocks[0].innerHTML).toContain("第一章");
  });

  test("skips arc blocks with no chapters", () => {
    const chapters = [{ num: 1, title: "話一", date: "" }];
    const arcs = [
      { title: "Empty Arc", chapters: [] },
      { title: "Full Arc", chapters },
    ];
    renderChapters(arcs, chapters);
    const arcBlocks = container.querySelectorAll(".arc-block");
    expect(arcBlocks.length).toBe(1);
    expect(arcBlocks[0].innerHTML).toContain("Full Arc");
  });

  test("falls back to flat list when arcs all have empty chapters", () => {
    const chapters = [{ num: 1, title: "話一", date: "" }];
    const arcs = [{ title: "Empty Arc", chapters: [] }];
    renderChapters(arcs, chapters);
    // Falls through to flat list
    const items = container.querySelectorAll(".chapter-item");
    expect(items.length).toBe(1);
  });
});
