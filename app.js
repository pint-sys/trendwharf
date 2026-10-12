(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};

  var CATEGORIES = [
    { slug: "games", label: "Games", desc: "Game releases, esports, and gaming moments people are talking about." },
    { slug: "music", label: "Music", desc: "Songs, sounds, and music moments going viral." },
    { slug: "videos", label: "Videos", desc: "Short-form formats, creators, and video trends." },
    { slug: "news", label: "News", desc: "Current stories and the conversations around them." },
    { slug: "memes", label: "Memes", desc: "Jokes, formats, and internet culture." }
  ];

  // maxAge = how many days old an item can be (0 = found today). null = no limit.
  var DATE_RANGES = {
    all:   { label: "Any time",     maxAge: null },
    today: { label: "Today",        maxAge: 0 },
    week:  { label: "Past 7 days",  maxAge: 6 },
    month: { label: "Past 30 days", maxAge: 29 }
  };

  var PAGES = {
    about: {
      title: "About",
      body: [
        { h: "What this site does", p: [
          "We collect publicly available trends from approved platforms and summarize them in our own words. Every item links to its original source so you can check it and see the full version."
        ]},
        { h: "Two kinds of items", p: [
          "Featured trends are chosen from approved sources, summarized in our own words, and reviewed by a person before they appear here. AI helps find items and draft summaries; a reviewer checks each one.",
          "Automatic lists — YouTube trending, Reddit, Twitch, Apple Music's chart, Google searches, Wikipedia's most-read articles and Hacker News — come straight from those platforms' public data and refresh every hour. They are not reviewed one by one. We filter out adult-marked content and remove anything that's reported to us."
        ]},
        { h: "How the trend score works", p: [
          "Each item gets a score from 0 to 100 compared with others from the same platform: views per hour on YouTube, upvotes per hour on Reddit, live viewers on Twitch, chart position for songs, reads on Wikipedia, and points per hour on Hacker News."
        ]},
        { h: "Mistakes", p: [
          "Mistakes happen, so tell us when you see one."
        ]},
        { h: "We do not host copies", p: [
          "We do not re-upload videos, songs, or articles. Videos, streams and songs play through each platform's official player, so creators keep their views and credit. If you are a creator or rights holder and want an item removed, we will act on a valid request."
        ]},
        { h: "Contact and takedown requests", p: [
          "Send corrections, questions and takedown requests through our contact form. Include the item link and what you would like us to change."
        ], contact: "Takedown request" }
      ]
    },
    privacy: {
      title: "Privacy",
      body: [
        { h: "What we collect", p: [
          "We do not ask for accounts. If you use our suggestion or contact forms, we receive the details you send, including your email address if you choose to give it. Forms are delivered to us by email through a third-party form service (FormSubmit). Analytics, if turned on, measure page visits in aggregate."
        ]},
        { h: "What we do with it", p: [
          "We use this information only to respond to you and to improve the site. We do not sell personal data."
        ]},
        { h: "Your choices", p: [
          "You can ask us to delete anything you sent us through our contact form."
        ], contact: "Question" }
      ]
    },
    terms: {
      title: "Terms of use",
      body: [
        { h: "Information only", p: [
          "Content on this site is for general information. It is not professional, legal, or financial advice."
        ]},
        { h: "Third-party content", p: [
          "Original content belongs to its creators and platforms. Links lead to third-party sites that we do not control."
        ]},
        { h: "Removals", p: [
          "We may remove any item at any time, including on request from a rights holder."
        ], contact: "Takedown request" },
        { h: "Changes", p: [
          "We may update these terms. Continued use of the site means you accept the current version."
        ]}
      ]
    }
  };

  var PLATFORMS = [
    { slug: "youtube",   label: "YouTube",   desc: "Videos from YouTube, with live views, likes and a trend score." },
    { slug: "tiktok",    label: "TikTok",    desc: "TikTok videos you can play right here. TikTok doesn't share view counts with other sites." },
    { slug: "instagram", label: "Instagram", desc: "Instagram posts and reels. Instagram doesn't share view counts with other sites." },
    { slug: "x",         label: "X",         desc: "Posts and videos from X (Twitter)." },
    { slug: "reddit",    label: "Reddit",    desc: "Posts climbing fastest on Reddit, ranked by upvotes per hour. Safe-for-work only." },
    { slug: "twitch",    label: "Twitch",    desc: "The biggest live streams on Twitch when we last checked. Press play to watch live." },
    { slug: "music",     label: "Apple Music", desc: "Apple Music's most-played songs. Press play for a preview." },
    { slug: "wikipedia", label: "Wikipedia", desc: "The articles people read most on Wikipedia yesterday — a good sign of what's in the news." },
    { slug: "hackernews", label: "Hacker News", desc: "Top tech stories on Hacker News, ranked by points per hour." },
    { slug: "web",       label: "Articles",  desc: "News stories, blog posts and trend reports." }
  ];

  // Data files written by the hourly GitHub job (scripts/fetch_feeds.py).
  var FEEDS = ["reddit", "twitch", "music", "wikipedia", "hackernews"];

  // YouTube's category IDs mapped to our categories.
  var YT_CATEGORY_MAP = { "20": "games", "10": "music", "25": "news", "23": "memes" };

  var state = { items: [], updated: "", yt: null, feeds: {}, searches: null, oembed: {}, blocked: {}, loaded: false, error: false };
  var view = document.getElementById("view");

  // ---------- video helpers ----------

  // Works out which platform a link belongs to and pulls out the video ID.
  // IDs are checked against strict patterns before they go into any player URL.
  function parseVideo(url) {
    if (!url) return null;
    var u;
    try { u = new URL(url); } catch (e) { return null; }
    var host = u.hostname.replace(/^www\.|^m\./, "");
    var path = u.pathname;
    var m;
    if (host === "youtube.com" || host === "music.youtube.com") {
      var v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return { platform: "youtube", id: v };
      m = path.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
      if (m) return { platform: "youtube", id: m[1], vertical: path.indexOf("/shorts/") === 0 };
    }
    if (host === "youtu.be") {
      m = path.match(/^\/([\w-]{11})/);
      if (m) return { platform: "youtube", id: m[1] };
    }
    if (host === "tiktok.com") {
      m = path.match(/\/video\/(\d{8,25})/);
      if (m) return { platform: "tiktok", id: m[1], vertical: true };
    }
    if (host === "instagram.com") {
      m = path.match(/^\/(p|reel|reels|tv)\/([\w-]{5,40})/);
      if (m) return { platform: "instagram", id: m[2], kind: m[1] === "p" ? "p" : "reel", vertical: true };
    }
    if (host === "x.com" || host === "twitter.com") {
      m = path.match(/\/status\/(\d{5,25})/);
      if (m) return { platform: "x", id: m[1] };
    }
    return null;
  }

  function platformOf(item) {
    return item.source || (item.video ? item.video.platform : "web");
  }

  function platformLabel(slug) {
    var p = PLATFORMS.filter(function (x) { return x.slug === slug; })[0];
    return p ? p.label : slug;
  }

  var compact = (window.Intl && Intl.NumberFormat)
    ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
    : { format: String };

  function fmtNum(n) { return (n === null || n === undefined) ? "–" : compact.format(n); }

  function timeAgo(iso) {
    var secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(secs)) return "";
    if (secs < 3600) return Math.max(1, Math.round(secs / 60)) + " min ago";
    if (secs < 86400) return Math.round(secs / 3600) + " h ago";
    if (secs < 86400 * 30) return Math.round(secs / 86400) + " days ago";
    return fmtDate(iso.slice(0, 10));
  }

  function fmtDuration(s) {
    if (!s) return "";
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
  }

  // Trend score (0-100) compares items fairly across platforms: each item is
  // ranked against others from the same platform by its platform's own speed
  // measure (views/hour, upvotes/hour, live viewers, chart position...).
  function hotScore(item) { return typeof item.trend === "number" ? item.trend : -1; }
  function viewCount(item) {
    if (item.stats) return item.stats.views || 0;
    var m = item.metrics || {};
    var n = m.views || m.viewers || m.score || m.points;
    return typeof n === "number" ? n : -1;
  }

  function feedItems() {
    var out = [];
    FEEDS.forEach(function (source) {
      var feed = state.feeds[source];
      if (!feed || !feed.items) return;
      var blocked = (state.blocked[source] || []).map(function (b) { return String(b).toLowerCase(); });
      feed.items.forEach(function (f) {
        if (blocked.indexOf(String(f.rawId).toLowerCase()) !== -1) return;
        out.push({
          id: source + "-" + f.rawId,
          rawId: f.rawId,
          source: source,
          title: f.title,
          platform: platformLabel(source),
          url: f.url,
          videoUrl: f.videoUrl || null,
          dateFound: (feed.updated || "").slice(0, 10),
          feedUpdated: feed.updated,
          category: f.category,
          tags: f.tags || [],
          summary: f.summary,
          thumbnail: f.thumbnail || null,
          publishedAt: f.publishedAt,
          hot: f.hot,
          rank: f.rank,
          metrics: f.metrics || {},
          embed: f.embed || null,
          status: "Published",
          auto: true
        });
      });
    });
    return out;
  }

  function addTrendScores(items) {
    var groups = {};
    items.forEach(function (i) {
      if (typeof i.hot !== "number") return;
      var p = platformOf(i);
      (groups[p] = groups[p] || []).push(i);
    });
    Object.keys(groups).forEach(function (p) {
      var g = groups[p].sort(function (a, b) { return b.hot - a.hot; });
      g.forEach(function (item, idx) { item.trend = Math.round(100 * (g.length - idx) / g.length); });
    });
    return items;
  }

  // Turns entries from YouTube's trending chart into site items.
  function youtubeTrendingItems() {
    if (!state.yt || !state.yt.trending) return [];
    var blocked = state.blocked.youtube || [];
    var fetchedDay = (state.yt.updated || "").slice(0, 10);
    return state.yt.trending.map(function (vid, i) {
      var v = state.yt.videos[vid];
      if (!v || blocked.indexOf(vid) !== -1) return null;
      return {
        id: "yt-" + vid,
        title: v.title,
        platform: "YouTube",
        url: "https://www.youtube.com/watch?v=" + vid,
        dateFound: fetchedDay || (v.publishedAt || "").slice(0, 10),
        category: YT_CATEGORY_MAP[v.categoryId] || "videos",
        tags: ["youtube trending", v.channel].filter(Boolean),
        summary: "#" + (i + 1) + " on YouTube's trending chart (" + (state.yt.region || "US") + "). Uploaded by " + v.channel + ".",
        status: "Published",
        auto: true
      };
    }).filter(Boolean);
  }

  // Adds video info and live stats to every item.
  function enrich(items) {
    var seen = {};
    return items.map(function (item) {
      var copy = Object.assign({}, item);
      // Feed items (Reddit, Hacker News...) only play a video when their link points to one.
      copy.video = parseVideo(item.source ? item.videoUrl : (item.videoUrl || item.url));
      var v = copy.video;
      if (v && v.platform === "youtube" && state.yt && state.yt.videos) {
        var s = state.yt.videos[v.id];
        if (s) {
          copy.stats = s;
          if (!copy.thumbnail) copy.thumbnail = s.thumbnail;
          if (!copy.source && typeof s.viewsPerHour === "number") copy.hot = s.viewsPerHour;
        }
      }
      if (v && v.platform === "youtube" && !copy.thumbnail) {
        copy.thumbnail = "https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg";
      }
      if (v && v.platform === "tiktok" && state.oembed.tiktok && state.oembed.tiktok[v.id]) {
        var t = state.oembed.tiktok[v.id];
        if (!copy.thumbnail && t.thumbnail) copy.thumbnail = t.thumbnail;
        if (t.author) copy.creator = t.author;
      }
      return copy;
    }).filter(function (item) {
      // Don't show the same video twice (manual item + trending chart).
      if (!item.video) return true;
      var key = item.video.platform + ":" + item.video.id;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  // ---------- helpers ----------

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fmtDate(s) {
    var d = new Date(s + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function daysAgo(s) {
    var d = new Date(s + "T00:00:00");
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((now - d) / 86400000);
  }

  function publishedItems() {
    return state.items.filter(function (i) { return i.status === "Published"; });
  }

  function countIn(slug) {
    return publishedItems().filter(function (i) { return i.category === slug; }).length;
  }

  var SORTS = {
    date:  "Newest first",
    hot:   "Hot right now (views per hour)",
    views: "Most viewed",
    title: "Title A–Z"
  };

  function sortItems(list, mode) {
    var copy = list.slice();
    if (mode === "title") {
      copy.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else if (mode === "hot") {
      copy.sort(function (a, b) { return hotScore(b) - hotScore(a) || b.dateFound.localeCompare(a.dateFound); });
    } else if (mode === "views") {
      copy.sort(function (a, b) { return viewCount(b) - viewCount(a) || b.dateFound.localeCompare(a.dateFound); });
    } else {
      copy.sort(function (a, b) { return b.dateFound.localeCompare(a.dateFound); });
    }
    return copy;
  }

  function countPlatform(slug) {
    return publishedItems().filter(function (i) { return platformOf(i) === slug; }).length;
  }

  function filterByRange(list, range) {
    var r = DATE_RANGES[range];
    if (!r || r.maxAge === null) return list;
    return list.filter(function (i) { return daysAgo(i.dateFound) <= r.maxAge; });
  }

  function matchesQuery(item, q) {
    var hay = [item.title, item.summary, item.platform, (item.tags || []).join(" "),
      item.stats ? item.stats.channel : "", item.creator || "",
      item.metrics ? [item.metrics.artist, item.metrics.channel, item.metrics.game, item.metrics.subreddit].join(" ") : ""
    ].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (word) {
      return hay.indexOf(word) !== -1;
    });
  }

  // ---------- components ----------

  // What plays inside a card: a video link (YouTube, TikTok, Instagram, X)
  // or a feed embed (Reddit post, Twitch stream, Apple Music song).
  // Every value is checked against a strict pattern before it goes in a URL.
  function getEmbed(item) {
    if (item.video) return item.video;
    var e = item.embed;
    if (!e) return null;
    if (e.kind === "reddit" && /^\/r\/\w+\/comments\/\w+\/[\w%-]*\/?$/.test(e.value)) return { platform: "reddit", path: e.value };
    if (e.kind === "twitch" && /^\w{3,25}$/.test(e.value)) return { platform: "twitch", id: e.value };
    if (e.kind === "music" && /^https:\/\/embed\.music\.apple\.com\/[a-z]{2}\/[\w%.\/?=&-]+$/.test(e.value)) return { platform: "music", src: e.value };
    return null;
  }

  function isDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Builds the real player. Only called after someone clicks Play,
  // so pages stay fast and no platform loads until it's needed.
  function playerFrame(embed) {
    var src;
    switch (embed.platform) {
      case "youtube":
        src = "https://www.youtube-nocookie.com/embed/" + embed.id + "?autoplay=1&rel=0&playsinline=1"; break;
      case "tiktok":
        src = "https://www.tiktok.com/player/v1/" + embed.id + "?autoplay=1&rel=0"; break;
      case "instagram":
        src = "https://www.instagram.com/" + embed.kind + "/" + embed.id + "/embed/"; break;
      case "x":
        src = "https://platform.twitter.com/embed/Tweet.html?id=" + embed.id + "&dnt=true" + (isDark() ? "&theme=dark" : ""); break;
      case "reddit":
        src = "https://embed.reddit.com" + embed.path + "?embed=true&theme=" + (isDark() ? "dark" : "light"); break;
      case "twitch":
        // Twitch only plays when told which site it's on.
        src = "https://player.twitch.tv/?channel=" + embed.id + "&parent=" + encodeURIComponent(location.hostname) + "&autoplay=true"; break;
      case "music":
        src = embed.src; break;
    }
    return el("iframe", {
      src: src,
      title: platformLabel(embed.platform) + " player",
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write",
      allowfullscreen: true,
      loading: "lazy",
      referrerpolicy: "strict-origin-when-cross-origin"
    });
  }

  var PLAY_WORD = { reddit: "Open post: ", twitch: "Watch live: ", music: "Play preview: " };

  function videoBox(item, embed) {
    var p = embed.platform;
    var box = el("div", { class: "player player-" + p + (embed.vertical ? " vertical" : "") });
    var cover = el("button", { type: "button", class: "player-cover", "aria-label": (PLAY_WORD[p] || "Play: ") + item.title }, [
      el("span", { class: "player-brand", text: platformLabel(p) }),
      item.thumbnail
        ? el("img", { src: item.thumbnail, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer",
            onerror: function () { this.remove(); } })
        : null,
      el("span", { class: "play-icon", "aria-hidden": "true" }),
      p === "twitch" ? el("span", { class: "live-dot", text: "LIVE" }) : null,
      item.stats && item.stats.durationSec
        ? el("span", { class: "duration", text: fmtDuration(item.stats.durationSec) })
        : null
    ]);
    cover.addEventListener("click", function () {
      box.innerHTML = "";
      box.classList.add("playing");
      box.appendChild(playerFrame(embed));
    });
    box.appendChild(cover);
    return box;
  }

  function stat(icon, text, title, cls) {
    return el("span", { title: title, class: cls || null }, [icon + " ", text]);
  }

  function has(n) { return n !== null && n !== undefined; }

  function changeText(change) {
    if (change === "new") return stat("✨", "New", "New on the chart", "hot");
    if (typeof change !== "number" || change === 0) return null;
    return change > 0 ? stat("▲", String(change), "Places up since last check", "up") : stat("▼", String(-change), "Places down since last check", "down");
  }

  function statsRow(item) {
    var m = item.metrics || {}, s = item.stats, parts = null;
    switch (item.source) {
      case "reddit":
        parts = [
          stat("⬆", fmtNum(m.score), "Upvotes"),
          stat("💬", fmtNum(m.comments), "Comments"),
          item.publishedAt ? stat("⏱", timeAgo(item.publishedAt), "Posted") : null,
          item.hot ? stat("🔥", fmtNum(Math.round(item.hot)) + " upvotes/hr", "Upvotes per hour since posted", "hot") : null
        ]; break;
      case "twitch":
        parts = [
          stat("🔴", fmtNum(m.viewers) + " watching", "Viewers when last checked", "hot"),
          m.game ? stat("🎮", m.game, "Game or category") : null,
          item.publishedAt ? stat("⏱", "started " + timeAgo(item.publishedAt), "Stream started") : null
        ]; break;
      case "music":
        parts = [
          stat("🏆", "#" + m.rank, "Chart position", "hot"),
          changeText(m.change),
          m.artist ? stat("🎤", m.artist, "Artist") : null
        ]; break;
      case "wikipedia":
        parts = [
          stat("👁", fmtNum(m.views) + " reads", "Page views yesterday", "hot"),
          typeof m.change === "number" && m.change !== 0
            ? stat(m.change > 0 ? "▲" : "▼", Math.abs(m.change) + "% vs day before", "Change in views", m.change > 0 ? "up" : "down")
            : null
        ]; break;
      case "hackernews":
        parts = [
          stat("▲", fmtNum(m.points) + " points", "Points"),
          stat("💬", fmtNum(m.comments), "Comments"),
          item.publishedAt ? stat("⏱", timeAgo(item.publishedAt), "Posted") : null,
          item.hot ? stat("🔥", fmtNum(Math.round(item.hot)) + " pts/hr", "Points per hour since posted", "hot") : null
        ]; break;
    }
    if (!parts && s) {
      parts = [
        stat("👁", fmtNum(s.views), "Views"),
        has(s.likes) ? stat("👍", fmtNum(s.likes), "Likes") : null,
        has(s.comments) ? stat("💬", fmtNum(s.comments), "Comments") : null,
        s.publishedAt ? stat("⏱", timeAgo(s.publishedAt), "Uploaded") : null,
        s.viewsPerHour ? stat("🔥", fmtNum(Math.round(s.viewsPerHour)) + " views/hr", "Trend score: how fast views are growing", "hot") : null
      ];
    }
    if (parts) return el("div", { class: "stats" }, parts);
    if (item.video) {
      return el("p", { class: "stats muted" }, [
        item.creator ? "👤 " + item.creator + " · " : "",
        "View counts aren't shared by " + platformLabel(item.video.platform) + "."
      ]);
    }
    return null;
  }

  var OPEN_WORD = { reddit: "Open on Reddit", twitch: "Watch on Twitch", music: "Open in Apple Music",
                    wikipedia: "Read on Wikipedia", hackernews: "Open link" };

  function itemCard(item) {
    var cat = CATEGORIES.filter(function (c) { return c.slug === item.category; })[0];
    var platform = platformOf(item);
    var embed = getEmbed(item);
    var byline = (item.stats && item.stats.channel) || (item.source === "twitch" && item.metrics.channel) || null;
    var when = item.source === "twitch"
      ? "Live as of " + timeAgo(item.feedUpdated)
      : (item.auto ? "Trending " : "") + fmtDate(item.dateFound);
    var openText = OPEN_WORD[item.source] || (item.video ? "Watch on " + platformLabel(item.video.platform) : "Original source");
    var cls = "card" + (embed ? " video-card" : "") + (platform === "music" ? " music-card" : "");
    return el("article", { class: cls }, [
      embed ? videoBox(item, embed) : (item.thumbnail ? el("img", { class: "card-thumb", src: item.thumbnail, alt: "", loading: "lazy",
        referrerpolicy: "no-referrer", onerror: function () { this.remove(); } }) : null),
      el("div", { class: "card-meta" }, [
        el("span", { class: "badge", text: cat ? cat.label : item.category }),
        el("span", { class: "pill pill-" + platform, text: platform === "web" ? item.platform : platformLabel(platform) }),
        byline ? el("span", { class: "muted", text: byline }) : null
      ]),
      el("h3", { text: item.title }),
      statsRow(item),
      el("p", { text: item.summary }),
      el("div", { class: "tags" }, (item.tags || []).map(function (t) {
        return el("span", { class: "tag", text: t });
      })),
      el("div", { class: "card-foot" }, [
        el("time", { datetime: item.feedUpdated || item.dateFound, text: when }),
        el("span", { class: "foot-links" }, [
          item.source === "hackernews" && item.metrics.discussion && item.metrics.discussion !== item.url
            ? el("a", { href: item.metrics.discussion, target: "_blank", rel: "noopener noreferrer", text: "Discussion ↗" })
            : null,
          el("a", { class: "source-link", href: item.url, target: "_blank", rel: "noopener noreferrer", text: openText + " ↗" })
        ])
      ])
    ]);
  }

  function grid(list) {
    return el("div", { class: "grid" }, list.map(itemCard));
  }

  function emptyState(message) {
    return el("div", { class: "empty", text: message });
  }

  // Filterable list used by category and search pages.
  // initial: { range, sort, platform, hidePlatform }
  function filterableList(baseList, initial) {
    var range = el("select", { id: "f-range" }, Object.keys(DATE_RANGES).map(function (k) {
      return el("option", { value: k, text: DATE_RANGES[k].label });
    }));
    var sort = el("select", { id: "f-sort" }, Object.keys(SORTS).map(function (k) {
      return el("option", { value: k, text: SORTS[k] });
    }));
    var platform = el("select", { id: "f-platform" },
      [el("option", { value: "all", text: "All platforms" })].concat(PLATFORMS.map(function (p) {
        return el("option", { value: p.slug, text: p.label });
      })));
    range.value = DATE_RANGES[initial.range] ? initial.range : "all";
    sort.value = SORTS[initial.sort] ? initial.sort : "date";
    platform.value = initial.platform || "all";

    var count = el("span", { class: "count", "aria-live": "polite" });
    var results = el("div", { class: "results" });

    function update() {
      var list = filterByRange(baseList, range.value);
      if (platform.value !== "all") {
        list = list.filter(function (i) { return platformOf(i) === platform.value; });
      }
      list = sortItems(list, sort.value);
      count.textContent = list.length + (list.length === 1 ? " item" : " items");
      results.innerHTML = "";
      results.appendChild(list.length
        ? grid(list)
        : emptyState("Nothing matches these filters yet. Try a wider date range or another platform."));
    }

    range.addEventListener("change", update);
    sort.addEventListener("change", update);
    platform.addEventListener("change", update);
    update();

    return [
      el("div", { class: "toolbar", role: "group", "aria-label": "Filter results" }, [
        initial.hidePlatform ? null : el("label", null, ["Platform", platform]),
        el("label", null, ["Date", range]),
        el("label", null, ["Sort by", sort]),
        count
      ]),
      results
    ];
  }

  function platformChips() {
    return el("div", { class: "cat-row" }, PLATFORMS.map(function (p) {
      return el("a", {
        class: "cat-chip pill-" + p.slug,
        href: "#/platform/" + p.slug,
        text: p.label + " (" + countPlatform(p.slug) + ")"
      });
    }));
  }

  function renderStaticPage(key) {
    var page = PAGES[key];
    var nodes = [el("h1", { text: page.title })];
    page.body.forEach(function (section) {
      nodes.push(el("h2", { text: section.h }));
      section.p.forEach(function (text) { nodes.push(el("p", { text: text })); });
      if (section.contact) {
        nodes.push(contactLine(section.contact));
      }
    });
    return el("section", { class: "page" }, nodes);
  }

  function contactLine(type) {
    var href = "#/contact" + (type ? "?type=" + encodeURIComponent(type) : "");
    return el("p", { class: "notice" }, [
      el("a", { href: href, text: type === "Takedown request" ? "Send a takedown request →" : "Use our contact form →" })
    ]);
  }

  // ---------- views ----------

  function lastUpdatedText() {
    var latest = "";
    [state.yt].concat(FEEDS.map(function (f) { return state.feeds[f]; }), [state.searches]).forEach(function (d) {
      if (d && d.updated && d.updated > latest) latest = d.updated;
    });
    var parts = ["Trends checked " + (latest ? timeAgo(latest) : "soon")];
    if (state.updated) parts.push("featured picks updated " + fmtDate(state.updated));
    return parts.join(" · ");
  }

  // Top items by trend score, at most `perPlatform` from each platform so one site can't fill the list.
  function mixedHot(limit, perPlatform) {
    var counts = {}, out = [];
    sortItems(publishedItems().filter(function (i) { return hotScore(i) >= 0; }), "hot").forEach(function (i) {
      var p = platformOf(i);
      if (out.length < limit && (counts[p] || 0) < perPlatform) {
        out.push(i);
        counts[p] = (counts[p] || 0) + 1;
      }
    });
    return out;
  }

  function fromSource(source, sort, limit) {
    return sortItems(publishedItems().filter(function (i) { return i.source === source; }), sort).slice(0, limit);
  }

  function sectionHead(title, href, linkText) {
    return el("div", { class: "section-head" }, [
      el("h2", { text: title }),
      href ? el("a", { href: href, text: linkText || "See all →" }) : null
    ]);
  }

  function googleSearchUrl(q) {
    return "https://www.google.com/search?q=" + encodeURIComponent(q);
  }

  function searchChips(limit) {
    var items = (state.searches && state.searches.items) || [];
    return el("div", { class: "search-chips" }, items.slice(0, limit).map(function (s) {
      return el("a", { class: "search-chip", href: googleSearchUrl(s.query), target: "_blank", rel: "noopener noreferrer" }, [
        el("span", { class: "q", text: s.query }),
        s.traffic ? el("span", { class: "traffic", text: s.traffic + " searches" }) : null
      ]);
    }));
  }

  function viewHome() {
    var featured = sortItems(publishedItems().filter(function (i) { return !i.auto; }), "date");
    var hot = mixedHot(8, 2);
    var searches = (state.searches && state.searches.items) || [];
    var live = fromSource("twitch", "hot", 3);
    var songs = fromSource("music", "hot", 4);
    var watch = sortItems(publishedItems().filter(function (i) {
      return !i.auto && i.video && i.video.platform !== "youtube";
    }), "date");
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: cfg.name || "Trendwharf" }),
        el("p", { class: "lead", text: cfg.tagline || "" }),
        el("p", { class: "muted", text: lastUpdatedText() })
      ]),
      hot.length ? el("section", null, [
        sectionHead("🔥 Hot right now", "#/hot"),
        el("p", { class: "muted", text: "The fastest-rising items across YouTube, Reddit, Twitch, the music charts and more. Press play to watch or listen here." }),
        grid(hot)
      ]) : null,
      searches.length ? el("section", null, [
        sectionHead("🔎 What people are searching", "#/searches"),
        el("p", { class: "muted", text: "Rising searches on Google right now (" + (state.searches.country || "US") + ")." }),
        searchChips(12)
      ]) : null,
      live.length ? el("section", null, [
        sectionHead("🔴 Live on Twitch", "#/platform/twitch"),
        grid(live)
      ]) : null,
      songs.length ? el("section", null, [
        sectionHead("🎵 Top songs", "#/platform/music"),
        grid(songs)
      ]) : null,
      watch.length ? el("section", null, [
        el("h2", { text: "Watch from TikTok, Instagram and X" }),
        grid(watch.slice(0, 6))
      ]) : null,
      el("section", null, [
        el("h2", { text: "Featured trends" }),
        featured.length ? grid(featured.slice(0, 6)) : emptyState("No featured trends yet. Check back soon.")
      ]),
      el("section", null, [
        el("h2", { text: "Browse by platform" }),
        platformChips()
      ]),
      el("section", null, [
        el("h2", { text: "Browse by category" }),
        el("div", { class: "cat-row" }, CATEGORIES.map(function (c) {
          return el("a", {
            class: "cat-chip",
            href: "#/category/" + c.slug,
            text: c.label + " (" + countIn(c.slug) + ")"
          });
        }))
      ]),
      featured.length ? el("section", null, [
        el("h2", { text: "Latest featured updates" }),
        el("ul", { class: "latest-list" }, featured.slice(0, 10).map(function (item) {
          return el("li", null, [
            el("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", text: item.title }),
            el("span", { class: "muted", text: fmtDate(item.dateFound) + " · " + item.platform })
          ]);
        }))
      ]) : null
    ];
  }

  function viewCategory(slug) {
    var cat = CATEGORIES.filter(function (c) { return c.slug === slug; })[0];
    if (!cat) return viewNotFound();
    var base = publishedItems().filter(function (i) { return i.category === slug; });
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: cat.label }),
        el("p", { class: "lead", text: cat.desc })
      ])
    ].concat(filterableList(base, { sort: "hot" }));
  }

  function viewPlatform(slug, params) {
    var p = PLATFORMS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return viewNotFound();
    var base = publishedItems().filter(function (i) { return platformOf(i) === slug; });
    var ranked = base.some(function (i) { return hotScore(i) >= 0; });
    var nodes = [
      el("section", { class: "hero" }, [
        el("h1", { text: p.label }),
        el("p", { class: "lead", text: p.desc })
      ]),
      platformChips()
    ];
    if (!base.length && FEEDS.concat(["youtube"]).indexOf(slug) !== -1) {
      nodes.push(emptyState("Nothing here yet. This section fills in automatically once its connection is switched on."));
      return nodes;
    }
    return nodes.concat(filterableList(base, { sort: params.get("sort") || (ranked ? "hot" : "date"), platform: slug, hidePlatform: true }));
  }

  function viewHot() {
    var base = publishedItems().filter(function (i) { return hotScore(i) >= 0 || getEmbed(i); });
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: "🔥 Hot right now" }),
        el("p", { class: "lead", text: "Everything rising fastest, from every platform. Each item is scored 0–100 against others from the same platform — by views per hour on YouTube, upvotes per hour on Reddit, live viewers on Twitch, chart position for songs, and reads on Wikipedia." })
      ])
    ].concat(filterableList(base, { sort: "hot" }));
  }

  function viewSearches() {
    var s = state.searches;
    var items = (s && s.items) || [];
    var nodes = [el("section", { class: "hero" }, [
      el("h1", { text: "🔎 What people are searching" }),
      el("p", { class: "lead", text: "Searches rising fastest on Google" + (s ? " in " + s.country + ", checked " + timeAgo(s.updated) : "") + ". Numbers are Google's rough estimates." })
    ])];
    if (!items.length) {
      nodes.push(emptyState("Search trends will appear here after the next hourly update."));
      return nodes;
    }
    nodes.push(el("ol", { class: "search-list" }, items.map(function (q) {
      return el("li", null, [
        el("div", { class: "search-row" }, [
          el("a", { class: "q", href: googleSearchUrl(q.query), target: "_blank", rel: "noopener noreferrer", text: q.query }),
          el("span", { class: "traffic" }, [q.traffic ? q.traffic + " searches" : "", q.publishedAt ? " · started " + timeAgo(q.publishedAt) : ""])
        ]),
        q.news && q.news.length ? el("ul", { class: "news-links" }, q.news.map(function (n) {
          return el("li", null, [
            el("a", { href: n.url, target: "_blank", rel: "noopener noreferrer", text: n.title }),
            n.source ? el("span", { class: "muted", text: " — " + n.source }) : null
          ]);
        })) : null
      ]);
    })));
    return nodes;
  }

  function viewSearch(q, params) {
    var base = publishedItems().filter(function (i) { return matchesQuery(i, q); });
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: q ? "Results for “" + q + "”" : "Search" }),
        el("p", { class: "lead", text: q ? "Trends that match your search." : "Type something in the search box above." })
      ])
    ].concat(q ? filterableList(base, { range: params.get("range"), sort: params.get("sort") }) : []);
  }

  function viewSuggest() {
    var nodes = [
      el("h1", { text: "Suggest a trend or source" }),
      el("p", { class: "lead", text: "Know something we should cover? Tell us what it is and where to find it." })
    ];
    if (cfg.suggestEndpoint) {
      nodes.push(suggestForm());
    } else {
      nodes.push(el("div", { class: "notice", text: "The suggestion form is coming soon." }));
    }
    return [el("section", { class: "page" }, nodes)];
  }

  function field(labelText, control, hint) {
    return el("div", { class: "field" }, [
      el("label", { for: control.id, text: labelText }),
      control,
      hint ? el("p", { class: "hint", text: hint }) : null
    ]);
  }

  // Shared submit handling for the on-site forms. validate() returns
  // [fieldToFocus, message] when something is wrong, or null when it's fine.
  function wireForm(form, button, status, honey, buttonText, validate, buildPayload, okMessage) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var problem = validate();
      if (problem) {
        status.textContent = problem[1];
        status.className = "form-status error";
        problem[0].focus();
        return;
      }
      if (honey.value) return; // spam bot filled the hidden field

      button.disabled = true;
      button.textContent = "Sending…";
      status.textContent = "";
      status.className = "form-status";

      var body = buildPayload();
      body._template = "table";
      body._captcha = "false";

      fetch(cfg.suggestEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          var success = res.ok && (res.d.success === true || res.d.success === "true");
          if (!success) throw new Error(res.d.message || "failed");
          form.reset();
          status.textContent = okMessage;
          status.className = "form-status ok";
        })
        .catch(function () {
          status.textContent = "Sorry, it didn't send. Please try again in a minute.";
          status.className = "form-status error";
        })
        .then(function () {
          button.disabled = false;
          button.textContent = buttonText;
        });
    });
  }

  var CONTACT_TYPES = ["Correction", "Takedown request", "Question", "Other"];

  function contactForm(preset) {
    var type = el("select", { id: "c-type", name: "Type", required: true },
      [el("option", { value: "", text: "Choose one" })].concat(CONTACT_TYPES.map(function (t) {
        return el("option", { value: t, text: t });
      })));
    if (preset) type.value = preset;
    var message = el("textarea", { id: "c-message", name: "Message", rows: 5, required: true, maxlength: 2000,
      placeholder: "Tell us what you'd like us to fix, remove or answer." });
    var link = el("input", { id: "c-link", name: "Link", type: "url", maxlength: 500, placeholder: "https://…" });
    var reply = el("input", { id: "c-email", name: "email", type: "email", maxlength: 200, placeholder: "you@example.com", autocomplete: "email" });
    var honey = el("input", { type: "text", name: "_honey", tabindex: "-1", autocomplete: "off", class: "hp", "aria-hidden": "true" });
    var status = el("p", { class: "form-status", role: "status", "aria-live": "polite" });
    var button = el("button", { type: "submit", class: "button", text: "Send message" });

    var form = el("form", { class: "suggest-form", novalidate: true }, [
      field("What is this about? *", type),
      field("Message *", message),
      field("Link to the item (optional)", link, "For corrections and takedowns, paste the item's original source link."),
      field("Your email (optional)", reply, "Only if you want a reply. Takedown requests usually need one so we can confirm."),
      honey,
      button,
      status
    ]);

    wireForm(form, button, status, honey, "Send message", function () {
      if (!type.value) return [type, "Please choose what this is about."];
      if (!message.value.trim()) return [message, "Please write a message."];
      if (link.value && !link.checkValidity()) return [link, "That link doesn't look right. It should start with https://"];
      if (reply.value && !reply.checkValidity()) return [reply, "That email address doesn't look right."];
      return null;
    }, function () {
      var body = {
        Type: type.value,
        Message: message.value.trim(),
        Link: link.value.trim() || "(none)",
        _subject: (cfg.name || "Site") + " " + type.value.toLowerCase() + ": " + message.value.trim().slice(0, 50)
      };
      // FormSubmit sets Reply-To from a field named "email".
      if (reply.value.trim()) body.email = reply.value.trim();
      else body["Reply email"] = "(not given)";
      return body;
    }, "Thanks! Your message was sent.");

    return form;
  }

  function viewContact(params) {
    var preset = params.get("type");
    if (CONTACT_TYPES.indexOf(preset) === -1) preset = "";
    return [el("section", { class: "page" }, [
      el("h1", { text: "Contact us" }),
      el("p", { class: "lead", text: "Spotted a mistake, want something removed, or have a question? Send us a message." }),
      contactForm(preset),
      el("p", { class: "muted", text: "Want to suggest a new trend instead? Use the suggestion form." }),
      el("p", null, [el("a", { href: "#/suggest", text: "Go to the suggestion form →" })])
    ])];
  }

  function suggestForm() {
    var what = el("input", { id: "s-what", name: "Suggestion", type: "text", required: true, maxlength: 200,
      placeholder: "e.g. a new dance trend, a game update, a viral song" });
    var link = el("input", { id: "s-link", name: "Link", type: "url", maxlength: 500, placeholder: "https://…" });
    var category = el("select", { id: "s-category", name: "Category", required: true },
      [el("option", { value: "", text: "Choose a category" })].concat(CATEGORIES.map(function (c) {
        return el("option", { value: c.label, text: c.label });
      })));
    var why = el("textarea", { id: "s-why", name: "Why", rows: 4, maxlength: 1000,
      placeholder: "Where did you see it? Why is it worth covering?" });
    // Hidden trap field: real people leave it empty, spam bots fill it in.
    var honey = el("input", { type: "text", name: "_honey", tabindex: "-1", autocomplete: "off", class: "hp", "aria-hidden": "true" });
    var status = el("p", { class: "form-status", role: "status", "aria-live": "polite" });
    var button = el("button", { type: "submit", class: "button", text: "Send suggestion" });

    var form = el("form", { class: "suggest-form", novalidate: true }, [
      field("What should we cover? *", what),
      field("Link (optional)", link, "A link to the post, video, song or article."),
      field("Category *", category),
      field("Why should we add it? (optional)", why),
      honey,
      el("p", { class: "hint", text: "Please don't include personal details. We read every suggestion but can't reply to each one." }),
      button,
      status
    ]);

    wireForm(form, button, status, honey, "Send suggestion", function fail() {
      if (!what.value.trim()) return [what, "Please tell us what we should cover."];
      if (!category.value) return [category, "Please choose a category."];
      if (link.value && !link.checkValidity()) return [link, "That link doesn't look right. It should start with https://"];
      return null;
    }, function payload() {
      return {
        Suggestion: what.value.trim(),
        Link: link.value.trim() || "(none)",
        Category: category.value,
        Why: why.value.trim() || "(not given)",
        _subject: "New " + (cfg.name || "site") + " suggestion: " + what.value.trim().slice(0, 60)
      };
    }, "Thanks! Your suggestion was sent.");

    return form;
  }

  function viewNotFound() {
    return [el("section", { class: "page" }, [
      el("h1", { text: "Page not found" }),
      el("p", { text: "The page you were looking for does not exist." }),
      el("p", null, [el("a", { href: "#/", text: "Go to the home page" })])
    ])];
  }

  function viewStatus() {
    var msg = state.error
      ? "Could not load trends. Please refresh the page in a moment."
      : "Loading trends…";
    return [el("p", { class: "muted", text: msg })];
  }

  // ---------- routing ----------

  function setActiveNav(path) {
    document.querySelectorAll(".nav a").forEach(function (a) {
      if (a.getAttribute("href") === "#" + path) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    var raw = (location.hash || "#/").replace(/^#/, "");
    var parts = raw.split("?");
    var path = parts[0] || "/";
    var params = new URLSearchParams(parts[1] || "");
    var segs = path.split("/").filter(Boolean);
    var nodes;
    var title = cfg.name || "Trend Hub";

    if (!state.loaded || state.error) {
      nodes = viewStatus();
    } else if (segs.length === 0) {
      nodes = viewHome();
    } else if (segs[0] === "category" && segs[1]) {
      nodes = viewCategory(segs[1]);
      var c = CATEGORIES.filter(function (x) { return x.slug === segs[1]; })[0];
      if (c) title = c.label + " · " + title;
    } else if (segs[0] === "platform" && segs[1]) {
      nodes = viewPlatform(segs[1], params);
      title = platformLabel(segs[1]) + " · " + title;
    } else if (segs[0] === "hot") {
      nodes = viewHot();
      title = "Hot right now · " + title;
    } else if (segs[0] === "searches") {
      nodes = viewSearches();
      title = "Searches · " + title;
    } else if (segs[0] === "search") {
      var q = (params.get("q") || "").trim();
      nodes = viewSearch(q, params);
      if (q) title = "“" + q + "” · " + title;
    } else if (segs[0] === "contact") {
      nodes = viewContact(params);
      title = "Contact · " + title;
    } else if (segs[0] === "suggest") {
      nodes = viewSuggest();
      title = "Suggest · " + title;
    } else if (PAGES[segs[0]]) {
      nodes = [renderStaticPage(segs[0])];
      title = PAGES[segs[0]].title + " · " + title;
    } else {
      nodes = viewNotFound();
    }

    view.innerHTML = "";
    nodes.forEach(function (n) { if (n) view.appendChild(n); });
    document.title = title;
    setActiveNav(segs.length ? "/" + segs.join("/") : "/");
    syncSearchBox(path, params);
    window.scrollTo(0, 0);
  }

  function syncSearchBox(path, params) {
    var input = document.getElementById("search-input");
    input.value = path === "/search" ? (params.get("q") || "") : "";
  }

  // ---------- setup ----------

  function initFooter() {
    document.getElementById("year").textContent = String(new Date().getFullYear());
    document.getElementById("footer-name").textContent = cfg.name || "Trend Hub";
  }

  function initSearch() {
    document.getElementById("search-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = document.getElementById("search-input").value.trim();
      location.hash = q ? "#/search?q=" + encodeURIComponent(q) : "#/search";
    });
  }

  function initAnalytics() {
    if (cfg.analyticsSnippet) {
      var wrap = document.createElement("div");
      wrap.innerHTML = cfg.analyticsSnippet;
      Array.prototype.forEach.call(wrap.childNodes, function (node) {
        if (node.tagName === "SCRIPT") {
          var s = document.createElement("script");
          if (node.src) s.src = node.src;
          s.textContent = node.textContent;
          document.head.appendChild(s);
        }
      });
    }
  }

  initFooter();
  initSearch();
  initAnalytics();
  window.addEventListener("hashchange", route);

  function getJSON(path, optional) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) {
        if (optional) return null;
        throw new Error("HTTP " + r.status);
      }
      return r.json();
    }).catch(function (err) {
      if (optional) return null;
      throw err;
    });
  }

  Promise.all([
    getJSON("data/items.json", false),
    getJSON("data/youtube.json", true),   // written by the hourly GitHub job
    getJSON("data/blocked.json", true),   // things you never want shown
    getJSON("data/searches.json", true),
    getJSON("data/oembed.json", true)
  ].concat(FEEDS.map(function (f) { return getJSON("data/" + f + ".json", true); })))
    .then(function (res) {
      var data = res[0] || {};
      state.yt = res[1] && res[1].videos ? res[1] : null;
      state.blocked = res[2] || {};
      state.searches = res[3] && res[3].items ? res[3] : null;
      state.oembed = res[4] || {};
      FEEDS.forEach(function (f, i) { state.feeds[f] = res[5 + i]; });
      if (state.searches) {
        var bq = (state.blocked.searches || []).map(function (b) { return String(b).toLowerCase(); });
        state.searches.items = state.searches.items.filter(function (q) { return bq.indexOf(q.query.toLowerCase()) === -1; });
      }
      state.updated = data.updated || "";
      state.items = addTrendScores(enrich((data.items || []).concat(youtubeTrendingItems(), feedItems())));
      state.loaded = true;
      route();
    })
    .catch(function (err) {
      if (window.console) console.error("Trendwharf failed to load:", err);
      state.error = true;
      state.loaded = true;
      route();
    });
})();
