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
        { h: "How items are chosen", p: [
          "We use a fixed list of approved sources and categories. Items are added on a schedule and reviewed by a person before they appear here."
        ]},
        { h: "How AI is used", p: [
          "AI helps find items and draft short summaries. A reviewer checks each summary before publishing. Mistakes happen, so tell us when you see one."
        ]},
        { h: "We do not host copies", p: [
          "We do not re-upload videos, songs, or articles. If you are a creator or rights holder and want an item removed, we will act on a valid request."
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
    { slug: "web",       label: "Articles",  desc: "News stories, blog posts and trend reports." }
  ];

  // YouTube's category IDs mapped to our categories.
  var YT_CATEGORY_MAP = { "20": "games", "10": "music", "25": "news", "23": "memes" };

  var state = { items: [], updated: "", yt: null, blocked: {}, loaded: false, error: false };
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
    return item.video ? item.video.platform : "web";
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

  function hotScore(item) { return item.stats ? (item.stats.viewsPerHour || 0) : -1; }
  function viewCount(item) { return item.stats ? (item.stats.views || 0) : -1; }

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
      copy.video = parseVideo(item.videoUrl || item.url);
      if (copy.video && copy.video.platform === "youtube" && state.yt && state.yt.videos) {
        var s = state.yt.videos[copy.video.id];
        if (s) {
          copy.stats = s;
          if (!copy.thumbnail) copy.thumbnail = s.thumbnail;
        }
      }
      if (copy.video && copy.video.platform === "youtube" && !copy.thumbnail) {
        copy.thumbnail = "https://i.ytimg.com/vi/" + copy.video.id + "/hqdefault.jpg";
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
      item.stats ? item.stats.channel : ""].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (word) {
      return hay.indexOf(word) !== -1;
    });
  }

  // ---------- components ----------

  // Builds the real player. Only called after someone clicks Play,
  // so pages stay fast and no platform loads until it's needed.
  function playerFrame(video) {
    var src, title = platformLabel(video.platform) + " video player";
    if (video.platform === "youtube") {
      src = "https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&rel=0&playsinline=1";
    } else if (video.platform === "tiktok") {
      src = "https://www.tiktok.com/player/v1/" + video.id + "?autoplay=1&rel=0";
    } else if (video.platform === "instagram") {
      src = "https://www.instagram.com/" + video.kind + "/" + video.id + "/embed/";
    } else if (video.platform === "x") {
      src = "https://platform.twitter.com/embed/Tweet.html?id=" + video.id + "&dnt=true";
    }
    return el("iframe", {
      src: src,
      title: title,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write",
      allowfullscreen: true,
      loading: "lazy",
      referrerpolicy: "strict-origin-when-cross-origin"
    });
  }

  function videoBox(item) {
    var v = item.video;
    var box = el("div", { class: "player player-" + v.platform + (v.vertical ? " vertical" : "") });
    var label = "Play: " + item.title;
    var cover = el("button", { type: "button", class: "player-cover", "aria-label": label }, [
      el("span", { class: "player-brand", text: platformLabel(v.platform) }),
      item.thumbnail
        ? el("img", { src: item.thumbnail, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer",
            onerror: function () { this.remove(); } })
        : null,
      el("span", { class: "play-icon", "aria-hidden": "true" }),
      item.stats && item.stats.durationSec
        ? el("span", { class: "duration", text: fmtDuration(item.stats.durationSec) })
        : null
    ]);
    cover.addEventListener("click", function () {
      box.innerHTML = "";
      box.classList.add("playing");
      box.appendChild(playerFrame(v));
    });
    box.appendChild(cover);
    return box;
  }

  function statsRow(item) {
    var s = item.stats;
    if (s) {
      return el("div", { class: "stats" }, [
        el("span", { title: "Views" }, ["👁 ", fmtNum(s.views)]),
        s.likes !== null && s.likes !== undefined ? el("span", { title: "Likes" }, ["👍 ", fmtNum(s.likes)]) : null,
        s.comments !== null && s.comments !== undefined ? el("span", { title: "Comments" }, ["💬 ", fmtNum(s.comments)]) : null,
        s.publishedAt ? el("span", { title: "Uploaded" }, ["⏱ ", timeAgo(s.publishedAt)]) : null,
        s.viewsPerHour
          ? el("span", { class: "hot", title: "Trend score: how fast views are growing" }, ["🔥 ", fmtNum(Math.round(s.viewsPerHour)), " views/hr"])
          : null
      ]);
    }
    if (item.video) {
      return el("p", { class: "stats muted", text: "View counts aren't shared by " + platformLabel(item.video.platform) + "." });
    }
    return null;
  }

  function itemCard(item) {
    var cat = CATEGORIES.filter(function (c) { return c.slug === item.category; })[0];
    var platform = platformOf(item);
    return el("article", { class: "card" + (item.video ? " video-card" : "") }, [
      item.video ? videoBox(item) : null,
      el("div", { class: "card-meta" }, [
        el("span", { class: "badge", text: cat ? cat.label : item.category }),
        el("span", { class: "pill pill-" + platform, text: item.video ? platformLabel(platform) : item.platform }),
        item.stats && item.stats.channel ? el("span", { class: "muted", text: item.stats.channel }) : null
      ]),
      el("h3", { text: item.title }),
      statsRow(item),
      el("p", { text: item.summary }),
      el("div", { class: "tags" }, (item.tags || []).map(function (t) {
        return el("span", { class: "tag", text: t });
      })),
      el("div", { class: "card-foot" }, [
        el("time", { datetime: item.dateFound, text: (item.auto ? "Trending " : "") + fmtDate(item.dateFound) }),
        el("a", {
          class: "source-link",
          href: item.url,
          target: "_blank",
          rel: "noopener noreferrer",
          text: item.video ? "Watch on " + platformLabel(platform) + " ↗" : "Original source ↗"
        })
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
    var parts = ["Last updated: " + (state.updated ? fmtDate(state.updated) : "unknown")];
    if (state.yt && state.yt.updated) parts.push("YouTube stats " + timeAgo(state.yt.updated));
    return parts.join(" · ");
  }

  function hotVideos() {
    return sortItems(publishedItems().filter(function (i) { return i.stats && i.stats.viewsPerHour; }), "hot");
  }

  function viewHome() {
    var list = sortItems(publishedItems(), "date");
    var hot = hotVideos();
    var watch = sortItems(publishedItems().filter(function (i) { return i.video && !i.stats; }), "date");
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: cfg.name || "Trend Hub" }),
        el("p", { class: "lead", text: cfg.tagline || "" }),
        el("p", { class: "muted", text: lastUpdatedText() })
      ]),
      hot.length ? el("section", null, [
        el("div", { class: "section-head" }, [
          el("h2", { text: "🔥 Hot right now" }),
          el("a", { href: "#/hot", text: "See all →" })
        ]),
        el("p", { class: "muted", text: "Ranked by how fast views are growing. Press play to watch here." }),
        grid(hot.slice(0, 6))
      ]) : null,
      watch.length ? el("section", null, [
        el("h2", { text: "Watch from TikTok, Instagram and X" }),
        grid(watch.slice(0, 6))
      ]) : null,
      el("section", null, [
        el("h2", { text: "Trending now" }),
        list.length ? grid(list.slice(0, 6)) : emptyState("No trends published yet. Check back soon.")
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
      el("section", null, [
        el("h2", { text: "Latest updates" }),
        el("ul", { class: "latest-list" }, list.slice(0, 10).map(function (item) {
          return el("li", null, [
            el("a", { href: item.url, target: "_blank", rel: "noopener noreferrer", text: item.title }),
            el("span", { class: "muted", text: fmtDate(item.dateFound) + " · " + item.platform })
          ]);
        }))
      ])
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
    ].concat(filterableList(base, {}));
  }

  function viewPlatform(slug, params) {
    var p = PLATFORMS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return viewNotFound();
    var base = publishedItems().filter(function (i) { return platformOf(i) === slug; });
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: p.label }),
        el("p", { class: "lead", text: p.desc })
      ]),
      platformChips()
    ].concat(filterableList(base, { sort: params.get("sort") || (slug === "youtube" ? "hot" : "date"), platform: slug, hidePlatform: true }));
  }

  function viewHot() {
    var base = publishedItems().filter(function (i) { return i.video; });
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: "🔥 Hot videos" }),
        el("p", { class: "lead", text: "Videos you can play right here. YouTube videos are ranked by how fast their views are growing; other platforms follow, newest first." })
      ])
    ].concat(filterableList(base, { sort: "hot" }));
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
      title = "Hot videos · " + title;
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
    getJSON("data/youtube.json", true),   // filled in by the scheduled GitHub job
    getJSON("data/blocked.json", true)    // videos you never want shown
  ])
    .then(function (res) {
      var data = res[0] || {};
      state.yt = res[1] && res[1].videos ? res[1] : null;
      state.blocked = res[2] || {};
      state.updated = data.updated || "";
      state.items = enrich((data.items || []).concat(youtubeTrendingItems()));
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
