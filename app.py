import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote

from flask import Flask, render_template, request, jsonify
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

app = Flask(__name__)

NAROU_API = "https://api.syosetu.com/novelapi/api/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,ja-JP;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
_retry = Retry(
    total=2,
    connect=2,
    read=2,
    status=2,
    backoff_factor=0.4,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=("GET",),
    respect_retry_after_header=False,
)
_adapter = HTTPAdapter(max_retries=_retry, pool_connections=8, pool_maxsize=16)
SESSION.mount("https://", _adapter)
SESSION.mount("http://", _adapter)
SESSION.cookies.set("over18", "yes", domain="syosetu.com")
SESSION.cookies.set("sasieno", "0", domain="syosetu.com")

GENRE_MAP = {
    "101": "异世界·恋爱", "102": "现实世界·恋爱",
    "201": "高幻想·奇幻", "202": "低幻想·奇幻",
    "301": "纯文学", "302": "人情剧", "303": "历史",
    "304": "推理", "305": "恐怖", "306": "动作", "307": "喜剧",
    "401": "VR游戏", "402": "宇宙", "403": "科幻", "404": "惊悚",
    "9901": "童话", "9902": "诗歌", "9903": "随笔",
    "9904": "对战记录", "9999": "其他", "9801": "无分类",
}

GENRE_ICON = {
    "101": "💕", "102": "💝", "201": "⚔️", "202": "🌿",
    "301": "📚", "302": "🎭", "303": "🏯", "304": "🔍",
    "305": "👻", "306": "💥", "307": "😂",
    "401": "🎮", "402": "🚀", "403": "🔬", "404": "⚡",
    "9901": "🧸", "9902": "🌸", "9903": "✍️", "9999": "📖", "9801": "📄",
}


def parse_positive_int(value, default=1):
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def enrich_novel(novel):
    g = str(novel.get("genre", ""))
    novel["genre_name"] = GENRE_MAP.get(g, "其他")
    novel["genre_icon"] = GENRE_ICON.get(g, "📖")
    novel["is_completed"] = novel.get("end", 0) == 1
    novel["is_series"] = novel.get("noveltype", 1) == 1
    length = novel.get("length", 0)
    if length >= 100000:
        novel["length_label"] = f"{length // 10000}万字"
    else:
        novel["length_label"] = f"{length}字"
    return novel


def extract_chapter_number(href, fallback=None):
    parts = [p for p in str(href or "").strip("/").split("/") if p]
    for part in reversed(parts):
        if part.isdigit():
            return int(part)
    return fallback


NCODE_RE = re.compile(r"^n[0-9a-z]{2,10}$")
TOC_FETCH_WORKERS = 6

# syosetu blocks cloud-provider IPs (e.g. Vercel/AWS). NAROU_RELAY lists
# comma-separated query-style relays (".../?url=") such as workers/cors-proxy.js.
RELAY_BASES = [b.strip() for b in os.environ.get("NAROU_RELAY", "").split(",") if b.strip()]
DIRECT_FETCH = os.environ.get("NAROU_DIRECT", "1") != "0" or not RELAY_BASES
RELAY_FANOUT = max(1, int(os.environ.get("NAROU_RELAY_FANOUT", "3")))
RELAY_ROUNDS = max(1, int(os.environ.get("NAROU_RELAY_ROUNDS", "2")))
RETRYABLE_STATUS = {403, 429, 500, 502, 503, 504}
FETCH_POOL = ThreadPoolExecutor(max_workers=32)

# CDN cache lifetimes (seconds) for successful responses.
CACHE_SEARCH = 300
CACHE_CHAPTERS = 600
CACHE_CONTENT = 3600


class UpstreamError(Exception):
    pass


def normalize_ncode(ncode):
    value = str(ncode or "").strip().lower()
    return value if NCODE_RE.match(value) else None


def cached_json(payload, max_age):
    resp = jsonify(payload)
    resp.headers["Cache-Control"] = (
        f"public, max-age=60, s-maxage={max_age}, stale-while-revalidate={max_age * 6}"
    )
    return resp


def error_json(message, status=502, **extra):
    resp = jsonify({"error": message, **extra})
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _get_once(url, timeout):
    try:
        resp = SESSION.get(url, timeout=timeout)
    except requests.RequestException as exc:
        raise UpstreamError(f"原站请求失败：{exc.__class__.__name__}") from exc
    if resp.status_code == 403:
        raise UpstreamError("原站拒绝访问（HTTP 403，服务器 IP 可能被拦截，需配置 NAROU_RELAY 中转）")
    if resp.status_code >= 400:
        raise UpstreamError(f"原站返回 HTTP {resp.status_code}")
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp


def _fetch(url, timeout=(5, 12)):
    if not RELAY_BASES:
        return _get_once(url, timeout)

    last_error = UpstreamError("原站请求失败")
    for round_index in range(RELAY_ROUNDS):
        targets = [url] if DIRECT_FETCH and round_index == 0 else []
        targets += [
            RELAY_BASES[(round_index * RELAY_FANOUT + i) % len(RELAY_BASES)] + quote(url, safe="")
            for i in range(RELAY_FANOUT)
        ]
        futures = [FETCH_POOL.submit(_get_once, target, timeout) for target in targets]
        for future in as_completed(futures):
            try:
                resp = future.result()
            except UpstreamError as exc:
                last_error = exc
                continue
            for other in futures:
                other.cancel()
            return resp
    raise last_error


def _parse_toc_page(soup):
    chapters = []
    arcs = []
    current_arc = None

    eplist = soup.select_one("div.p-eplist")
    if eplist:
        for elem in eplist.select(".p-eplist__chapter-title, a"):
            classes = elem.get("class") or []
            if "p-eplist__chapter-title" in classes:
                current_arc = {"title": elem.get_text(strip=True), "chapters": []}
                arcs.append(current_arc)
                continue
            if elem.name != "a":
                continue
            href = elem.get("href", "")
            num = extract_chapter_number(href, None)
            if num is None:
                continue
            if any(c["num"] == num for c in chapters):
                continue
            date = ""
            parent = elem.find_parent(["div", "li"])
            if parent:
                date_node = parent.select_one(".p-eplist__update, .long_update, time, .p-eplist__date")
                if date_node and date_node is not elem:
                    date = date_node.get_text(strip=True)
            entry = {"num": num, "title": elem.get_text(strip=True), "date": date}
            chapters.append(entry)
            if current_arc is not None:
                current_arc["chapters"].append(entry)
        return chapters, arcs

    index_box = soup.find("div", class_="index_box")
    if not index_box:
        return chapters, arcs

    for elem in index_box.children:
        if not hasattr(elem, "name") or elem.name is None:
            continue
        classes = elem.get("class") or []
        if "chapter_title" in classes:
            current_arc = {"title": elem.get_text(strip=True), "chapters": []}
            arcs.append(current_arc)
        elif elem.name == "dl":
            dd = elem.find("dd", class_="subtitle")
            dt = elem.find("dt")
            if not dd:
                continue
            link = dd.find("a")
            if not link:
                continue
            href = link.get("href", "")
            num = extract_chapter_number(href, len(chapters) + 1)
            date = dt.get_text(strip=True) if dt else ""
            entry = {"num": num, "title": link.get_text(strip=True), "date": date}
            chapters.append(entry)
            if arcs:
                arcs[-1]["chapters"].append(entry)
    return chapters, arcs


def _toc_page_count(soup):
    last = soup.select_one("a.c-pager__item--last, a.novelview_pager-last")
    if not last:
        return 1
    href = last.get("href") or ""
    match = re.search(r"[?&]p=(\d+)", href)
    return parse_positive_int(match.group(1), 1) if match else 1


def _fetch_toc_page(base, page):
    try:
        resp = _fetch(f"{base}?p={page}")
    except UpstreamError:
        return [], []
    return _parse_toc_page(BeautifulSoup(resp.text, "html.parser"))


def fetch_all_chapters(ncode):
    ncode = ncode.lower()
    base = f"https://ncode.syosetu.com/{ncode}/"
    resp = _fetch(base)
    soup = BeautifulSoup(resp.text, "html.parser")
    chapters, arcs = _parse_toc_page(soup)
    page_count = _toc_page_count(soup)

    pages = list(range(2, page_count + 1))
    if pages:
        with ThreadPoolExecutor(max_workers=min(TOC_FETCH_WORKERS, len(pages))) as pool:
            results = list(pool.map(lambda p: _fetch_toc_page(base, p), pages))
    else:
        results = []

    for page_chapters, page_arcs in results:
        for entry in page_chapters:
            if not any(c["num"] == entry["num"] for c in chapters):
                chapters.append(entry)
        for arc in page_arcs:
            existing = next((a for a in arcs if a["title"] == arc["title"]), None)
            if existing is None:
                arcs.append(arc)
            else:
                for entry in arc["chapters"]:
                    if not any(c["num"] == entry["num"] for c in existing["chapters"]):
                        existing["chapters"].append(entry)

    chapters.sort(key=lambda item: item["num"])
    return chapters, arcs


def _parse_content(div):
    if div is None:
        return ""
    parts = []
    for p in div.find_all("p"):
        text = p.get_text()
        if text.strip():
            html = p.decode_contents()
            parts.append(f"<p>{html}</p>")
        else:
            parts.append('<p class="blank-line">&nbsp;</p>')
    return "\n".join(parts) if parts else f"<p>{div.get_text()}</p>"


def _parse_main_content(soup):
    body = soup.find("div", id="novel_honbun") or soup.select_one("div.p-novel__body")
    if not body:
        return ""

    text_blocks = body.select(":scope > .p-novel__text, .p-novel__text")
    if text_blocks:
        main_blocks = [
            block for block in text_blocks
            if "preface" not in " ".join(block.get("class") or [])
            and "afterword" not in " ".join(block.get("class") or [])
        ]
        if main_blocks:
            return "\n".join(filter(None, (_parse_content(block) for block in main_blocks)))

    # Strip note blocks then parse
    for node in body.select(".p-novel__text--preface, .p-novel__text--afterword, #novel_p, #novel_a"):
        node.extract()
    return _parse_content(body)


def _parse_foreword(soup):
    modern = soup.select_one(".p-novel__text--preface")
    if modern:
        return _parse_content(modern)
    return _parse_content(soup.find("div", id="novel_p"))


def _parse_afterword(soup):
    modern = soup.select_one(".p-novel__text--afterword")
    if modern:
        return _parse_content(modern)
    return _parse_content(soup.find("div", id="novel_a"))


@app.route("/")
def index():
    return render_template("index.html", genre_map=GENRE_MAP, genre_icon=GENRE_ICON)


@app.route("/api/search")
def api_search():
    query = request.args.get("q", "").strip()
    page = parse_positive_int(request.args.get("page", 1))
    genre = request.args.get("genre", "").strip()
    order = request.args.get("order", "hyoka")

    params = {
        "out": "json",
        "of": "t-n-w-s-g-ga-f-l-e-nt",
        "lim": 20,
        "st": (page - 1) * 20 + 1,
        "order": order,
    }
    if query:
        params["word"] = query
    if genre:
        params["genre"] = genre

    try:
        resp = SESSION.get(NAROU_API, params=params, timeout=(5, 12))
        resp.raise_for_status()
        resp.encoding = "utf-8"
        data = resp.json()
        total = data[0].get("allcount", 0)
        novels = [enrich_novel(n) for n in data[1:]]
        return cached_json({"total": total, "novels": novels, "page": page}, CACHE_SEARCH)
    except Exception as e:
        return error_json(str(e), total=0, novels=[], page=page)


@app.route("/novel/<ncode>")
def novel_detail(ncode):
    ncode = normalize_ncode(ncode)
    if not ncode:
        return render_template("error.html", message="无效的作品编号"), 404
    params = {
        "out": "json",
        "of": "t-n-w-s-g-ga-f-l-e-nt-k",
        "ncode": ncode,
    }
    try:
        resp = SESSION.get(NAROU_API, params=params, timeout=(5, 12))
        resp.raise_for_status()
        resp.encoding = "utf-8"
        data = resp.json()
        if len(data) > 1:
            novel = enrich_novel(data[1])
            return render_template("novel.html", novel=novel, ncode=ncode)
        return render_template("error.html", message="未找到该小说"), 404
    except Exception as e:
        return render_template("error.html", message=str(e)), 502


@app.route("/api/chapters/<ncode>")
def get_chapters(ncode):
    ncode = normalize_ncode(ncode)
    if not ncode:
        return error_json("无效的作品编号", 400, chapters=[], arcs=[])
    try:
        chapters, arcs = fetch_all_chapters(ncode)
        return cached_json({"chapters": chapters, "arcs": arcs}, CACHE_CHAPTERS)
    except Exception as e:
        return error_json(str(e), chapters=[], arcs=[])


@app.route("/read/<ncode>/<chapter>")
def read_chapter(ncode, chapter):
    ncode = normalize_ncode(ncode)
    if not ncode or not str(chapter).isdigit():
        return render_template("error.html", message="无效的章节地址"), 404
    return render_template("reader.html", ncode=ncode, chapter=chapter)


@app.route("/api/content/<ncode>/<chapter>")
def get_content(ncode, chapter):
    ncode = normalize_ncode(ncode)
    if not ncode or not str(chapter).isdigit():
        return error_json("无效的章节地址", 400)
    url = f"https://ncode.syosetu.com/{ncode}/{chapter}/"
    try:
        resp = _fetch(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        title_elem = (
            soup.select_one("h1.p-novel__title, .p-novel__title")
            or soup.find("p", class_="novel_subtitle")
        )
        title = title_elem.get_text(strip=True) if title_elem else f"第{chapter}话"

        novel_title = ""
        nt = (
            soup.select_one("a.c-announce__text, a.p-novel__series-title, a.novel_title")
            or soup.find("p", class_="novel_title")
            or soup.find("a", {"href": f"/{ncode}/"})
        )
        if nt:
            novel_title = nt.get_text(strip=True)

        foreword = _parse_foreword(soup)
        content = _parse_main_content(soup)
        afterword = _parse_afterword(soup)

        prev_ch = next_ch = None
        chint = parse_positive_int(chapter, 1)
        nav_roots = soup.select(
            "div.novel_bn, div.p-novel__navigation, nav.p-novel__navi, div.c-pager, div.p-novel__navi"
        )
        links = []
        for root in nav_roots:
            links.extend(root.find_all("a"))
        if not links:
            links = soup.find_all("a")
        for a in links:
            href = a.get("href", "")
            num = extract_chapter_number(href, None)
            if num is None:
                continue
            if num < chint:
                prev_ch = num
            elif num > chint:
                if next_ch is None or num < next_ch:
                    next_ch = num

        if prev_ch is None and chint > 1:
            prev_ch = chint - 1
        if next_ch is None and prev_ch is not None:
            next_ch = chint + 1

        if not content:
            return error_json("章节正文为空（原站页面结构异常或被拦截）")

        return cached_json({
            "title": title,
            "novel_title": novel_title,
            "foreword": foreword,
            "content": content,
            "afterword": afterword,
            "prev_chapter": prev_ch,
            "next_chapter": next_ch,
        }, CACHE_CONTENT)
    except Exception as e:
        return error_json(str(e))


@app.errorhandler(404)
def not_found(e):
    return render_template("error.html", message="页面未找到"), 404


@app.errorhandler(500)
def server_error(e):
    return render_template("error.html", message="服务器内部错误"), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(debug=debug, use_reloader=False, port=port, host="0.0.0.0")
