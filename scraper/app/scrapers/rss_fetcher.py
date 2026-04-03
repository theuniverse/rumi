"""RSS feed fetcher — reads from RSSHub and returns article dicts."""
import hashlib
import json
import logging
from typing import Any

import feedparser
import httpx

from app.config import settings
from app.models import Source

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


async def fetch_source_articles(source: Source) -> list[dict[str, Any]]:
    """
    Fetch RSS feed for a source from RSSHub and return a list of article dicts.
    Each dict has: url, title, content, content_hash, source_id, source_name.
    """
    feed_url = f"{settings.rsshub_base}{source.feed_path}"
    keywords: list[str] = json.loads(source.keywords or "[]")

    try:
        # Use retries=0 transport to avoid keep-alive pool issues with local
        # port forwarders (e.g. Podman Desktop gvproxy) on WeWeRSS port.
        transport = httpx.AsyncHTTPTransport(retries=0)
        async with httpx.AsyncClient(timeout=30, headers=_HEADERS, transport=transport) as client:
            resp = await client.get(feed_url)
            resp.raise_for_status()
            raw = resp.text
    except Exception as e:
        logger.warning("RSS fetch failed for source %s (%s): %s", source.name, feed_url, e)
        return []

    feed = feedparser.parse(raw)
    articles = []

    for entry in feed.entries:
        title = entry.get("title", "")
        link = entry.get("link", "")
        summary = entry.get("summary", "") or entry.get("description", "")
        content_raw = (entry.get("content") or [{}])[0].get("value", summary)
        full_text = f"{title}\n\n{content_raw}"

        if not link:
            continue

        # Keyword filter — skip if no keyword matches (when keywords list is non-empty)
        if keywords and not any(kw.lower() in full_text.lower() for kw in keywords):
            continue

        content_hash = hashlib.sha256(full_text.encode("utf-8")).hexdigest()

        articles.append({
            "url": link,
            "title": title,
            "content": full_text,
            "content_hash": content_hash,
            "source_id": source.id,
            "source_name": source.name,
        })

    logger.info("RSS source '%s': fetched %d articles", source.name, len(articles))
    return articles


async def fetch_page_html(url: str) -> tuple[str, str]:
    """Fetch a page URL and return (html_text, content_hash)."""
    transport = httpx.AsyncHTTPTransport(retries=0)
    async with httpx.AsyncClient(timeout=30, headers=_HEADERS, follow_redirects=True, transport=transport) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text
    content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
    return html, content_hash


async def fetch_article_text(url: str) -> str:
    """
    Fetch a WeChat article URL and return cleaned plain text.

    WeChat articles (mp.weixin.qq.com) are publicly accessible via HTTP.
    We strip scripts/styles and extract the article body so the LLM gets
    dense text instead of raw HTML noise.

    Returns empty string on failure (caller should fall back to RSS content).
    """
    try:
        html, _ = await fetch_page_html(url)
    except Exception as e:
        logger.warning("fetch_article_text: HTTP failed for %s: %s", url, e)
        return ""

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # Remove noise elements
        for tag in soup(["script", "style", "nav", "header", "footer", "iframe", "noscript"]):
            tag.decompose()

        # WeChat article body selectors (in priority order)
        body = (
            soup.find("div", id="js_content")
            or soup.find("div", class_="rich_media_content")
            or soup.find("div", id="js_article")
            or soup.find("article")
        )

        if body:
            text = body.get_text(separator="\n", strip=True)
        else:
            text = soup.get_text(separator="\n", strip=True)

        # Collapse blank lines, cap at 8000 chars (well within LLM context)
        lines = [l for l in text.splitlines() if l.strip()]
        return "\n".join(lines)[:8000]

    except Exception as e:
        logger.warning("fetch_article_text: parse failed for %s: %s", url, e)
        return ""
