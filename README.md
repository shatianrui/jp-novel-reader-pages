# 日文小说阅读站（小説家になろう）

GitHub Pages 静态阅读前端 + 可选 Flask 后端。

## 最近修复（2026-07）

1. **适配なろう新版 HTML**
   - 目录：`div.p-eplist` / `.p-eplist__chapter-title`（兼容旧版 `div.index_box`）
   - 正文：`div.p-novel__body` + `.p-novel__text`（兼容旧版 `#novel_honbun`）
   - 前言/后记：`.p-novel__text--preface` / `--afterword`
   - 多页目录：`a.c-pager__item--last?p=`

2. **CORS 代理链路**
   - 多公共代理自动回退（`allorigins` / `corsproxy.io` / `codetabs` / `proxy.cors.sh` / `cors.eu.org`）
   - 校验返回内容，避免把 403/Cloudflare 页当正文
   - 可选 Jina Reader 降级
   - 支持自建代理：`localStorage.ncodeProxyBase` 或 URL `?proxy=`

3. **自建 Cloudflare Worker 代理**（推荐，免费稳定）

```bash
cd workers
npx wrangler login
npx wrangler deploy
# 部署后记下 https://xxx.workers.dev
```

浏览器控制台：

```js
localStorage.setItem('ncodeProxyBase', 'https://YOUR_SUBDOMAIN.workers.dev/?url=')
location.reload()
```

或打开：`read.html?ncode=n9669bk&chapter=1&proxy=https://YOUR_SUBDOMAIN.workers.dev/?url=`

## 本地运行 Flask

```bash
pip install -r requirements.txt
python app.py
# http://127.0.0.1:5000
```

## 静态站（GitHub Pages）

打开仓库 Pages 地址即可。搜索走 JSONP 官方 API；目录/正文走 CORS 代理抓取。

## 测试

```bash
pip install pytest
pytest tests/test_parsers.py -v
```
