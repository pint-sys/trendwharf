# Trendwharf

Trends in games, music, videos, news and memes, summarized in our own words with links to the original sources. Videos from YouTube, TikTok, Instagram and X play right on the page.

Live site: https://pint-sys.github.io/trendwharf/

## Files
- `index.html` – page structure and navigation
- `styles.css` – colors, layout, dark mode, video players
- `app.js` – pages, filters, search, video players, forms
- `config.js` – site name, tagline, form endpoint, analytics (edit this one)
- `data/items.json` – trend items you publish (replace with your Google Sheet export)
- `data/youtube.json`, `reddit.json`, `twitch.json`, `music.json`, `searches.json`, `wikipedia.json`, `hackernews.json`, `oembed.json` – written automatically every hour, don't edit
- `data/blocked.json` – things you never want shown (see below)
- `scripts/sources.json` – settings for the automatic sources (country, subreddits, how many items, on/off)
- `scripts/fetch_youtube.py`, `scripts/fetch_feeds.py` – fetch the data
- `.github/workflows/update-data.yml` – runs both every hour

## Adding a video
Add an item to `data/items.json` with the video's normal link in `url` (or in `videoUrl` if `url` points somewhere else):

```json
{
  "id": "010",
  "title": "Short title in your own words",
  "platform": "TikTok",
  "url": "https://www.tiktok.com/@creator/video/7412345678901234567",
  "dateFound": "2026-10-12",
  "category": "videos",
  "tags": ["dance"],
  "summary": "One or two sentences in your own words.",
  "status": "Published"
}
```

Supported links:
- YouTube: `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`
- TikTok: `tiktok.com/@user/video/…`
- Instagram: `instagram.com/p/…`, `instagram.com/reel/…`
- X: `x.com/user/status/…`

YouTube videos get views, likes, comments and a trend score (views per hour). TikTok, Instagram and X don't share view counts with other sites, so those cards say so.

## Automatic sources
| Source | Key needed | What it shows |
|---|---|---|
| YouTube | `YT_API_KEY` | Trending chart, views, likes, views per hour |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Hot posts (safe-for-work only), upvotes per hour |
| Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Top live streams and viewer counts |
| Apple Music | none | Most-played songs, chart moves, previews |
| Google Trends | none | Rising searches with related news |
| Wikipedia | none | Most-read articles yesterday |
| Hacker News | none | Top tech stories |
| TikTok thumbnails | none | Cover image and creator for TikTok links you add |

Sources without their keys are skipped and keep their old data.

## Blocking things
Edit `data/blocked.json`. It takes effect on the site straight away:

```json
{
  "youtube": ["VIDEO_ID"],
  "reddit": ["post_id"],
  "redditSubs": ["subreddit_name"],
  "twitch": ["channel_login"],
  "music": ["apple_song_id"],
  "wikipedia": ["Article title"],
  "hackernews": ["story_id"],
  "searches": ["search phrase"]
}
```

## YouTube setup (one time)
1. Create a YouTube Data API v3 key in Google Cloud Console.
2. In this repo: Settings → Secrets and variables → Actions → New repository secret. Name `YT_API_KEY`, value = your key.
3. Optional: under the Variables tab, add `YT_REGION` (for example `GB` or `IN`). Default is `US`.
4. Actions tab → "Update trend data" → Run workflow.

## Run locally
    python3 -m http.server 8000
