#!/usr/bin/env python3
"""Fetch trending items from Reddit, Twitch, Apple Music, Google Trends,
Wikipedia and Hacker News, plus thumbnails for hand-added TikTok links.

Runs hourly in GitHub Actions (.github/workflows/update-data.yml).
Settings live in scripts/sources.json. Each source writes its own file in
data/. If a source fails or its keys are missing, its old file is kept and
the other sources still run.

Keys (GitHub repository secrets):
  REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET   - free Reddit "script" app
  TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET   - free Twitch developer app
Everything else needs no key.

Uses only the Python standard library.
"""

import base64
import email.utils
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SETTINGS = os.path.join(ROOT, "scripts", "sources.json")
SITE = "https://pint-sys.github.io/trendwharf/"
USER_AGENT = os.environ.get("FEEDS_USER_AGENT") or f"web:trendwharf:v1.0 (+{SITE})"

VIDEO_HOSTS = ("youtube.com", "youtu.be", "tiktok.com", "instagram.com", "x.com", "twitter.com")


class SourceError(Exception):
    pass


# ---------- small helpers ----------

def now_utc():
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(name, payload):
    path = os.path.join(DATA, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")


def http(url, *, headers=None, data=None, method=None, as_json=True):
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json" if as_json else "*/*"}
    hdrs.update(headers or {})
    body = urllib.parse.urlencode(data).encode() if isinstance(data, dict) else data
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        # Only the host and path are printed, never query strings that could hold secrets.
        where = urllib.parse.urlsplit(url)
        raise SourceError(f"HTTP {e.code} from {where.netloc}{where.path}") from None
    except urllib.error.URLError as e:
        raise SourceError(f"network error: {e.reason}") from None
    return json.loads(raw) if as_json else raw


def hours_since(ts, now):
    return max(1.0, (now - ts).total_seconds() / 3600)


def from_unix(t):
    return datetime.fromtimestamp(int(t), tz=timezone.utc)


def is_video_link(url):
    host = (urllib.parse.urlsplit(url or "").hostname or "").removeprefix("www.").removeprefix("m.")
    return host in VIDEO_HOSTS


def previous_ranks(name):
    old = load_json(os.path.join(DATA, name), {})
    return {it["rawId"]: it.get("rank") for it in old.get("items", []) if "rawId" in it}


# ---------- sources ----------

def fetch_reddit(cfg, now, blocked):
    cid = os.environ.get("REDDIT_CLIENT_ID", "").strip()
    secret = os.environ.get("REDDIT_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        raise SourceError("no REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET secrets yet")
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    tok = http("https://www.reddit.com/api/v1/access_token", method="POST",
               data={"grant_type": "client_credentials"},
               headers={"Authorization": "Basic " + basic})
    token = tok.get("access_token")
    if not token:
        raise SourceError("Reddit did not return an access token")

    blocked_ids = set(blocked.get("reddit", []))
    blocked_subs = {s.lower() for s in blocked.get("redditSubs", [])}
    cat_map = {k.lower(): v for k, v in cfg.get("categoryBySubreddit", {}).items()}
    items, seen = [], set()
    for sub in cfg.get("subreddits", ["popular"]):
        if not re.fullmatch(r"\w{2,30}", sub):
            continue
        listing = http(f"https://oauth.reddit.com/r/{sub}/hot?limit={int(cfg.get('limit', 30))}&raw_json=1",
                       headers={"Authorization": "Bearer " + token})
        for child in listing.get("data", {}).get("children", []):
            d = child.get("data", {})
            pid, sr = d.get("id"), (d.get("subreddit") or "")
            if (not pid or pid in seen or pid in blocked_ids or sr.lower() in blocked_subs
                    or d.get("over_18") or d.get("spoiler") or d.get("stickied")):
                continue
            permalink = d.get("permalink", "")
            if not re.match(r"^/r/\w+/comments/\w+/", permalink):
                continue
            seen.add(pid)
            created = from_unix(d.get("created_utc", 0))
            external = d.get("url_overridden_by_dest") or ""
            thumb = None
            try:
                res = d["preview"]["images"][0]["resolutions"]
                thumb = (res[3] if len(res) > 3 else res[-1])["url"]
            except (KeyError, IndexError, TypeError):
                if str(d.get("thumbnail", "")).startswith("http"):
                    thumb = d["thumbnail"]
            domain = d.get("domain", "")
            items.append({
                "rawId": pid,
                "title": d.get("title", ""),
                "url": "https://www.reddit.com" + permalink,
                "videoUrl": external if is_video_link(external) else None,
                "category": cat_map.get(sr.lower(), cfg.get("defaultCategory", "memes")),
                "tags": ["r/" + sr],
                "summary": f"Trending in r/{sr}." + (f" Links to {domain}." if external and not domain.startswith(("self.", "i.redd.it", "v.redd.it", "reddit.com")) else ""),
                "thumbnail": thumb,
                "publishedAt": iso(created),
                "hot": round(d.get("score", 0) / hours_since(created, now), 1),
                "metrics": {"score": d.get("score"), "comments": d.get("num_comments"), "subreddit": sr},
                "embed": {"kind": "reddit", "value": permalink},
            })
    for i, it in enumerate(items):
        it["rank"] = i + 1
    return {"items": items}


def fetch_twitch(cfg, now, blocked):
    cid = os.environ.get("TWITCH_CLIENT_ID", "").strip()
    secret = os.environ.get("TWITCH_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        raise SourceError("no TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET secrets yet")
    tok = http("https://id.twitch.tv/oauth2/token", method="POST",
               data={"client_id": cid, "client_secret": secret, "grant_type": "client_credentials"})
    token = tok.get("access_token")
    if not token:
        raise SourceError("Twitch did not return an access token")
    params = {"first": int(cfg.get("limit", 20)), "type": "live"}
    if cfg.get("language"):
        params["language"] = cfg["language"]
    res = http("https://api.twitch.tv/helix/streams?" + urllib.parse.urlencode(params),
               headers={"Client-Id": cid, "Authorization": "Bearer " + token})
    blocked_logins = {b.lower() for b in blocked.get("twitch", [])}
    items = []
    for s in res.get("data", []):
        login = (s.get("user_login") or "").lower()
        if not re.fullmatch(r"\w{3,25}", login) or login in blocked_logins or s.get("is_mature"):
            continue
        game = s.get("game_name") or ""
        category = "music" if game == "Music" else ("videos" if game in ("Just Chatting", "IRL", "Talk Shows & Podcasts") else "games")
        thumb = (s.get("thumbnail_url") or "").replace("{width}", "640").replace("{height}", "360")
        items.append({
            "rawId": login,
            "title": s.get("title") or f"{s.get('user_name')} is live",
            "url": "https://www.twitch.tv/" + login,
            "category": category,
            "tags": [t for t in [game] + (s.get("tags") or [])[:2] if t],
            "summary": f"{s.get('user_name')} streaming {game or 'live'}.",
            "thumbnail": thumb or None,
            "publishedAt": s.get("started_at"),
            "hot": s.get("viewer_count", 0),
            "metrics": {"viewers": s.get("viewer_count"), "channel": s.get("user_name"), "game": game},
            "embed": {"kind": "twitch", "value": login},
        })
    for i, it in enumerate(items):
        it["rank"] = i + 1
    return {"items": items}


def fetch_music(cfg, now, blocked, country):
    limit = min(100, int(cfg.get("limit", 25)))
    cc = country.lower()
    feed = http(f"https://rss.marketingtools.apple.com/api/v2/{cc}/music/most-played/{limit}/songs.json")
    prev = previous_ranks("music.json")
    blocked_ids = set(blocked.get("music", []))
    items = []
    for i, r in enumerate(feed.get("feed", {}).get("results", [])):
        sid, url = str(r.get("id", "")), r.get("url", "")
        if not sid or sid in blocked_ids or not url.startswith("https://music.apple.com/"):
            continue
        rank = i + 1
        old = prev.get(sid)
        change = "new" if old is None and prev else (old - rank if old else None)
        genres = [g.get("name") for g in r.get("genres", []) if g.get("name") and g.get("name") != "Music"]
        items.append({
            "rawId": sid,
            "title": r.get("name", ""),
            "url": url,
            "category": "music",
            "tags": genres[:2] + (["Explicit"] if r.get("contentAdvisoryRating") == "Explicit" else []),
            "summary": f"#{rank} on Apple Music's most-played songs ({country.upper()}).",
            "thumbnail": (r.get("artworkUrl100") or "").replace("100x100", "400x400") or None,
            "publishedAt": (r.get("releaseDate") or "")[:10] + "T00:00:00Z" if r.get("releaseDate") else None,
            "hot": limit - rank + 1,
            "rank": rank,
            "metrics": {"artist": r.get("artistName"), "rank": rank, "change": change},
            "embed": {"kind": "music", "value": "https://embed.music.apple.com/" + url[len("https://music.apple.com/"):]},
        })
    return {"country": country.upper(), "items": items}


def parse_traffic(text):
    m = re.match(r"^\s*([\d.,]+)\s*([KMB]?)", text or "", re.I)
    if not m:
        return 0
    n = float(m.group(1).replace(",", ""))
    return int(n * {"": 1, "K": 1e3, "M": 1e6, "B": 1e9}[m.group(2).upper()])


def local(tag):
    return tag.rsplit("}", 1)[-1]


def fetch_searches(cfg, now, blocked, country):
    raw = http("https://trends.google.com/trending/rss?geo=" + urllib.parse.quote(country.upper()), as_json=False)
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise SourceError(f"could not read Google Trends feed: {e}") from None
    blocked_q = {b.lower() for b in blocked.get("searches", [])}
    items = []
    for node in root.iter():
        if local(node.tag) != "item":
            continue
        fields, news = {}, []
        for ch in node:
            name = local(ch.tag)
            if name == "news_item":
                n = {local(x.tag): (x.text or "").strip() for x in ch}
                if n.get("news_item_url", "").startswith("http"):
                    news.append({"title": n.get("news_item_title", ""), "url": n["news_item_url"],
                                 "source": n.get("news_item_source", "")})
            else:
                fields[name] = (ch.text or "").strip()
        q = fields.get("title", "")
        if not q or q.lower() in blocked_q:
            continue
        published = None
        if fields.get("pubDate"):
            try:
                published = iso(email.utils.parsedate_to_datetime(fields["pubDate"]).astimezone(timezone.utc))
            except (TypeError, ValueError):
                pass
        items.append({
            "rawId": q.lower(),
            "query": q,
            "traffic": fields.get("approx_traffic", ""),
            "trafficNum": parse_traffic(fields.get("approx_traffic")),
            "publishedAt": published,
            "picture": fields.get("picture") if fields.get("picture", "").startswith("http") else None,
            "news": news[:3],
        })
    items.sort(key=lambda x: x["trafficNum"], reverse=True)
    return {"country": country.upper(), "items": items}


def fetch_wikipedia(cfg, now, blocked):
    lang = cfg.get("language", "en")
    if not re.fullmatch(r"[a-z-]{2,12}", lang):
        raise SourceError("bad Wikipedia language code")
    data = None
    for days_back in (0, 1):
        day = now - timedelta(days=days_back)
        try:
            data = http(f"https://{lang}.wikipedia.org/api/rest_v1/feed/featured/{day:%Y/%m/%d}")
        except SourceError:
            continue
        if data.get("mostread", {}).get("articles"):
            break
    articles = (data or {}).get("mostread", {}).get("articles", [])
    if not articles:
        raise SourceError("no most-read list available yet")
    blocked_titles = {b.lower() for b in blocked.get("wikipedia", [])}
    items = []
    for a in articles[: int(cfg.get("limit", 20))]:
        title = a.get("titles", {}).get("normalized") or a.get("title", "")
        page = a.get("content_urls", {}).get("desktop", {}).get("page", "")
        if not title or not page.startswith("https://") or title.lower() in blocked_titles:
            continue
        hist = [h.get("views", 0) for h in a.get("view_history", [])]
        change = None
        if len(hist) >= 2 and hist[-2]:
            change = round((hist[-1] - hist[-2]) / hist[-2] * 100)
        items.append({
            "rawId": title.lower(),
            "title": title,
            "url": page,
            "category": "news",
            "tags": ["wikipedia"],
            "summary": (a.get("description") or "Wikipedia article").rstrip(".") + ". Among the most-read articles on Wikipedia yesterday.",
            "thumbnail": (a.get("thumbnail") or {}).get("source"),
            "publishedAt": None,
            "hot": a.get("views", 0),
            "rank": len(items) + 1,
            "metrics": {"views": a.get("views"), "change": change},
        })
    return {"language": lang, "items": items}


def fetch_hackernews(cfg, now, blocked):
    ids = http("https://hacker-news.firebaseio.com/v0/topstories.json")[: int(cfg.get("limit", 20))]
    blocked_ids = {str(b) for b in blocked.get("hackernews", [])}
    items = []
    for sid in ids:
        if str(sid) in blocked_ids:
            continue
        try:
            s = http(f"https://hacker-news.firebaseio.com/v0/item/{int(sid)}.json")
        except SourceError:
            continue
        if not s or s.get("type") != "story" or s.get("dead") or s.get("deleted"):
            continue
        created = from_unix(s.get("time", 0))
        discussion = f"https://news.ycombinator.com/item?id={sid}"
        link = s.get("url") or discussion
        items.append({
            "rawId": str(sid),
            "title": s.get("title", ""),
            "url": link,
            "videoUrl": link if is_video_link(link) else None,
            "category": "news",
            "tags": ["tech", (urllib.parse.urlsplit(link).hostname or "link").removeprefix("www.")] if s.get("url") else ["tech", "Ask HN"],
            "summary": "Top story on Hacker News, a tech news community.",
            "thumbnail": None,
            "publishedAt": iso(created),
            "hot": round(s.get("score", 0) / hours_since(created, now), 1),
            "rank": len(items) + 1,
            "metrics": {"points": s.get("score"), "comments": s.get("descendants", 0), "discussion": discussion},
        })
    return {"items": items}


def fetch_tiktok_thumbnails(cfg, now, blocked):
    items = load_json(os.path.join(DATA, "items.json"), {}).get("items", [])
    out = {}
    for item in items:
        url = item.get("videoUrl") or item.get("url") or ""
        m = re.search(r"tiktok\.com/.+/video/(\d{8,25})", url)
        if not m or m.group(1) in out:
            continue
        try:
            o = http("https://www.tiktok.com/oembed?url=" + urllib.parse.quote(url, safe=""))
        except SourceError as e:
            print(f"  TikTok {m.group(1)}: {e}")
            continue
        out[m.group(1)] = {"title": o.get("title"), "author": o.get("author_name"),
                           "thumbnail": o.get("thumbnail_url")}
    return {"tiktok": out}


# ---------- runner ----------

def main():
    settings = load_json(SETTINGS, {})
    blocked = load_json(os.path.join(DATA, "blocked.json"), {})
    country = (settings.get("country") or "US").upper()
    now = now_utc()

    jobs = [
        ("reddit", "reddit.json", lambda c: fetch_reddit(c, now, blocked)),
        ("twitch", "twitch.json", lambda c: fetch_twitch(c, now, blocked)),
        ("music", "music.json", lambda c: fetch_music(c, now, blocked, country)),
        ("searches", "searches.json", lambda c: fetch_searches(c, now, blocked, country)),
        ("wikipedia", "wikipedia.json", lambda c: fetch_wikipedia(c, now, blocked)),
        ("hackernews", "hackernews.json", lambda c: fetch_hackernews(c, now, blocked)),
        ("tiktokThumbnails", "oembed.json", lambda c: fetch_tiktok_thumbnails(c, now, blocked)),
    ]
    ok, skipped = 0, 0
    for name, filename, job in jobs:
        cfg = settings.get(name, {})
        if cfg.get("enabled") is False:
            print(f"{name}: turned off in sources.json")
            continue
        try:
            result = job(cfg)
        except SourceError as e:
            skipped += 1
            print(f"::warning title={name} skipped::{e} (keeping the previous data)")
            continue
        except Exception as e:  # a bug or unexpected format in one source must not stop the rest
            skipped += 1
            print(f"::warning title={name} failed::{type(e).__name__}: {e} (keeping the previous data)")
            continue
        payload = {"updated": iso(now), "source": name}
        payload.update(result)
        save_json(filename, payload)
        count = len(result.get("items", result.get("tiktok", {})))
        print(f"{name}: saved {count} items")
        ok += 1
    print(f"Done: {ok} sources updated, {skipped} skipped.")


if __name__ == "__main__":
    sys.exit(main())
