/**
 * Tests for static/js/reader-page.js
 *
 * reader-page.js depends on many DOM elements at its top level. We set up the
 * required DOM first, then evaluate both scripts at module scope.
 */

const fs = require("fs");
const path = require("path");

const commonSrc = fs.readFileSync(
  path.join(__dirname, "../../static/js/common.js"),
  "utf8"
);
const readerPageSrc = fs.readFileSync(
  path.join(__dirname, "../../static/js/reader-page.js"),
  "utf8"
);

// Minimal HTML satisfying all getElementById calls at the top of reader-page.js
document.body.innerHTML = `
  <a id="catalogLink" href=""></a>
  <a id="catalogLinkBottom" href=""></a>
  <article id="readerArticle" style="display:none"></article>
  <div id="readerLoading" style="display:flex"></div>
  <div id="readerError" style="display:none"></div>
  <div id="progressBar" style="width:0%"></div>
  <div id="settingsPanel" style="display:none"></div>
  <button id="settingsBtn">Settings</button>
  <button id="reloadBtn">Reload</button>
  <button id="prevBtn">Prev</button>
  <button id="prevBtnBottom">Prev</button>
  <button id="nextBtn">Next</button>
  <button id="nextBtnBottom">Next</button>
  <div id="toolbarNovelTitle"></div>
  <div id="toolbarChTitle"></div>
  <div id="readerChTitle"></div>
  <div id="readerContent"></div>
  <div id="readerForeword"></div>
  <div id="readerAfterword"></div>
  <button data-font-size="18">18</button>
  <button data-font-size="21">21</button>
  <button data-font-size="24">24</button>
  <button data-font="serif">serif</button>
  <button data-font="sans">sans</button>
  <button data-line-height="1.8">1.8</button>
  <button data-line-height="2">2</button>
  <button data-bg="white">white</button>
  <button data-bg="sepia">sepia</button>
  <button data-bg="dark">dark</button>
`;

eval(commonSrc); // eslint-disable-line no-eval
eval(readerPageSrc); // eslint-disable-line no-eval

beforeEach(() => {
  localStorage.clear();
});

// ------------------------------------------------------------------
// parseChapterNavigation
// ------------------------------------------------------------------

describe("parseChapterNavigation", () => {
  function makeDoc(html) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;
    return doc;
  }

  // Note: eval'd currentChapter starts at 1 (no URL params in jsdom).
  // Links with number > 1 → nextChapter; links < 1 → prevChapter (not possible with real chapters).
  // We verify side effects via updateNavButtons() DOM changes.

  test("enables next button when navigation link exists after current chapter", () => {
    parseChapterNavigation(makeDoc(`
      <div class="novel_bn">
        <a href="/n1234ab/3/">次へ</a>
      </div>
    `));
    updateNavButtons();
    expect(document.getElementById("nextBtn").disabled).toBe(false);
    expect(document.getElementById("prevBtn").disabled).toBe(true);
  });

  test("disables both buttons when no nav element", () => {
    parseChapterNavigation(makeDoc("<div></div>"));
    updateNavButtons();
    expect(document.getElementById("prevBtn").disabled).toBe(true);
    expect(document.getElementById("nextBtn").disabled).toBe(true);
  });

  test("disables both buttons when no links in nav", () => {
    parseChapterNavigation(makeDoc(`<div class="novel_bn"></div>`));
    updateNavButtons();
    expect(document.getElementById("prevBtn").disabled).toBe(true);
    expect(document.getElementById("nextBtn").disabled).toBe(true);
  });

  test("skips links with non-integer chapter numbers", () => {
    parseChapterNavigation(makeDoc(`
      <div class="novel_bn">
        <a href="/n1234ab/badlink/">bad</a>
      </div>
    `));
    updateNavButtons();
    expect(document.getElementById("prevBtn").disabled).toBe(true);
    expect(document.getElementById("nextBtn").disabled).toBe(true);
  });

  test("also works with p-novel__navigation class", () => {
    parseChapterNavigation(makeDoc(`
      <div class="p-novel__navigation">
        <a href="/n1234ab/6/">次へ</a>
      </div>
    `));
    updateNavButtons();
    expect(document.getElementById("nextBtn").disabled).toBe(false);
  });
});

// ------------------------------------------------------------------
// getScrollRatio
// ------------------------------------------------------------------

describe("getScrollRatio", () => {
  test("returns 0 when scrollHeight equals clientHeight (no scroll possible)", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => 600,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      get: () => 600,
    });
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 0,
    });
    expect(getScrollRatio()).toBe(0);
  });

  test("returns a value between 0 and 1 when scrolled", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 250,
    });
    const ratio = getScrollRatio();
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
    expect(ratio).toBeCloseTo(0.5);
  });

  test("caps ratio at 1", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      get: () => 600,
    });
    expect(getScrollRatio()).toBe(1);
  });
});

// ------------------------------------------------------------------
// toggleSettings
// ------------------------------------------------------------------

describe("toggleSettings", () => {
  test("shows panel when it is hidden", () => {
    settingsPanel.style.display = "none";
    toggleSettings();
    expect(settingsPanel.style.display).toBe("block");
  });

  test("hides panel when it is visible", () => {
    settingsPanel.style.display = "block";
    toggleSettings();
    expect(settingsPanel.style.display).toBe("none");
  });
});

// ------------------------------------------------------------------
// Reader preference functions (setFontSize, setFont, setLineHeight,
// setReaderBg, applyPrefs, syncSettingButtons)
// ------------------------------------------------------------------

describe("setFontSize", () => {
  test("updates article font size", () => {
    setFontSize(18);
    expect(readerArticle.style.fontSize).toBe("18px");
  });

  test("persists to localStorage", () => {
    setFontSize(24);
    const stored = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
    expect(stored.fontSize).toBe(24);
  });
});

describe("setFont", () => {
  test("sets serif font family", () => {
    setFont("serif");
    expect(readerArticle.style.fontFamily).toContain("serif");
  });

  test("sets sans-serif font family", () => {
    setFont("sans");
    expect(readerArticle.style.fontFamily).toContain("sans");
  });

  test("persists font to localStorage", () => {
    setFont("sans");
    const stored = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
    expect(stored.font).toBe("sans");
  });
});

describe("setLineHeight", () => {
  test("sets lineHeight on article", () => {
    setLineHeight(1.8);
    expect(readerArticle.style.lineHeight).toBe("1.8");
  });

  test("persists lineHeight to localStorage", () => {
    setLineHeight(2);
    const stored = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
    expect(stored.lineHeight).toBe(2);
  });
});

describe("setReaderBg", () => {
  test("sets data-reader-bg on body", () => {
    setReaderBg("sepia");
    expect(document.body.dataset.readerBg).toBe("sepia");
  });

  test("persists readerBg to localStorage", () => {
    setReaderBg("dark");
    const stored = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
    expect(stored.readerBg).toBe("dark");
  });
});

describe("syncSettingButtons", () => {
  test("activates the font-size button matching current pref", () => {
    setFontSize(21);
    syncSettingButtons();
    const active = Array.from(document.querySelectorAll("[data-font-size]")).filter(
      (b) => b.classList.contains("active")
    );
    expect(active.length).toBe(1);
    expect(Number(active[0].dataset.fontSize)).toBe(21);
  });

  test("activates the font button matching current pref", () => {
    setFont("serif");
    syncSettingButtons();
    const active = Array.from(document.querySelectorAll("[data-font]")).filter(
      (b) => b.classList.contains("active")
    );
    expect(active.length).toBe(1);
    expect(active[0].dataset.font).toBe("serif");
  });

  test("activates the bg button matching current pref", () => {
    setReaderBg("white");
    syncSettingButtons();
    const active = Array.from(document.querySelectorAll("[data-bg]")).filter(
      (b) => b.classList.contains("active")
    );
    expect(active.length).toBe(1);
    expect(active[0].dataset.bg).toBe("white");
  });

  test("activates the line-height button matching current pref", () => {
    setLineHeight(2);
    syncSettingButtons();
    const active = Array.from(document.querySelectorAll("[data-line-height]")).filter(
      (b) => b.classList.contains("active")
    );
    expect(active.length).toBe(1);
    expect(Number(active[0].dataset.lineHeight)).toBe(2);
  });
});

describe("applyPrefs", () => {
  test("applies default font size when no prefs stored", () => {
    localStorage.clear();
    prefs = {};
    applyPrefs();
    expect(readerArticle.style.fontSize).toBe("21px");
  });

  test("applies default font when no prefs stored", () => {
    localStorage.clear();
    prefs = {};
    applyPrefs();
    expect(readerArticle.style.fontFamily).toContain("serif");
  });

  test("applies sepia background when readerBg pref is sepia", () => {
    setReaderBg("sepia");
    applyPrefs();
    expect(document.body.dataset.readerBg).toBe("sepia");
  });
});

// ------------------------------------------------------------------
// updateNavButtons
// ------------------------------------------------------------------

describe("updateNavButtons", () => {
  function makeNavDoc(html) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;
    return doc;
  }

  test("disables prev and enables next when only next link exists", () => {
    parseChapterNavigation(makeNavDoc(`<div class="novel_bn"><a href="/n/2/">次へ</a></div>`));
    updateNavButtons();
    expect(document.getElementById("prevBtn").disabled).toBe(true);
    expect(document.getElementById("prevBtnBottom").disabled).toBe(true);
    expect(document.getElementById("nextBtn").disabled).toBe(false);
    expect(document.getElementById("nextBtnBottom").disabled).toBe(false);
  });

  test("disables both when no nav links", () => {
    parseChapterNavigation(makeNavDoc("<div></div>"));
    updateNavButtons();
    expect(document.getElementById("prevBtn").disabled).toBe(true);
    expect(document.getElementById("nextBtn").disabled).toBe(true);
  });
});

// ------------------------------------------------------------------
// showReaderError
// ------------------------------------------------------------------

describe("showReaderError", () => {
  test("hides loading and article, shows error", () => {
    readerLoading.style.display = "flex";
    readerArticle.style.display = "block";
    readerError.style.display = "none";
    showReaderError();
    expect(readerLoading.style.display).toBe("none");
    expect(readerArticle.style.display).toBe("none");
    expect(readerError.style.display).toBe("flex");
  });
});

// ------------------------------------------------------------------
// scheduleSaveProgress / saveReadingProgressNow
// ------------------------------------------------------------------

describe("saveReadingProgressNow", () => {
  test("stores chapter and scrollRatio via setReadingProgress", () => {
    // saveReadingProgressNow() is a no-op when readerNcode is empty (no URL
    // params in jsdom).  Test the underlying storage mechanism directly:
    setReadingProgress("n0001a", { chapter: 7, scrollRatio: 0.6 });
    const p = getReadingProgress("n0001a");
    expect(p.chapter).toBe(7);
    expect(p.scrollRatio).toBeCloseTo(0.6);
  });
});

describe("scheduleSaveProgress", () => {
  test("does not throw when called", () => {
    jest.useFakeTimers();
    expect(() => scheduleSaveProgress()).not.toThrow();
    jest.runAllTimers();
    jest.useRealTimers();
  });

  test("debounces repeated calls (timer not re-set if already pending)", () => {
    jest.useFakeTimers();
    scheduleSaveProgress();
    const firstTimerCount = jest.getTimerCount();
    scheduleSaveProgress(); // second call should be a no-op
    expect(jest.getTimerCount()).toBe(firstTimerCount); // still same timer count
    jest.runAllTimers();
    jest.useRealTimers();
  });
});
