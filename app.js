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
          "Send corrections, suggestions, and takedown requests to the address below. Include the item link and what you would like us to change."
        ], contact: true }
      ]
    },
    privacy: {
      title: "Privacy",
      body: [
        { h: "What we collect", p: [
          "We do not ask for accounts. If you use the suggestion form or email us, we receive the details you send. Analytics, if turned on, measure page visits in aggregate."
        ]},
        { h: "What we do with it", p: [
          "We use this information only to respond to you and to improve the site. We do not sell personal data."
        ]},
        { h: "Your choices", p: [
          "You can ask us to delete anything you sent us by contacting the address below."
        ], contact: true }
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
        ], contact: true },
        { h: "Changes", p: [
          "We may update these terms. Continued use of the site means you accept the current version."
        ]}
      ]
    }
  };

  var state = { items: [], updated: "", loaded: false, error: false };
  var view = document.getElementById("view");

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

  function sortItems(list, mode) {
    var copy = list.slice();
    if (mode === "title") {
      copy.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else {
      copy.sort(function (a, b) { return b.dateFound.localeCompare(a.dateFound); });
    }
    return copy;
  }

  function filterByRange(list, range) {
    var r = DATE_RANGES[range];
    if (!r || r.maxAge === null) return list;
    return list.filter(function (i) { return daysAgo(i.dateFound) <= r.maxAge; });
  }

  function matchesQuery(item, q) {
    var hay = [item.title, item.summary, item.platform, (item.tags || []).join(" ")]
      .join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (word) {
      return hay.indexOf(word) !== -1;
    });
  }

  // ---------- components ----------

  function itemCard(item) {
    var cat = CATEGORIES.filter(function (c) { return c.slug === item.category; })[0];
    return el("article", { class: "card" }, [
      el("div", { class: "card-meta" }, [
        el("span", { class: "badge", text: cat ? cat.label : item.category }),
        el("span", { class: "muted", text: item.platform })
      ]),
      el("h3", { text: item.title }),
      el("p", { text: item.summary }),
      el("div", { class: "tags" }, (item.tags || []).map(function (t) {
        return el("span", { class: "tag", text: t });
      })),
      el("div", { class: "card-foot" }, [
        el("time", { datetime: item.dateFound, text: fmtDate(item.dateFound) }),
        el("a", {
          class: "source-link",
          href: item.url,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "Original source ↗"
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
  function filterableList(baseList, initial) {
    var range = el("select", { id: "f-range" }, Object.keys(DATE_RANGES).map(function (k) {
      return el("option", { value: k, text: DATE_RANGES[k].label });
    }));
    var sort = el("select", { id: "f-sort" }, [
      el("option", { value: "date", text: "Newest first" }),
      el("option", { value: "title", text: "Title A–Z" })
    ]);
    range.value = initial.range || "all";
    sort.value = initial.sort || "date";

    var count = el("span", { class: "count", "aria-live": "polite" });
    var results = el("div", { class: "results" });

    function update() {
      var list = sortItems(filterByRange(baseList, range.value), sort.value);
      count.textContent = list.length + (list.length === 1 ? " item" : " items");
      results.innerHTML = "";
      results.appendChild(list.length
        ? grid(list)
        : emptyState("Nothing matches these filters yet. Try a wider date range."));
    }

    range.addEventListener("change", update);
    sort.addEventListener("change", update);
    update();

    return [
      el("div", { class: "toolbar", role: "group", "aria-label": "Filter results" }, [
        el("label", null, ["Date", range]),
        el("label", null, ["Sort by", sort]),
        count
      ]),
      results
    ];
  }

  function renderStaticPage(key) {
    var page = PAGES[key];
    var nodes = [el("h1", { text: page.title })];
    page.body.forEach(function (section) {
      nodes.push(el("h2", { text: section.h }));
      section.p.forEach(function (text) { nodes.push(el("p", { text: text })); });
      if (section.contact) {
        nodes.push(contactLine());
      }
    });
    return el("section", { class: "page" }, nodes);
  }

  function contactLine() {
    var email = cfg.contactEmail || "";
    if (!email || email === "you@example.com") {
      return el("p", { class: "notice", text: "Contact email is not set up yet. Add it in config.js." });
    }
    return el("p", { class: "notice" }, [
      "Email: ",
      el("a", { href: "mailto:" + email + "?subject=Trend%20Hub%20request", text: email })
    ]);
  }

  // ---------- views ----------

  function viewHome() {
    var list = sortItems(publishedItems(), "date");
    return [
      el("section", { class: "hero" }, [
        el("h1", { text: cfg.name || "Trend Hub" }),
        el("p", { class: "lead", text: cfg.tagline || "" }),
        el("p", { class: "muted", text: "Last updated: " + (state.updated ? fmtDate(state.updated) : "unknown") })
      ]),
      el("section", null, [
        el("h2", { text: "Trending now" }),
        list.length ? grid(list.slice(0, 6)) : emptyState("No trends published yet. Check back soon.")
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
      nodes.push(el("div", { class: "notice", text: "The suggestion form is coming soon. In the meantime, send suggestions by email." }));
      nodes.push(contactLine());
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

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = "form-status";
      if (!what.value.trim() || !category.value) {
        status.textContent = "Please fill in what we should cover and choose a category.";
        status.className = "form-status error";
        (what.value.trim() ? category : what).focus();
        return;
      }
      if (link.value && !link.checkValidity()) {
        status.textContent = "That link doesn't look right. It should start with https://";
        status.className = "form-status error";
        link.focus();
        return;
      }
      if (honey.value) return; // bot

      button.disabled = true;
      button.textContent = "Sending…";
      status.textContent = "";

      fetch(cfg.suggestEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          Suggestion: what.value.trim(),
          Link: link.value.trim() || "(none)",
          Category: category.value,
          Why: why.value.trim() || "(not given)",
          _subject: "New " + (cfg.name || "site") + " suggestion: " + what.value.trim().slice(0, 60),
          _template: "table",
          _captcha: "false"
        })
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          var success = res.ok && (res.d.success === true || res.d.success === "true");
          if (!success) throw new Error(res.d.message || "failed");
          form.reset();
          status.textContent = "Thanks! Your suggestion was sent.";
          status.className = "form-status ok";
        })
        .catch(function () {
          status.textContent = "Sorry, it didn't send. Please try again in a minute.";
          status.className = "form-status error";
        })
        .then(function () {
          button.disabled = false;
          button.textContent = "Send suggestion";
        });
    });

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
    } else if (segs[0] === "search") {
      var q = (params.get("q") || "").trim();
      nodes = viewSearch(q, params);
      if (q) title = "“" + q + "” · " + title;
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
    nodes.forEach(function (n) { view.appendChild(n); });
    document.title = title;
    setActiveNav(segs.length ? "/" + segs.join("/") : "/");
    syncSearchBox(path, params);
    window.scrollTo(0, 0);
  }

  function syncSearchBox(path, params) {
    var input = document.getElementById("search-input");
    if (path === "/search") input.value = params.get("q") || "";
  }

  // ---------- setup ----------

  function initFooter() {
    document.getElementById("year").textContent = String(new Date().getFullYear());
    document.getElementById("footer-name").textContent = cfg.name || "Trend Hub";
    var contact = document.getElementById("footer-contact");
    if (cfg.contactEmail && cfg.contactEmail !== "you@example.com") {
      contact.setAttribute("href", "mailto:" + cfg.contactEmail + "?subject=Trend%20Hub%20contact");
    }
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

  fetch("data/items.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.items = data.items || [];
      state.updated = data.updated || "";
      state.loaded = true;
      route();
    })
    .catch(function () {
      state.error = true;
      state.loaded = true;
      route();
    });
})();
