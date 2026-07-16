# 日文小说阅读站（多源）

GitHub Pages 静态阅读前端 + 可选 Flask 后端。

## 首页浏览源

- **なろう**：远程搜索 / 排行（默认）
- **书架**：本机书架，秒开
- **最近**：本机阅读进度，秒开
- **链接**：粘贴 なろう / カクヨム 作品 URL 或 ID 直接打开（不爬列表）

详情页与阅读页支持内容站：

- **小説家になろう**
- **カクヨム**（章节与作品 ID 全程字符串，避免大整数精度丢失）

书架与阅读进度按 `source:id` 本地保存（旧なろう裸 ncode 记录会自动迁移）。阅读不会自动加入书架，需在详情页手动「加入书架」或点「开始阅读」。

## 最近能力

1. **多阅读源**
   - 浏览：`?source=narou|shelf|recent|link`
   - 作品：`?source=narou&ncode=...` / `?source=kakuyomu&id=...`
   - 搜索框支持粘贴原站作品 URL / ID 直接打开

2. **适配なろう新版 HTML**
   - 目录：`div.p-eplist` / `.p-eplist__chapter-title`（兼容旧版 `div.index_box`）
   - 正文：`div.p-novel__body` + `.p-novel__text`（兼容旧版 `#novel_honbun`）

3. **カクヨム解析**
   - 作品页：`__NEXT_DATA__` → Apollo `tableOfContentsV2`（大整数安全解析）
   - 正文页：`.widget-episodeBody`

4. **CORS 代理链路**
   - 多公共代理自动回退 + 获胜代理记忆
   - HTML 响应内存缓存、同 URL 请求合并
   - 可选 Jina Reader 降级
   - 自建代理：`localStorage.ncodeProxyBase` 或 URL `?proxy=`
   - 查询型代理基址（`...?url=`）不会被错误追加 `/`

## 自建 Cloudflare Worker 代理（推荐）

```bash
cd workers
npx wrangler login
npx wrangler deploy
```

浏览器控制台：

```js
localStorage.setItem('ncodeProxyBase', 'https://YOUR_SUBDOMAIN.workers.dev/?url=')
location.reload()
```

Worker 仅允许代理 なろう / カクヨム 相关域名。

## 本地运行 Flask

```bash
pip install -r requirements.txt
python app.py
# http://127.0.0.1:5000
```

## 静态站（GitHub Pages）

打开仓库 Pages 地址即可。なろう搜索走 JSONP/代理 API；カクヨム与目录/正文走 CORS 代理抓取。

## 测试

```bash
pip install pytest
pytest tests/test_parsers.py -v
```
