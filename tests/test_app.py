"""Tests for app.py - Flask backend routes and utility functions."""

import json
import pytest
from unittest.mock import patch, MagicMock

from app import app as flask_app, parse_positive_int, enrich_novel, _parse_content


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def app():
    flask_app.config["TESTING"] = True
    yield flask_app


@pytest.fixture()
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# parse_positive_int
# ---------------------------------------------------------------------------

class TestParsePositiveInt:
    def test_valid_integer_string(self):
        assert parse_positive_int("5") == 5

    def test_valid_integer(self):
        assert parse_positive_int(10) == 10

    def test_returns_default_for_none(self):
        assert parse_positive_int(None, 3) == 3

    def test_returns_default_for_empty_string(self):
        assert parse_positive_int("", 2) == 2

    def test_returns_default_for_non_numeric(self):
        assert parse_positive_int("abc", 7) == 7

    def test_clamps_zero_to_one(self):
        assert parse_positive_int("0") == 1

    def test_clamps_negative_to_one(self):
        assert parse_positive_int("-5") == 1

    def test_default_default_value_is_one(self):
        assert parse_positive_int(None) == 1

    def test_large_number(self):
        assert parse_positive_int("999") == 999

    def test_float_string_truncates(self):
        # int() on "3.7" raises ValueError, so returns default
        assert parse_positive_int("3.7", 1) == 1


# ---------------------------------------------------------------------------
# enrich_novel
# ---------------------------------------------------------------------------

class TestEnrichNovel:
    def _base_novel(self, **kwargs):
        base = {
            "ncode": "n0001a",
            "title": "Test Novel",
            "writer": "Author",
            "genre": "201",
            "end": 0,
            "noveltype": 1,
            "length": 50000,
        }
        base.update(kwargs)
        return base

    def test_genre_name_known(self):
        novel = enrich_novel(self._base_novel(genre="201"))
        assert novel["genre_name"] == "高幻想·奇幻"

    def test_genre_icon_known(self):
        novel = enrich_novel(self._base_novel(genre="201"))
        assert novel["genre_icon"] == "⚔️"

    def test_genre_name_unknown_defaults_to_other(self):
        novel = enrich_novel(self._base_novel(genre="0"))
        assert novel["genre_name"] == "其他"

    def test_genre_icon_unknown_defaults_to_book(self):
        novel = enrich_novel(self._base_novel(genre="0"))
        assert novel["genre_icon"] == "📖"

    def test_is_completed_true_when_end_equals_1(self):
        novel = enrich_novel(self._base_novel(end=1))
        assert novel["is_completed"] is True

    def test_is_completed_false_when_end_not_1(self):
        novel = enrich_novel(self._base_novel(end=0))
        assert novel["is_completed"] is False

    def test_is_series_true_when_noveltype_1(self):
        novel = enrich_novel(self._base_novel(noveltype=1))
        assert novel["is_series"] is True

    def test_is_series_false_when_noveltype_not_1(self):
        novel = enrich_novel(self._base_novel(noveltype=2))
        assert novel["is_series"] is False

    def test_length_label_below_100000(self):
        novel = enrich_novel(self._base_novel(length=50000))
        assert novel["length_label"] == "50000字"

    def test_length_label_at_100000(self):
        novel = enrich_novel(self._base_novel(length=100000))
        assert novel["length_label"] == "10万字"

    def test_length_label_above_100000(self):
        novel = enrich_novel(self._base_novel(length=250000))
        assert novel["length_label"] == "25万字"

    def test_original_fields_preserved(self):
        novel = enrich_novel(self._base_novel())
        assert novel["title"] == "Test Novel"
        assert novel["ncode"] == "n0001a"

    def test_missing_genre_defaults(self):
        novel = {"title": "x"}
        enriched = enrich_novel(novel)
        assert enriched["genre_name"] == "其他"
        assert enriched["genre_icon"] == "📖"

    def test_missing_end_defaults_not_completed(self):
        novel = {"title": "x"}
        enriched = enrich_novel(novel)
        assert enriched["is_completed"] is False

    def test_missing_length_defaults_zero_label(self):
        novel = {"title": "x"}
        enriched = enrich_novel(novel)
        assert enriched["length_label"] == "0字"


# ---------------------------------------------------------------------------
# _parse_content
# ---------------------------------------------------------------------------

class TestParseContent:
    def _soup(self, html):
        from bs4 import BeautifulSoup
        return BeautifulSoup(html, "html.parser")

    def test_single_paragraph(self):
        soup = self._soup('<div><p>Hello world</p></div>')
        div = soup.find("div")
        result = _parse_content(div)
        assert "<p>Hello world</p>" in result

    def test_blank_paragraph_becomes_blank_line(self):
        soup = self._soup('<div><p></p></div>')
        div = soup.find("div")
        result = _parse_content(div)
        assert 'class="blank-line"' in result

    def test_whitespace_only_paragraph_becomes_blank_line(self):
        soup = self._soup('<div><p>   </p></div>')
        div = soup.find("div")
        result = _parse_content(div)
        assert 'class="blank-line"' in result

    def test_multiple_paragraphs(self):
        soup = self._soup('<div><p>First</p><p>Second</p></div>')
        div = soup.find("div")
        result = _parse_content(div)
        assert "<p>First</p>" in result
        assert "<p>Second</p>" in result

    def test_no_paragraphs_falls_back_to_text(self):
        soup = self._soup('<div>plain text</div>')
        div = soup.find("div")
        result = _parse_content(div)
        assert "plain text" in result

    def test_ruby_tags_preserved(self):
        soup = self._soup('<div><p><ruby>漢字<rt>かんじ</rt></ruby></p></div>')
        div = soup.find("div")
        result = _parse_content(div)
        assert "<ruby>" in result
        assert "<rt>" in result


# ---------------------------------------------------------------------------
# Route: GET /
# ---------------------------------------------------------------------------

class TestIndexRoute:
    def test_returns_200(self, client):
        response = client.get("/")
        assert response.status_code == 200

    def test_html_content_type(self, client):
        response = client.get("/")
        assert "text/html" in response.content_type


# ---------------------------------------------------------------------------
# Route: GET /api/search
# ---------------------------------------------------------------------------

MOCK_SEARCH_RESPONSE = [
    {"allcount": 42},
    {
        "ncode": "n1234ab",
        "title": "Test Novel",
        "writer": "Author",
        "genre": 201,
        "end": 0,
        "noveltype": 1,
        "length": 50000,
        "fav_novel_cnt": 100,
        "general_all_no": 200,
        "story": "A story.",
    },
]


class TestApiSearch:
    def _mock_resp(self, data):
        mock_resp = MagicMock()
        mock_resp.json.return_value = data
        mock_resp.encoding = "utf-8"
        return mock_resp

    @patch("app.requests.get")
    def test_success_returns_novels(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_SEARCH_RESPONSE)
        response = client.get("/api/search?q=test")
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] == 42
        assert len(data["novels"]) == 1
        assert data["novels"][0]["ncode"] == "n1234ab"

    @patch("app.requests.get")
    def test_page_parameter(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{"allcount": 0}])
        response = client.get("/api/search?page=3")
        assert response.status_code == 200
        data = response.get_json()
        assert data["page"] == 3
        # Verify the st param was calculated correctly: (3-1)*20+1 = 41
        call_kwargs = mock_get.call_args
        assert call_kwargs.kwargs["params"]["st"] == 41

    @patch("app.requests.get")
    def test_genre_parameter_forwarded(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{"allcount": 0}])
        client.get("/api/search?genre=201")
        call_params = mock_get.call_args.kwargs["params"]
        assert call_params["genre"] == "201"

    @patch("app.requests.get")
    def test_no_genre_param_omitted(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{"allcount": 0}])
        client.get("/api/search")
        call_params = mock_get.call_args.kwargs["params"]
        assert "genre" not in call_params

    @patch("app.requests.get")
    def test_novels_enriched(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_SEARCH_RESPONSE)
        response = client.get("/api/search")
        data = response.get_json()
        novel = data["novels"][0]
        assert "genre_name" in novel
        assert "genre_icon" in novel
        assert "is_completed" in novel
        assert "length_label" in novel

    @patch("app.requests.get", side_effect=Exception("network error"))
    def test_exception_returns_error(self, mock_get, client):
        response = client.get("/api/search")
        assert response.status_code == 200
        data = response.get_json()
        assert "error" in data
        assert data["total"] == 0
        assert data["novels"] == []

    @patch("app.requests.get")
    def test_invalid_page_defaults_to_1(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{"allcount": 0}])
        response = client.get("/api/search?page=abc")
        data = response.get_json()
        assert data["page"] == 1
        call_params = mock_get.call_args.kwargs["params"]
        assert call_params["st"] == 1

    @patch("app.requests.get")
    def test_order_parameter_forwarded(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{"allcount": 0}])
        client.get("/api/search?order=new")
        call_params = mock_get.call_args.kwargs["params"]
        assert call_params["order"] == "new"

    @patch("app.requests.get")
    def test_default_order_is_hyoka(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{"allcount": 0}])
        client.get("/api/search")
        call_params = mock_get.call_args.kwargs["params"]
        assert call_params["order"] == "hyoka"


# ---------------------------------------------------------------------------
# Route: GET /novel/<ncode>
# ---------------------------------------------------------------------------

MOCK_NOVEL_DETAIL_RESPONSE = [
    {},
    {
        "ncode": "n1234ab",
        "title": "Test Novel",
        "writer": "Author",
        "genre": 201,
        "end": 0,
        "noveltype": 1,
        "length": 50000,
        "keyword": "action fantasy",
        "story": "A story.",
    },
]


class TestNovelDetail:
    def _mock_resp(self, data):
        mock_resp = MagicMock()
        mock_resp.json.return_value = data
        mock_resp.encoding = "utf-8"
        return mock_resp

    @patch("app.requests.get")
    def test_success_returns_200(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_NOVEL_DETAIL_RESPONSE)
        response = client.get("/novel/n1234ab")
        assert response.status_code == 200

    @patch("app.requests.get")
    def test_ncode_lowercased_in_request(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_NOVEL_DETAIL_RESPONSE)
        client.get("/novel/N1234AB")
        call_params = mock_get.call_args.kwargs["params"]
        assert call_params["ncode"] == "n1234ab"

    @patch("app.requests.get")
    def test_not_found_returns_404(self, mock_get, client):
        mock_get.return_value = self._mock_resp([{}])
        response = client.get("/novel/missing")
        assert response.status_code == 404

    @patch("app.requests.get", side_effect=Exception("network error"))
    def test_exception_returns_500(self, mock_get, client):
        response = client.get("/novel/n1234ab")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# Route: GET /api/chapters/<ncode>
# ---------------------------------------------------------------------------

MOCK_CHAPTERS_HTML = """
<html><body>
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
</body></html>
"""

MOCK_CHAPTERS_WITH_ARCS_HTML = """
<html><body>
<div class="index_box">
  <div class="chapter_title">第一章</div>
  <dl>
    <dt>2024-01-01</dt>
    <dd class="subtitle"><a href="/n1234ab/1/">第一話</a></dd>
  </dl>
  <div class="chapter_title">第二章</div>
  <dl>
    <dt>2024-01-02</dt>
    <dd class="subtitle"><a href="/n1234ab/2/">第二話</a></dd>
  </dl>
</div>
</body></html>
"""


class TestGetChapters:
    def _mock_resp(self, text):
        mock_resp = MagicMock()
        mock_resp.text = text
        mock_resp.encoding = "utf-8"
        return mock_resp

    @patch("app.requests.get")
    def test_success_returns_chapters(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CHAPTERS_HTML)
        response = client.get("/api/chapters/n1234ab")
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["chapters"]) == 2
        assert data["chapters"][0]["num"] == 1
        assert data["chapters"][0]["title"] == "第一話"

    @patch("app.requests.get")
    def test_success_returns_arcs(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CHAPTERS_WITH_ARCS_HTML)
        response = client.get("/api/chapters/n1234ab")
        data = response.get_json()
        assert len(data["arcs"]) == 2
        assert data["arcs"][0]["title"] == "第一章"
        assert len(data["arcs"][0]["chapters"]) == 1

    @patch("app.requests.get")
    def test_no_index_box_returns_empty(self, mock_get, client):
        mock_get.return_value = self._mock_resp("<html><body></body></html>")
        response = client.get("/api/chapters/n1234ab")
        data = response.get_json()
        assert data["chapters"] == []
        assert data["arcs"] == []

    @patch("app.requests.get")
    def test_ncode_lowercased_in_url(self, mock_get, client):
        mock_get.return_value = self._mock_resp("<html><body></body></html>")
        client.get("/api/chapters/N1234AB")
        called_url = mock_get.call_args.args[0]
        assert "n1234ab" in called_url

    @patch("app.requests.get", side_effect=Exception("network error"))
    def test_exception_returns_error(self, mock_get, client):
        response = client.get("/api/chapters/n1234ab")
        assert response.status_code == 200
        data = response.get_json()
        assert "error" in data
        assert data["chapters"] == []

    @patch("app.requests.get")
    def test_chapter_with_non_numeric_href_uses_fallback(self, mock_get, client):
        html = """
        <html><body>
        <div class="index_box">
          <dl>
            <dt>2024-01-01</dt>
            <dd class="subtitle"><a href="/n1234ab/notanumber/">話</a></dd>
          </dl>
        </div>
        </body></html>
        """
        mock_get.return_value = self._mock_resp(html)
        response = client.get("/api/chapters/n1234ab")
        data = response.get_json()
        # Fallback: num = len(chapters) + 1 = 1
        assert data["chapters"][0]["num"] == 1


# ---------------------------------------------------------------------------
# Route: GET /read/<ncode>/<chapter>
# ---------------------------------------------------------------------------

class TestReadChapter:
    def test_returns_200(self, client):
        response = client.get("/read/n1234ab/1")
        assert response.status_code == 200

    def test_ncode_lowercased(self, client):
        response = client.get("/read/N1234AB/1")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Route: GET /api/content/<ncode>/<chapter>
# ---------------------------------------------------------------------------

MOCK_CONTENT_HTML = """
<html><body>
  <p class="novel_subtitle">第一話 はじまり</p>
  <a class="novel_title" href="/n1234ab/">テスト小説</a>
  <div id="novel_p"><p>前言段落</p></div>
  <div id="novel_honbun"><p>本文段落一</p><p>本文段落二</p></div>
  <div id="novel_a"><p>後記段落</p></div>
  <div class="novel_bn">
    <a href="/n1234ab/2/">次へ</a>
  </div>
</body></html>
"""

MOCK_CONTENT_HTML_PREV = """
<html><body>
  <p class="novel_subtitle">第二話</p>
  <div id="novel_honbun"><p>本文</p></div>
  <div class="novel_bn">
    <a href="/n1234ab/1/">前へ</a>
    <a href="/n1234ab/3/">次へ</a>
  </div>
</body></html>
"""


class TestGetContent:
    def _mock_resp(self, text):
        mock_resp = MagicMock()
        mock_resp.text = text
        mock_resp.encoding = "utf-8"
        return mock_resp

    @patch("app.requests.get")
    def test_success_returns_title(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        response = client.get("/api/content/n1234ab/1")
        assert response.status_code == 200
        data = response.get_json()
        assert data["title"] == "第一話 はじまり"

    @patch("app.requests.get")
    def test_returns_novel_title(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert data["novel_title"] == "テスト小説"

    @patch("app.requests.get")
    def test_returns_content(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert "本文段落一" in data["content"]
        assert "本文段落二" in data["content"]

    @patch("app.requests.get")
    def test_returns_foreword(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert "前言段落" in data["foreword"]

    @patch("app.requests.get")
    def test_returns_afterword(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert "後記段落" in data["afterword"]

    @patch("app.requests.get")
    def test_next_chapter_navigation(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert data["next_chapter"] == 2
        assert data["prev_chapter"] is None

    @patch("app.requests.get")
    def test_prev_and_next_chapter_navigation(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML_PREV)
        response = client.get("/api/content/n1234ab/2")
        data = response.get_json()
        assert data["prev_chapter"] == 1
        assert data["next_chapter"] == 3

    @patch("app.requests.get")
    def test_title_fallback_when_no_title_elem(self, mock_get, client):
        html = '<html><body><div id="novel_honbun"><p>content</p></div></body></html>'
        mock_get.return_value = self._mock_resp(html)
        response = client.get("/api/content/n1234ab/5")
        data = response.get_json()
        assert data["title"] == "第5话"

    @patch("app.requests.get")
    def test_ncode_lowercased_in_url(self, mock_get, client):
        mock_get.return_value = self._mock_resp(MOCK_CONTENT_HTML)
        client.get("/api/content/N1234AB/1")
        called_url = mock_get.call_args.args[0]
        assert "n1234ab" in called_url

    @patch("app.requests.get")
    def test_novel_title_via_href_fallback(self, mock_get, client):
        # No .novel_title element; falls back to a[href="/{ncode}/"]
        html = """
        <html><body>
          <a href="/n1234ab/">フォールバックタイトル</a>
          <div id="novel_honbun"><p>content</p></div>
        </body></html>
        """
        mock_get.return_value = self._mock_resp(html)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert data["novel_title"] == "フォールバックタイトル"

    @patch("app.requests.get")
    def test_navigation_link_with_non_numeric_href_skipped(self, mock_get, client):
        # nav link has non-numeric href → ValueError → skipped
        html = """
        <html><body>
          <div id="novel_honbun"><p>content</p></div>
          <div class="novel_bn">
            <a href="/n1234ab/notanumber/">bad</a>
          </div>
        </body></html>
        """
        mock_get.return_value = self._mock_resp(html)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert data["prev_chapter"] is None
        assert data["next_chapter"] is None

    @patch("app.requests.get")
    def test_navigation_link_with_empty_href_skipped(self, mock_get, client):
        # nav link with empty/root href has no parts → continue (line 206)
        html = """
        <html><body>
          <div id="novel_honbun"><p>content</p></div>
          <div class="novel_bn">
            <a href="">empty</a>
          </div>
        </body></html>
        """
        mock_get.return_value = self._mock_resp(html)
        response = client.get("/api/content/n1234ab/1")
        data = response.get_json()
        assert data["prev_chapter"] is None
        assert data["next_chapter"] is None

    @patch("app.requests.get", side_effect=Exception("network error"))
    def test_exception_returns_error(self, mock_get, client):
        response = client.get("/api/content/n1234ab/1")
        assert response.status_code == 200
        data = response.get_json()
        assert "error" in data


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

class TestErrorHandlers:
    def test_404_handler(self, client):
        response = client.get("/nonexistent-path-xyz")
        assert response.status_code == 404
        assert b"html" in response.data.lower()

    def test_500_handler(self):
        from app import server_error
        with flask_app.test_request_context():
            response, status_code = server_error(Exception("forced error"))
        assert status_code == 500
        assert "html" in response.lower()
