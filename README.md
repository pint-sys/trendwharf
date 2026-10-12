# Trendwharf

Trends in games, music, videos, news and memes, summarized in our own words with links to the original sources. Videos from YouTube, TikTok, Instagram and X play right on the page.

Live site: https://pint-sys.github.io/trendwharf/

## Files
- `index.html` – page structure and navigation
- `styles.css` – colors, layout, dark mode, video players
- `app.js` – pages, filters, search, video players, forms
- `config.js` – site name, tagline, form endpoint, analytics (edit this one)
- `data/items.json` – trend items you publish (replace with your Google Sheet export)
- `data/youtube.json` – YouTube trending chart and live stats (written automatically, don't edit)
- `data/blocked.json` – YouTube video IDs you never want shown
- `scripts/fetch_youtube.py` – fetches YouTube data
- `.github/workflows/youtube.yml` – runs the fetch every 6 hours

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

## YouTube setup (one time)
1. Create a YouTube Data API v3 key in Google Cloud Console.
2. In this repo: Settings → Secrets and variables → Actions → New repository secret. Name `YT_API_KEY`, value = your key.
3. Optional: under the Variables tab, add `YT_REGION` (for example `GB` or `IN`). Default is `US`.
4. Actions tab → "Update YouTube trending data" → Run workflow.

## Run locally
    python3 -m http.server 8000
