/**
 * Tests for static/js/common.js pure utility functions.
 *
 * common.js is a browser script (no module exports). We load it at module
 * scope via eval so that all function declarations are hoisted into the
 * enclosing (module-level) scope and remain accessible in every test.
 *
 * The jsdom test environment provides browser globals: localStorage, window,
 * document, DOMParser, URLSearchParams, URL, Node, etc.
 */

const fs = require("fs");
const path = require("path");

// Evaluate common.js once at module scope.  Function declarations land in
// the surrounding (module-level) scope; const/let are captured by closure
// inside those functions.  localStorage state is reset in beforeEach.
eval( // eslint-disable-line no-eval
  fs.readFileSync(
    path.join(__dirname, "../../static/js/common.js"),
    "utf8"
  )
);

beforeEach(() => {
  localStorage.clear();
});

// ------------------------------------------------------------------
// parsePositiveInt
// ------------------------------------------------------------------

describe("parsePositiveInt", () => {
  test("parses a valid integer string", () => {
    expect(parsePositiveInt("5")).toBe(5);
  });

  test("parses a positive number", () => {
    expect(parsePositiveInt(10)).toBe(10);
  });

  test("returns default for null", () => {
    expect(parsePositiveInt(null, 3)).toBe(3);
  });

  test("returns default for undefined", () => {
    expect(parsePositiveInt(undefined, 2)).toBe(2);
  });

  test("returns default for empty string", () => {
    expect(parsePositiveInt("", 7)).toBe(7);
  });

  test("returns default for non-numeric string", () => {
    expect(parsePositiveInt("abc", 9)).toBe(9);
  });

  test("returns 1 for zero input", () => {
    expect(parsePositiveInt("0")).toBe(1);
  });

  test("returns 1 for negative input", () => {
    expect(parsePositiveInt("-5")).toBe(1);
  });

  test("default defaultValue is 1", () => {
    expect(parsePositiveInt(null)).toBe(1);
  });

  test("handles large number", () => {
    expect(parsePositiveInt("9999")).toBe(9999);
  });
});

// ------------------------------------------------------------------
// escapeHtml
// ------------------------------------------------------------------

describe("escapeHtml", () => {
  test("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes less-than", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes greater-than", () => {
    expect(escapeHtml("5 > 3")).toBe("5 &gt; 3");
  });

  test("escapes double quote", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("handles null by returning empty string", () => {
    expect(escapeHtml(null)).toBe("");
  });

  test("handles undefined by returning empty string", () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  test("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("escapes all special chars in one string", () => {
    expect(escapeHtml('<a href="x&y">text</a>')).toBe(
      "&lt;a href=&quot;x&amp;y&quot;&gt;text&lt;/a&gt;"
    );
  });
});

// ------------------------------------------------------------------
// escapeAttribute
// ------------------------------------------------------------------

describe("escapeAttribute", () => {
  test("escapes single quote", () => {
    expect(escapeAttribute("it's")).toBe("it&#39;s");
  });

  test("also escapes double quote", () => {
    expect(escapeAttribute('say "hi"')).toBe("say &quot;hi&quot;");
  });

  test("escapes ampersand and angle brackets", () => {
    expect(escapeAttribute("<a&b>")).toBe("&lt;a&amp;b&gt;");
  });
});

// ------------------------------------------------------------------
// formatNumber
// ------------------------------------------------------------------

describe("formatNumber", () => {
  test("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  test("formats a plain number", () => {
    // The exact separator depends on locale; just check it is truthy
    expect(typeof formatNumber(12345)).toBe("string");
  });

  test("handles null as 0", () => {
    expect(formatNumber(null)).toBe("0");
  });

  test("handles undefined as 0", () => {
    expect(formatNumber(undefined)).toBe("0");
  });
});

// ------------------------------------------------------------------
// formatLength
// ------------------------------------------------------------------

describe("formatLength", () => {
  test("returns 字 for length below 100000", () => {
    expect(formatLength(50000)).toBe("50000字");
  });

  test("returns 万字 for length exactly 100000", () => {
    expect(formatLength(100000)).toBe("10万字");
  });

  test("returns 万字 for length above 100000", () => {
    expect(formatLength(250000)).toBe("25万字");
  });

  test("handles 0", () => {
    expect(formatLength(0)).toBe("0字");
  });

  test("floors to 万字 without rounding up", () => {
    // 159999 → floor(159999/10000) = 15
    expect(formatLength(159999)).toBe("15万字");
  });
});

// ------------------------------------------------------------------
// enrichNovel
// ------------------------------------------------------------------

describe("enrichNovel", () => {
  const base = () => ({
    ncode: "n0001a",
    title: "Test",
    genre: "201",
    end: 0,
    noveltype: 1,
    length: 50000,
  });

  test("adds genre_name for known genre", () => {
    expect(enrichNovel(base()).genre_name).toBe("高幻想·奇幻");
  });

  test("adds genre_icon for known genre", () => {
    expect(enrichNovel(base()).genre_icon).toBe("⚔️");
  });

  test("defaults genre_name to 其他 for unknown genre", () => {
    expect(enrichNovel({ ...base(), genre: "0" }).genre_name).toBe("其他");
  });

  test("defaults genre_icon to 📖 for unknown genre", () => {
    expect(enrichNovel({ ...base(), genre: "0" }).genre_icon).toBe("📖");
  });

  test("is_completed true when end === 1", () => {
    expect(enrichNovel({ ...base(), end: 1 }).is_completed).toBe(true);
  });

  test("is_completed false when end !== 1", () => {
    expect(enrichNovel({ ...base(), end: 0 }).is_completed).toBe(false);
  });

  test("is_series true when noveltype === 1", () => {
    expect(enrichNovel(base()).is_series).toBe(true);
  });

  test("is_series false when noveltype !== 1", () => {
    expect(enrichNovel({ ...base(), noveltype: 2 }).is_series).toBe(false);
  });

  test("length_label below 100000", () => {
    expect(enrichNovel(base()).length_label).toBe("50000字");
  });

  test("length_label at 100000", () => {
    expect(enrichNovel({ ...base(), length: 100000 }).length_label).toBe("10万字");
  });

  test("preserves original fields", () => {
    const enriched = enrichNovel(base());
    expect(enriched.ncode).toBe("n0001a");
    expect(enriched.title).toBe("Test");
  });
});

// ------------------------------------------------------------------
// extractChapterNumber
// ------------------------------------------------------------------

describe("extractChapterNumber", () => {
  test("extracts integer from path", () => {
    expect(extractChapterNumber("/n0001a/3/", 0)).toBe(3);
  });

  test("extracts from simple href", () => {
    expect(extractChapterNumber("/n0001a/12/", 1)).toBe(12);
  });

  test("returns fallback for non-integer last segment", () => {
    expect(extractChapterNumber("/n0001a/abc/", 99)).toBe(99);
  });

  test("returns fallback for empty string", () => {
    expect(extractChapterNumber("", 5)).toBe(5);
  });

  test("returns fallback for null", () => {
    expect(extractChapterNumber(null, 7)).toBe(7);
  });

  test("returns fallback for path with no numeric segment", () => {
    expect(extractChapterNumber("/n0001a/", 2)).toBe(2);
  });
});

// ------------------------------------------------------------------
// normalizeNcode
// ------------------------------------------------------------------

describe("normalizeNcode", () => {
  test("lowercases uppercase ncode", () => {
    expect(normalizeNcode("N1234AB")).toBe("n1234ab");
  });

  test("trims whitespace", () => {
    expect(normalizeNcode("  n1234ab  ")).toBe("n1234ab");
  });

  test("returns empty string for null", () => {
    expect(normalizeNcode(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(normalizeNcode(undefined)).toBe("");
  });

  test("handles already lowercase input", () => {
    expect(normalizeNcode("n1234ab")).toBe("n1234ab");
  });
});

// ------------------------------------------------------------------
// loadReadingProgressMap
// ------------------------------------------------------------------

describe("loadReadingProgressMap", () => {
  test("returns empty object when localStorage is empty", () => {
    expect(loadReadingProgressMap()).toEqual({});
  });

  test("returns parsed object from localStorage", () => {
    localStorage.setItem(
      "readingProgress",
      JSON.stringify({ n0001a: { chapter: 3, scrollRatio: 0.5 } })
    );
    const result = loadReadingProgressMap();
    expect(result.n0001a.chapter).toBe(3);
  });

  test("returns empty object for invalid JSON", () => {
    localStorage.setItem("readingProgress", "not-json{{");
    expect(loadReadingProgressMap()).toEqual({});
  });

  test("returns empty object when stored value is not an object", () => {
    localStorage.setItem("readingProgress", JSON.stringify(42));
    expect(loadReadingProgressMap()).toEqual({});
  });
});

// ------------------------------------------------------------------
// getReadingProgress
// ------------------------------------------------------------------

describe("getReadingProgress", () => {
  test("returns null for empty ncode", () => {
    expect(getReadingProgress("")).toBeNull();
  });

  test("returns null when no progress stored", () => {
    expect(getReadingProgress("n0001a")).toBeNull();
  });

  test("returns progress object when stored", () => {
    localStorage.setItem(
      "readingProgress",
      JSON.stringify({ n0001a: { chapter: 5, scrollRatio: 0.3 } })
    );
    const p = getReadingProgress("n0001a");
    expect(p.chapter).toBe(5);
    expect(p.scrollRatio).toBeCloseTo(0.3);
  });

  test("normalizes ncode to lowercase before lookup", () => {
    localStorage.setItem(
      "readingProgress",
      JSON.stringify({ n0001a: { chapter: 2, scrollRatio: 0 } })
    );
    expect(getReadingProgress("N0001A")).not.toBeNull();
  });

  test("returns null when stored value is not an object", () => {
    localStorage.setItem(
      "readingProgress",
      JSON.stringify({ n0001a: "bad" })
    );
    expect(getReadingProgress("n0001a")).toBeNull();
  });
});

// ------------------------------------------------------------------
// setReadingProgress
// ------------------------------------------------------------------

describe("setReadingProgress", () => {
  test("stores chapter and scrollRatio", () => {
    setReadingProgress("n0001a", { chapter: 3, scrollRatio: 0.5 });
    const p = getReadingProgress("n0001a");
    expect(p.chapter).toBe(3);
    expect(p.scrollRatio).toBeCloseTo(0.5);
  });

  test("clamps scrollRatio above 1 to 1", () => {
    setReadingProgress("n0001a", { chapter: 1, scrollRatio: 1.5 });
    expect(getReadingProgress("n0001a").scrollRatio).toBe(1);
  });

  test("clamps scrollRatio below 0 to 0", () => {
    setReadingProgress("n0001a", { chapter: 1, scrollRatio: -0.2 });
    expect(getReadingProgress("n0001a").scrollRatio).toBe(0);
  });

  test("chapter must be at least 1", () => {
    setReadingProgress("n0001a", { chapter: 0, scrollRatio: 0 });
    expect(getReadingProgress("n0001a").chapter).toBe(1);
  });

  test("does nothing for empty ncode", () => {
    setReadingProgress("", { chapter: 1, scrollRatio: 0 });
    expect(localStorage.getItem("readingProgress")).toBeNull();
  });

  test("does nothing when progress is null", () => {
    setReadingProgress("n0001a", null);
    expect(getReadingProgress("n0001a")).toBeNull();
  });

  test("merges with existing progress", () => {
    setReadingProgress("n0001a", { chapter: 2, scrollRatio: 0.4 });
    setReadingProgress("n0001a", { chapter: 5, scrollRatio: 0.8 });
    const p = getReadingProgress("n0001a");
    expect(p.chapter).toBe(5);
    expect(p.scrollRatio).toBeCloseTo(0.8);
  });

  test("stores updatedAt timestamp", () => {
    setReadingProgress("n0001a", { chapter: 1, scrollRatio: 0 });
    const p = getReadingProgress("n0001a");
    expect(typeof p.updatedAt).toBe("string");
    expect(new Date(p.updatedAt).getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});

// ------------------------------------------------------------------
// getResumeChapter
// ------------------------------------------------------------------

describe("getResumeChapter", () => {
  test("returns default when no chapters and no progress", () => {
    expect(getResumeChapter("n0001a", [], 1)).toBe(1);
  });

  test("returns saved chapter when it exists in chapter list", () => {
    setReadingProgress("n0001a", { chapter: 3, scrollRatio: 0 });
    const chapters = [{ num: 1 }, { num: 2 }, { num: 3 }];
    expect(getResumeChapter("n0001a", chapters)).toBe(3);
  });

  test("returns first chapter when saved chapter not in chapter list", () => {
    setReadingProgress("n0001a", { chapter: 99, scrollRatio: 0 });
    const chapters = [{ num: 1 }, { num: 2 }];
    expect(getResumeChapter("n0001a", chapters)).toBe(1);
  });

  test("returns saved chapter when chapters is null (no list)", () => {
    setReadingProgress("n0001a", { chapter: 5, scrollRatio: 0 });
    expect(getResumeChapter("n0001a", null)).toBe(5);
  });

  test("returns default when no progress and chapters provided", () => {
    const chapters = [{ num: 1 }, { num: 2 }];
    expect(getResumeChapter("n0001a", chapters, 1)).toBe(1);
  });
});

// ------------------------------------------------------------------
// parseContentBlock
// ------------------------------------------------------------------

describe("parseContentBlock", () => {
  test("returns empty string for null container", () => {
    expect(parseContentBlock(null)).toBe("");
  });

  test("wraps single paragraph", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p>Hello</p>";
    const result = parseContentBlock(div);
    expect(result).toContain("<p>Hello</p>");
  });

  test("produces blank-line class for empty paragraph", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p></p>";
    const result = parseContentBlock(div);
    expect(result).toContain('class="blank-line"');
  });

  test("handles container with no p tags (falls back to text)", () => {
    const div = document.createElement("div");
    div.textContent = "plain text";
    const result = parseContentBlock(div);
    expect(result).toContain("plain text");
  });

  test("returns empty string for container with no text and no p tags", () => {
    const div = document.createElement("div");
    const result = parseContentBlock(div);
    expect(result).toBe("");
  });

  test("handles multiple paragraphs", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p>One</p><p>Two</p>";
    const result = parseContentBlock(div);
    expect(result).toContain("<p>One</p>");
    expect(result).toContain("<p>Two</p>");
  });

  test("preserves ruby tags inside paragraph", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p><ruby>漢<rt>かん</rt></ruby></p>";
    const result = parseContentBlock(div);
    expect(result).toContain("<ruby>");
    expect(result).toContain("<rt>");
  });
});

// ------------------------------------------------------------------
// setErrorText
// ------------------------------------------------------------------

describe("setErrorText", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="errBox"></div>';
  });

  test("sets textContent on existing element", () => {
    setErrorText("errBox", "Something went wrong");
    expect(document.getElementById("errBox").textContent).toBe(
      "Something went wrong"
    );
  });

  test("does nothing for unknown elementId", () => {
    expect(() => setErrorText("nonexistent", "msg")).not.toThrow();
  });
});

// ------------------------------------------------------------------
// getOriginIndexUrl / getOriginChapterUrl
// ------------------------------------------------------------------

describe("getOriginIndexUrl", () => {
  test("builds correct URL", () => {
    expect(getOriginIndexUrl("n0001a")).toBe("https://ncode.syosetu.com/n0001a/");
  });

  test("lowercases ncode", () => {
    expect(getOriginIndexUrl("N0001A")).toBe("https://ncode.syosetu.com/n0001a/");
  });
});

describe("getOriginChapterUrl", () => {
  test("builds correct URL with chapter", () => {
    expect(getOriginChapterUrl("n0001a", 3)).toBe(
      "https://ncode.syosetu.com/n0001a/3/"
    );
  });
});
