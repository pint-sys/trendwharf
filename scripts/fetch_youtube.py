#!/usr/bin/env python3
"""Fetch YouTube trending videos and stats into data/youtube.json.

Runs on a schedule in GitHub Actions (see .github/workflows/youtube.yml).
Needs a YouTube Data API key in the YT_API_KEY environment variable.

What it does:
  1. Gets YouTube's "most popular" chart for one country (YT_REGION, default US).
  2. Gets fresh stats for every YouTube link you added by hand in data/items.json.
  3. Works out a trend score: views gained per hour since the last run
     (or since upload, the first time a video is seen).
  4. Skips any video listed in data/blocked.json.

Quota: each run uses about 2-3 of the 10,000 free daily units.
Uses only the Python standard library.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT_PATH = os.path.join(DATA, "youtube.json")
API = "https://www.googleapis.com/youtube/v3/videos"
PARTS = "snippet,statistics,contentDetails"
ID_RE = re.compile(r"^[\w-]{11}$")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def youtube_id(url):
    """Return the 11-character video ID from a YouTube link, or None."""
    if not url:
        return None
    try:
        u = urllib.parse.urlparse(url)
    except ValueError:
        return None
    host = (u.hostname or "").removeprefix("www.").removeprefix("m.")
    if host in ("youtube.com", "music.youtube.com"):
        v = urllib.parse.parse_qs(u.query).get("v", [None])[0]
        if v and ID_RE.match(v):
            return v
        m = re.match(r"^/(?:shorts|embed|live)/([\w-]{11})", u.path)
        if m:
            return m.group(1)
    if host == "youtu.be":
        m = re.match(r"^/([\w-]{11})", u.path)
        if m:
            return m.group(1)
    return None


def call_api(params, key):
    params = dict(params, key=key)
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        # Never print the URL: it contains the API key.
        sys.exit(f"YouTube API error {e.code}: {body[:500]}")


def parse_duration(iso):
    """'PT1H2M3S' -> 3723 seconds."""
    m = re.match(r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", iso or "")
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def parse_time(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def best_thumbnail(thumbs):
    for size in ("high", "medium", "standard", "default"):
        if size in thumbs:
            return thumbs[size]["url"]
    return None


def to_record(api_item, now, previous):
    sn = api_item.get("snippet", {})
    st = api_item.get("statistics", {})
    cd = api_item.get("contentDetails", {})
    vid = api_item["id"]
    views = to_int(st.get("viewCount"))
    published = sn.get("publishedAt")

    # Trend score = views per hour.
    vph = None
    prev = previous.get(vid)
    if prev and views is not None and prev.get("views") is not None and prev.get("fetchedAt"):
        hours = (now - parse_time(prev["fetchedAt"])).total_seconds() / 3600
        if hours >= 0.5:
            vph = max(0.0, (views - prev["views"]) / hours)
        else:
            vph = prev.get("viewsPerHour")  # ran again too soon; keep the last score
    if vph is None and views is not None and published:
        hours = max(1.0, (now - parse_time(published)).total_seconds() / 3600)
        vph = views / hours

    return {
        "title": sn.get("title", ""),
        "channel": sn.get("channelTitle", ""),
        "publishedAt": published,
        "categoryId": sn.get("categoryId"),
        "thumbnail": best_thumbnail(sn.get("thumbnails", {})),
        "durationSec": parse_duration(cd.get("duration")),
        "views": views,
        "likes": to_int(st.get("likeCount")),       # hidden by some creators -> null
        "comments": to_int(st.get("commentCount")),  # turned off by some creators -> null
        "viewsPerHour": round(vph, 1) if vph is not None else None,
        "fetchedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main():
    key = os.environ.get("YT_API_KEY", "").strip()
    if not key:
        sys.exit("YT_API_KEY is not set. Add it as a repository secret in GitHub.")
    settings = load_json(os.path.join(ROOT, "scripts", "sources.json"), {})
    region = (os.environ.get("YT_REGION") or settings.get("country") or "US").strip().upper()
    max_results = min(50, max(1, int(os.environ.get("YT_MAX") or 25)))
    now = datetime.now(timezone.utc).replace(microsecond=0)

    items = load_json(os.path.join(DATA, "items.json"), {}).get("items", [])
    blocked = set(load_json(os.path.join(DATA, "blocked.json"), {}).get("youtube", []))
    previous = load_json(OUT_PATH, {}).get("videos", {})

    # 1. Trending chart
    chart = call_api({"part": PARTS, "chart": "mostPopular", "regionCode": region,
                      "maxResults": max_results}, key)
    videos, trending = {}, []
    for it in chart.get("items", []):
        if it["id"] in blocked:
            continue
        videos[it["id"]] = to_record(it, now, previous)
        trending.append(it["id"])

    # 2. Stats for YouTube links you added by hand
    manual = []
    for item in items:
        vid = youtube_id(item.get("videoUrl") or item.get("url"))
        if vid and vid not in videos and vid not in manual:
            manual.append(vid)
    for i in range(0, len(manual), 50):
        batch = call_api({"part": PARTS, "id": ",".join(manual[i:i + 50])}, key)
        for it in batch.get("items", []):
            videos[it["id"]] = to_record(it, now, previous)

    out = {
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": region,
        "trending": trending,
        "videos": videos,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Saved {len(trending)} trending + {len(manual)} hand-added videos ({region}).")


if __name__ == "__main__":
    main()
