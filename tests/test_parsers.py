"""Parser tests for new + legacy syosetu HTML (no network)."""
import importlib.util
import pathlib
import sys

import pytest
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as app_module


LEGACY_TOC = """
<html><body>
<div class="index_box">
  <div class="chapter_title">第一章</div>
  <dl class="novel_sublist2">
    <dd class="subtitle"><a href="/n1234ab/1/">プロローグ</a></dd>
    <dt class="long_update">2012/01/01</dt>
  </dl>
  <dl class="novel_sublist2">
    <dd class="subtitle"><a href="/n1234ab/2/">第一話</a></dd>
    <dt class="long_update">2012/01/02</dt>
  </dl>
</div>
</body></html>
"""

NEW_TOC = """
<html><body>
<div class="p-eplist">
  <div class="p-eplist__chapter-title">第１章</div>
  <div class="p-eplist__sublist">
    <a class="p-eplist__subtitle" href="/n1234ab/1/">プロローグ</a>
    <div class="p-eplist__update">2024/01/01</div>
  </div>
  <div class="p-eplist__sublist">
    <a class="p-eplist__subtitle" href="/n1234ab/2/">第一話</a>
    <div class="p-eplist__update">2024/01/02</div>
  </div>
  <div class="p-eplist__chapter-title">第２章</div>
  <div class="p-eplist__sublist">
    <a class="p-eplist__subtitle" href="/n1234ab/3/">続き</a>
  </div>
</div>
<a class="c-pager__item--last" href="/n1234ab/?p=3">最後へ</a>
</body></html>
"""

NEW_CHAPTER = """
<html><body>
<a class="p-novel__series-title" href="/n1234ab/">テスト小説</a>
<h1 class="p-novel__title">第一話　はじまり</h1>
<div class="p-novel__body">
  <div class="p-novel__text p-novel__text--preface"><p>まえがきです</p></div>
  <div class="p-novel__text">
    <p>本文の一行目</p>
    <p></p>
    <p>本文の二行目</p>
  </div>
  <div class="p-novel__text p-novel__text--afterword"><p>あとがきです</p></div>
</div>
<div class="p-novel__navigation">
  <a href="/n1234ab/1/">前へ</a>
  <a href="/n1234ab/">目次</a>
  <a href="/n1234ab/3/">次へ</a>
</div>
</body></html>
"""

LEGACY_CHAPTER = """
<html><body>
<p class="novel_title"><a class="novel_title" href="/n1234ab/">旧タイトル</a></p>
<p class="novel_subtitle">旧話タイトル</p>
<div id="novel_p"><p>旧まえがき</p></div>
<div id="novel_honbun" class="novel_view">
  <p>旧本文</p>
</div>
<div id="novel_a"><p>旧あとがき</p></div>
<div class="novel_bn">
  <a href="/n1234ab/1/">前へ</a>
  <a href="/n1234ab/3/">次へ</a>
</div>
</body></html>
"""


def test_parse_legacy_toc():
    soup = BeautifulSoup(LEGACY_TOC, "html.parser")
    chapters, arcs = app_module._parse_toc_page(soup)
    assert [c["num"] for c in chapters] == [1, 2]
    assert chapters[0]["title"] == "プロローグ"
    assert len(arcs) == 1
    assert arcs[0]["title"] == "第一章"
    assert len(arcs[0]["chapters"]) == 2


def test_parse_new_toc_and_pager():
    soup = BeautifulSoup(NEW_TOC, "html.parser")
    chapters, arcs = app_module._parse_toc_page(soup)
    assert [c["num"] for c in chapters] == [1, 2, 3]
    assert chapters[1]["title"] == "第一話"
    assert len(arcs) == 2
    assert arcs[1]["title"] == "第２章"
    assert app_module._toc_page_count(soup) == 3


def test_parse_new_chapter_content():
    soup = BeautifulSoup(NEW_CHAPTER, "html.parser")
    assert "本文の一行目" in app_module._parse_main_content(soup)
    assert "まえがき" not in app_module._parse_main_content(soup)
    assert "まえがき" in app_module._parse_foreword(soup)
    assert "あとがき" in app_module._parse_afterword(soup)
    title = soup.select_one("h1.p-novel__title").get_text(strip=True)
    assert "第一話" in title


def test_parse_legacy_chapter_content():
    soup = BeautifulSoup(LEGACY_CHAPTER, "html.parser")
    assert "旧本文" in app_module._parse_main_content(soup)
    assert "旧まえがき" in app_module._parse_foreword(soup)
    assert "旧あとがき" in app_module._parse_afterword(soup)


def test_extract_chapter_number():
    assert app_module.extract_chapter_number("/n1234ab/12/", None) == 12
    assert app_module.extract_chapter_number("https://ncode.syosetu.com/n1234ab/7/", None) == 7
    assert app_module.extract_chapter_number("/n1234ab/", 99) == 99


def test_search_endpoint_handles_api_error(monkeypatch):
    client = app_module.app.test_client()

    class Boom:
        def json(self):
            raise ValueError("bad")

        encoding = "utf-8"

    monkeypatch.setattr(app_module.SESSION, "get", lambda *a, **k: Boom())
    resp = client.get("/api/search")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["novels"] == []
    assert "error" in data
