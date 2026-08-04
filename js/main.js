import { GRIOT_CONFIG } from "./griot-config.js";
import { ArticleService } from "./article-service.js";

"use strict";

const articleService = new ArticleService({
  apiBaseUrl: GRIOT_CONFIG.API_BASE_URL,
  localFeedUrl: GRIOT_CONFIG.LOCAL_FEED_URL,
  supabaseUrl: GRIOT_CONFIG.SUPABASE_URL,
  supabaseAnonKey: GRIOT_CONFIG.SUPABASE_ANON_KEY
});
const API_BASE_URL = GRIOT_CONFIG.API_BASE_URL || "";

function apiUrl(path) {
  if (!API_BASE_URL) return path;
  return `${String(API_BASE_URL).replace(/\/+$/, "")}${path}`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
  } catch {
    return "";
  }
}

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function hasTag(it, slug) {
  return (it.tag_slugs || []).indexOf(slug) !== -1;
}

function searchHay(it) {
  return [it.title, it.summary, it.subtitle, (it.tags || []).join(" "), (it.categories || []).join(" ")]
    .filter(Boolean)
    .join(" ");
}

function bylineHTML(creators) {
  if (!creators || !creators.length) return "<b>THE DESK</b>";
  const lead = "<b>" + esc((creators[0].name || "Unknown").toUpperCase()) + "</b>";
  const rest = creators
    .slice(1)
    .map(function (creator) {
      const label = creator.role === "Photographer" ? "PHOTOS " : "";
      return label + esc((creator.name || "").toUpperCase());
    })
    .filter(Boolean)
    .join(" · ");
  return lead + (rest ? ' <i style="font-style:normal">// ' + rest + "</i>" : "");
}

const CHIP_BY_SLUG = { africa: "m", tech: "c", culture: "a", economy: "g", power: "r", world: "c", opinion: "m" };

function chipClass(slug) {
  return CHIP_BY_SLUG[slug] || "c";
}

function articleKey(it) {
  return it.slug || it.id || "";
}

function articleCardAttrs(it) {
  const id = articleKey(it);
  if (!id) return "";
  return (
    ' data-article-id="' +
    esc(id) +
    '" role="button" tabindex="0" aria-label="' +
    esc("Open dispatch: " + (it.title || "Untitled")) +
    '"'
  );
}

const ARROW_SVG =
  '<svg width="70" height="26" viewBox="0 0 70 26" fill="none"><path d="M4 2 C 30 6, 48 10, 60 22 M60 22 l-9 -2 M60 22 l1 -9" stroke="#d8ff3e" stroke-width="2.5" stroke-linecap="round"/></svg>';

function imgHTML(it, alt) {
  if (!it.image_url) return '<div class="ph ph-empty"></div>';
  return '<div class="ph"><img src="' + esc(it.image_url) + '" alt="' + esc(it.image_alt || alt) + '"></div>';
}

function heroHTML(it) {
  const cat = (it.categories[0] || "Front Page").toUpperCase();
  const stick = hasTag(it, "investigation")
    ? '<span class="sticker" style="top:16px;left:14px">EXCLUSIVE INVESTIGATION</span>'
    : '<span class="sticker" style="top:16px;left:14px">FEATURED</span>';
  return (
    '<article class="card hero searchable interactive-article" data-cat="' +
    esc(it.category_slugs[0] || "") +
    '" data-title="' +
    esc(searchHay(it)) +
    '"' +
    articleCardAttrs(it) +
    ">" +
    imgHTML(it, it.title) +
    stick +
    '<div class="scribble">the wire never sleeps.' +
    ARROW_SVG +
    "</div>" +
    '<div class="hero-body"><span class="chip ' +
    chipClass(it.category_slugs[0]) +
    '">' +
    esc(cat) +
    "</span>" +
    "<h2>" +
    esc(it.title) +
    "</h2>" +
    (it.summary ? "<p>" + esc(it.summary) + "</p>" : "") +
    "<div class=\"meta\">BY " +
    bylineHTML(it.creators) +
    " · " +
    fmtDate(it.published_at) +
    '</div><button class="card-read" type="button">READ DISPATCH →</button>' +
    "</div></article>"
  );
}

function duoHTML(it) {
  const cat = (it.categories[0] || "Wire").toUpperCase();
  return (
    '<article class="card searchable interactive-article" data-cat="' +
    esc(it.category_slugs[0] || "") +
    '" data-title="' +
    esc(searchHay(it)) +
    '"' +
    articleCardAttrs(it) +
    ">" +
    imgHTML(it, it.title) +
    '<div class="body"><span class="chip ' +
    chipClass(it.category_slugs[0]) +
    '">' +
    esc(cat) +
    "</span>" +
    "<h3>" +
    esc(it.title) +
    "</h3>" +
    (it.summary ? "<p>" + esc(it.summary) + "</p>" : "") +
    '<div class="meta" style="margin-top:10px">BY ' +
    bylineHTML(it.creators) +
    " · " +
    fmtDate(it.published_at) +
    '</div><button class="card-read" type="button">READ DISPATCH →</button>' +
    "</div></article>"
  );
}

function deskHTML(it) {
  const cat = (it.categories[0] || "Desk").toUpperCase();
  return (
    '<article class="card searchable interactive-article" data-cat="' +
    esc(it.category_slugs[0] || "") +
    '" data-title="' +
    esc(searchHay(it)) +
    '"' +
    articleCardAttrs(it) +
    ">" +
    imgHTML(it, it.title) +
    '<div class="body"><span class="chip ' +
    chipClass(it.category_slugs[0]) +
    '">' +
    esc(cat) +
    "</span>" +
    "<h3>" +
    esc(it.title) +
    "</h3>" +
    (it.summary ? "<p>" + esc(it.summary) + "</p>" : "") +
    "<div class=\"meta\">DESK BRIEF · BY " +
    bylineHTML(it.creators) +
    " · " +
    fmtDate(it.published_at) +
    '</div><button class="card-read" type="button">READ DISPATCH →</button>' +
    "</div></article>"
  );
}

function opinionHTML(it) {
  const who = it.creators[0] && it.creators[0].name ? it.creators[0].name.toUpperCase() : "THE DESK";
  return (
    '<article class="opinion searchable interactive-article" data-cat="' +
    esc(it.category_slugs[0] || "") +
    '" data-title="' +
    esc(searchHay(it)) +
    '"' +
    articleCardAttrs(it) +
    ">" +
    '<span class="sticker" style="top:-14px;right:20px;background:var(--magenta);color:#000">OP-ED</span>' +
    '<div class="q">"' +
    esc(it.summary || it.title) +
    '"</div>' +
    '<div class="who">— ' +
    esc(who) +
    '<br><span style="color:var(--cyan)">' +
    esc(it.subtitle || "") +
    '</span><br><button class="card-read" type="button">READ DISPATCH →</button></div>' +
    "</article>"
  );
}

function zineHTML(it) {
  return (
    '<article class="zine searchable interactive-article" data-cat="' +
    esc(it.category_slugs[0] || "") +
    '" data-title="' +
    esc(searchHay(it)) +
    '"' +
    articleCardAttrs(it) +
    ">" +
    "<span class=\"zk\">" +
    esc(it.subtitle || "FREQUENCY") +
    "</span>" +
    (it.image_url
      ? '<div class="ph"><img src="' + esc(it.image_url) + '" alt="' + esc(it.image_alt || it.title) + '"></div>'
      : "") +
    '<div class="zt">' +
    esc(it.title) +
    "</div>" +
    (it.summary ? "<p>" + esc(it.summary) + "</p>" : "") +
    '<button class="card-read" type="button">READ DISPATCH →</button>' +
    '<div class="zm">→ printed nowhere, read everywhere</div>' +
    "</article>"
  );
}

function trendHTML(items) {
  let html = "";
  items.forEach(function (it, i) {
    const id = articleKey(it);
    html +=
      '<div class="trend-item' +
      (id ? " interactive-article" : "") +
      '"' +
      (id ? articleCardAttrs(it) : "") +
      '><div class="trend-num">' +
      pad2(i + 1) +
      '</div><div style="min-width:0"><div class="tt">' +
      esc(it.title) +
      '</div><div class="meta">' +
      esc(it.subtitle || "WIRE") +
      "</div></div></div>";
  });
  return html;
}

const slotHero = document.getElementById("slotHero");
const slotDuo = document.getElementById("slotDuo");
const slotAnalysis = document.getElementById("slotAnalysis");
const slotOpinion = document.getElementById("slotOpinion");
const slotZine = document.getElementById("slotZine");
const slotTrending = document.getElementById("slotTrending");
const analysisHead = document.getElementById("analysis");
const cultureHead = document.getElementById("culture");
const feedStatus = document.getElementById("feedStatus");

const readerOverlay = document.getElementById("readerOverlay");
const readerClose = document.getElementById("readerClose");
const readerKicker = document.getElementById("readerKicker");
const readerTitle = document.getElementById("readerTitle");
const readerSubtitle = document.getElementById("readerSubtitle");
const readerMedia = document.getElementById("readerMedia");
const readerMeta = document.getElementById("readerMeta");
const readerBody = document.getElementById("readerBody");

let articleLookup = Object.create(null);

function setStatus(mode, count) {
  feedStatus.classList.remove("ok", "warn", "bad", "wait");
  if (mode === "api") {
    feedStatus.classList.add("ok");
    feedStatus.innerHTML = '<i class="led"></i>FEED ▸ API LIVE · ' + count + " ITEMS";
  } else if (mode === "live") {
    feedStatus.classList.add("ok");
    feedStatus.innerHTML = '<i class="led"></i>FEED ▸ SUPABASE LIVE · ' + count + " ITEMS";
  } else if (mode === "local") {
    feedStatus.classList.add("warn");
    feedStatus.innerHTML = '<i class="led"></i>FEED ▸ LOCAL WIRE · SET GRIOT_CONFIG KEYS TO GO LIVE';
  } else if (mode === "fallback") {
    feedStatus.classList.add("bad");
    feedStatus.innerHTML = '<i class="led"></i>FEED ▸ SUPABASE UNREACHABLE · SERVING LOCAL WIRE';
  } else {
    feedStatus.classList.add("wait");
    feedStatus.innerHTML = '<i class="led"></i>FEED ▸ PRINTING…';
  }
}

function showSkeletons() {
  slotHero.innerHTML = '<div class="skel" style="height:clamp(360px,58vw,480px)"></div>';
  slotDuo.innerHTML = '<div class="skel" style="aspect-ratio:16/10"></div><div class="skel" style="aspect-ratio:16/10"></div>';
  slotAnalysis.innerHTML =
    '<div class="skel" style="aspect-ratio:3/3.4"></div><div class="skel" style="aspect-ratio:3/3.4"></div><div class="skel" style="aspect-ratio:3/3.4"></div>';
  slotOpinion.innerHTML = '<div class="skel" style="height:110px;margin-top:26px"></div>';
  slotZine.innerHTML =
    '<div class="skel" style="flex:0 0 240px;height:230px"></div><div class="skel" style="flex:0 0 240px;height:230px"></div><div class="skel" style="flex:0 0 240px;height:230px"></div>';
  slotTrending.innerHTML =
    '<div class="skel" style="height:52px;margin-bottom:10px"></div><div class="skel" style="height:52px;margin-bottom:10px"></div><div class="skel" style="height:52px;margin-bottom:10px"></div><div class="skel" style="height:52px;margin-bottom:10px"></div><div class="skel" style="height:52px"></div>';
}

function setArticleLookup(items) {
  const next = Object.create(null);
  items.forEach(function (item) {
    if (item.id) next[item.id] = item;
    if (item.slug) next[item.slug] = item;
  });
  articleLookup = next;
}

function storyParagraphs(article) {
  const raw = article.full_content ?? article.body ?? article.content;
  if (Array.isArray(raw)) {
    return raw.map(String).map((p) => p.trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  const fallback = [];
  if (article.summary) fallback.push(article.summary);
  if (article.subtitle) fallback.push(article.subtitle);
  fallback.push("Longform text is not attached to this story yet. Add content/body/full_content in your data source.");
  return fallback;
}

function openReader(articleId) {
  const article = articleLookup[articleId];
  if (!article || !readerOverlay) return;

  readerKicker.textContent = ((article.categories && article.categories[0]) || "DISPATCH").toUpperCase();
  readerTitle.textContent = article.title || "Untitled";
  readerSubtitle.textContent = article.subtitle || article.summary || "";
  readerSubtitle.classList.toggle("gone", !readerSubtitle.textContent.trim());

  if (article.image_url) {
    readerMedia.classList.remove("gone");
    readerMedia.innerHTML = '<img src="' + esc(article.image_url) + '" alt="' + esc(article.image_alt || article.title || "") + '">';
  } else {
    readerMedia.classList.add("gone");
    readerMedia.innerHTML = "";
  }

  readerMeta.innerHTML =
    "BY " + bylineHTML(article.creators) + " · " + fmtDate(article.published_at) + " · " + esc((article.type || "story").toUpperCase());

  readerBody.innerHTML = storyParagraphs(article)
    .map(function (paragraph) {
      return "<p>" + esc(paragraph) + "</p>";
    })
    .join("");

  readerOverlay.classList.remove("gone");
  readerOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeReader() {
  if (!readerOverlay || readerOverlay.classList.contains("gone")) return;
  readerOverlay.classList.add("gone");
  readerOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderFeed(items, mode) {
  const assigned = {};
  let heroItem = null;
  const duoArr = [];
  const deskArr = [];
  let opEd = null;
  const freqArr = [];
  const trendArr = [];

  function key(item) {
    return articleKey(item);
  }
  function take(item) {
    assigned[key(item)] = true;
  }

  items.forEach(function (it) {
    if (!heroItem && it.featured && it.pinned) {
      heroItem = it;
      take(it);
    }
  });

  items.forEach(function (it) {
    if (assigned[key(it)]) return;
    if (duoArr.length < 2 && hasTag(it, "front-page")) {
      duoArr.push(it);
      take(it);
      return;
    }
    if (trendArr.length < 5 && hasTag(it, "trending")) {
      trendArr.push(it);
      take(it);
      return;
    }
    if (!opEd && hasTag(it, "op-ed")) {
      opEd = it;
      take(it);
      return;
    }
    if (freqArr.length < 4 && hasTag(it, "frequency")) {
      freqArr.push(it);
      take(it);
      return;
    }
    if (deskArr.length < 3 && hasTag(it, "desk")) {
      deskArr.push(it);
      take(it);
    }
  });

  if (!heroItem && items.length) {
    let candidate = null;
    for (let i = 0; i < items.length; i += 1) {
      if (!assigned[key(items[i])]) {
        candidate = items[i];
        break;
      }
    }
    heroItem = candidate || items[0];
  }

  setArticleLookup(items);

  slotHero.innerHTML = heroItem ? heroHTML(heroItem) : "";
  slotDuo.innerHTML = duoArr.map(duoHTML).join("");
  slotAnalysis.innerHTML = deskArr.map(deskHTML).join("");
  slotOpinion.innerHTML = opEd ? opinionHTML(opEd) : "";
  slotZine.innerHTML = freqArr.map(zineHTML).join("");
  slotTrending.innerHTML = trendArr.length ? trendHTML(trendArr) : '<div class="meta">THE WIRE IS QUIET. TOO QUIET.</div>';

  analysisHead.classList.toggle("gone", deskArr.length === 0);
  slotAnalysis.classList.toggle("gone", deskArr.length === 0);
  cultureHead.classList.toggle("gone", freqArr.length === 0);
  slotZine.classList.toggle("gone", freqArr.length === 0);

  setStatus(mode, items.length);
  renderForum();
  applyFilters();
}

function renderFeedError(error) {
  setStatus("bad");
  articleLookup = Object.create(null);
  slotHero.innerHTML =
    '<article class="card"><div class="body"><span class="chip r">FEED ERROR</span><h3>THE WIRE FAILED TO PRINT</h3><p>Check your service configuration and data source.</p><div class="meta">' +
    esc(error.message) +
    "</div></div></article>";
  slotDuo.innerHTML = "";
  slotAnalysis.innerHTML = "";
  slotOpinion.innerHTML = "";
  slotZine.innerHTML = "";
  slotTrending.innerHTML = '<div class="meta">NO FEED AVAILABLE.</div>';
  analysisHead.classList.add("gone");
  slotAnalysis.classList.add("gone");
  cultureHead.classList.add("gone");
  slotZine.classList.add("gone");
  renderForum();
}

async function loadFeed() {
  showSkeletons();
  setStatus("wait");
  try {
    const feed = await articleService.listArticles();
    if (feed.remoteError && window.console) {
      console.warn("GRIOT NOIR: Supabase unreachable, serving local JSON.", feed.remoteError);
    }
    renderFeed(feed.items, feed.mode);
  } catch (error) {
    renderFeedError(error);
    if (window.console) {
      console.error("GRIOT NOIR: ArticleService failed to provide feed.", error);
    }
  }
}

function handleInteractiveCardClick(target) {
  const explicit = target.closest("[data-open-article]");
  if (explicit) {
    const articleId = explicit.getAttribute("data-open-article");
    if (articleId) openReader(articleId);
    return true;
  }

  const card = target.closest(".interactive-article");
  if (!card) return false;
  const articleId = card.getAttribute("data-article-id");
  if (!articleId) return false;
  openReader(articleId);
  return true;
}

document.addEventListener("click", function (ev) {
  if (ev.target === readerOverlay) {
    closeReader();
    return;
  }
  handleInteractiveCardClick(ev.target);
});

if (readerClose) {
  readerClose.addEventListener("click", closeReader);
}

document.addEventListener("keydown", function (ev) {
  if (ev.key === "Escape") {
    closeReader();
    return;
  }
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const active = ev.target;
  if (!active || !active.classList || !active.classList.contains("interactive-article")) return;
  ev.preventDefault();
  const articleId = active.getAttribute("data-article-id");
  if (articleId) openReader(articleId);
});

const catBtns = Array.prototype.slice.call(document.querySelectorAll(".cat-btn"));
const searchBox = document.getElementById("siteSearch");
const clearBtn = document.getElementById("clearFilter");
const noRes = document.getElementById("noResults");
let currentCat = "all";

function applyFilters() {
  const q = (searchBox.value || "").trim().toLowerCase();
  let visible = 0;
  const cards = document.querySelectorAll(".searchable");
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const hay = ((card.getAttribute("data-title") || "") + " " + (card.getAttribute("data-cat") || "")).toLowerCase();
    const okCat = currentCat === "all" || card.getAttribute("data-cat") === currentCat;
    const okQ = !q || hay.indexOf(q) !== -1;
    const show = okCat && okQ;
    card.style.display = show ? "" : "none";
    if (show) visible += 1;
  }
  noRes.classList.toggle("show", visible === 0 && cards.length > 0);
  clearBtn.classList.toggle("show", currentCat !== "all" || q !== "");
}

catBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    catBtns.forEach(function (button) {
      button.classList.remove("active");
    });
    btn.classList.add("active");
    currentCat = btn.getAttribute("data-cat");
    applyFilters();
  });
});

searchBox.addEventListener("input", applyFilters);
clearBtn.addEventListener("click", function () {
  searchBox.value = "";
  currentCat = "all";
  catBtns.forEach(function (button) {
    button.classList.remove("active");
  });
  catBtns[0].classList.add("active");
  applyFilters();
});

const WALL_KEY = "griotnoir_wall_v1";
const DEFAULT_THREADS = [
  {
    id: "t1",
    tag: "hot",
    title: "Settle it with sources: which country actually owns jollof?",
    handle: "@jollof_cartel",
    replies: 1200,
    votes: 1204,
    voted: false
  },
  {
    id: "t2",
    tag: "hot",
    title: "Is the Lagos–Calabar coastal road worth the price tag?",
    handle: "@delta_meridian",
    replies: 214,
    votes: 482,
    voted: false
  },
  {
    id: "t3",
    tag: "new",
    title: "Anyone on the ground covering the Mombasa port workers' strike?",
    handle: "@swahili_coast",
    replies: 47,
    votes: 96,
    voted: false
  },
  {
    id: "t4",
    tag: "new",
    title: "Street photo thread: neon in your city after the rain 📸",
    handle: "@shutter_ghost",
    replies: 156,
    votes: 211,
    voted: false
  },
  {
    id: "t5",
    tag: "solved",
    title: "Beginner reading list for the 1966 coups? (thanks, wall!)",
    handle: "@archive_rat",
    replies: 89,
    votes: 178,
    voted: false
  }
];

const threadList = document.getElementById("threadList");
let wallTab = "all";
const wallThreads = (function () {
  try {
    const raw = localStorage.getItem(WALL_KEY);
    if (!raw) return DEFAULT_THREADS.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_THREADS.slice();
  } catch (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Failed to load wall threads from localStorage.", error);
    }
    return DEFAULT_THREADS.slice();
  }
})();

function saveWall() {
  try {
    localStorage.setItem(WALL_KEY, JSON.stringify(wallThreads));
  } catch (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Failed to save wall threads.", error);
    }
  }
}

function fmtK(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "K" : String(n);
}

function renderWall(freshId) {
  let html = "";
  wallThreads.forEach(function (thread) {
    const visible = wallTab === "all" || thread.tag === wallTab;
    html +=
      '<div class="thread' +
      (visible ? "" : " hidden") +
      (thread.id === freshId ? " fresh" : "") +
      '" data-tag="' +
      esc(thread.tag) +
      '" data-id="' +
      esc(thread.id) +
      '">' +
      '<button class="vote' +
      (thread.voted ? " voted" : "") +
      '" aria-label="upvote"><span class="arr">▲</span><span class="vc">' +
      thread.votes +
      '</span></button><div class="t-body"><div class="t-title">' +
      esc(thread.title) +
      '</div><div class="t-meta"><span class="f-tag ' +
      esc(thread.tag) +
      '">' +
      esc(thread.tag.toUpperCase()) +
      "</span><span>" +
      esc(thread.handle) +
      "</span><span>" +
      fmtK(thread.replies) +
      " REPLIES</span></div></div></div>";
  });
  threadList.innerHTML = html;
}

threadList.addEventListener("click", function (ev) {
  const voteBtn = ev.target.closest(".vote");
  if (!voteBtn) return;
  const row = voteBtn.closest(".thread");
  const id = row ? row.getAttribute("data-id") : null;
  for (let i = 0; i < wallThreads.length; i += 1) {
    if (wallThreads[i].id === id) {
      if (wallThreads[i].voted) {
        wallThreads[i].voted = false;
        wallThreads[i].votes = Math.max(0, wallThreads[i].votes - 1);
      } else {
        wallThreads[i].voted = true;
        wallThreads[i].votes += 1;
      }
      break;
    }
  }
  saveWall();
  renderWall();
});

const tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    tabs.forEach(function (item) {
      item.classList.remove("active");
    });
    tab.classList.add("active");
    wallTab = tab.getAttribute("data-filter");
    renderWall();
  });
});

const quickPost = document.getElementById("quickpost");
const postInput = document.getElementById("postInput");
quickPost.addEventListener("submit", function (ev) {
  ev.preventDefault();
  const value = postInput.value.trim();
  if (!value) return;
  const newId = "u" + Date.now();
  wallThreads.unshift({ id: newId, tag: "new", title: value, handle: "@you", replies: 0, votes: 1, voted: true });
  postInput.value = "";
  wallTab = "all";
  tabs.forEach(function (item) {
    item.classList.remove("active");
  });
  tabs[0].classList.add("active");
  saveWall();
  renderWall(newId);
});

const FORUM_KEY = "griotnoir_dispatch_forum_v1";
const FORUM_VOTE_STATE_KEY = "griotnoir_dispatch_forum_votes_v1";
const DEFAULT_FORUM_POSTS = [
  {
    id: "fp-1",
    title: "Did the blackout economy dispatch miss any key fuel brokers?",
    handle: "@nightbureau",
    votes: 84,
    voted: false,
    article_key: "lagos-after-dark"
  },
  {
    id: "fp-2",
    title: "Mural wars: is preservation possible without gentrification?",
    handle: "@wallwriter",
    votes: 61,
    voted: false,
    article_key: "mural-wars-joburg"
  },
  {
    id: "fp-3",
    title: "Silicon Savannah layoffs: correction or collapse?",
    handle: "@stacktraceafrica",
    votes: 47,
    voted: false,
    article_key: "nairobi-silicon-savannah-villain-arc"
  }
];

const forumList = document.getElementById("forumList");
const forumPostForm = document.getElementById("forumPostForm");
const forumPostInput = document.getElementById("forumPostInput");
let forumUsesBackend = false;
let forumPosts = [];
let forumVoteState = {};

function loadForumFallback() {
  try {
    const rawPosts = localStorage.getItem(FORUM_KEY);
    const parsedPosts = rawPosts ? JSON.parse(rawPosts) : null;
    forumPosts = Array.isArray(parsedPosts) && parsedPosts.length ? parsedPosts : DEFAULT_FORUM_POSTS.slice();

    const rawVotes = localStorage.getItem(FORUM_VOTE_STATE_KEY);
    const parsedVotes = rawVotes ? JSON.parse(rawVotes) : null;
    forumVoteState = parsedVotes && typeof parsedVotes === "object" ? parsedVotes : {};
  } catch (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Failed to load local forum state.", error);
    }
    forumPosts = DEFAULT_FORUM_POSTS.slice();
    forumVoteState = {};
  }
}

function saveForumLocalState() {
  try {
    localStorage.setItem(FORUM_KEY, JSON.stringify(forumPosts));
    localStorage.setItem(FORUM_VOTE_STATE_KEY, JSON.stringify(forumVoteState));
  } catch (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Failed to save local forum state.", error);
    }
  }
}

function isForumPostVoted(post) {
  return !!forumVoteState[String(post.id)];
}

function renderForum() {
  if (!forumList) return;
  if (!forumPosts.length) {
    forumList.innerHTML = '<div class="meta">NO THREADS YET. START THE FIRST TAKE.</div>';
    return;
  }

  let html = "";
  forumPosts.forEach(function (post) {
    const openReady = !!(post.article_key && articleLookup[post.article_key]);
    const openBtn = post.article_key
      ? '<button class="forum-open" type="button" data-open-article="' +
        esc(post.article_key) +
        '"' +
        (openReady ? "" : " disabled") +
        ">OPEN DISPATCH</button>"
      : "";

    html +=
      '<div class="forum-post" data-id="' +
      esc(post.id) +
      '"><button class="forum-vote' +
      (isForumPostVoted(post) ? " voted" : "") +
      '" type="button" aria-label="upvote forum post"><span class="arr">▲</span><span>' +
      post.votes +
      '</span></button><div class="forum-post-body"><div class="forum-post-title">' +
      esc(post.title) +
      '</div><div class="forum-post-meta"><span>' +
      esc(post.handle) +
      "</span><span>" +
      fmtK(post.votes) +
      " VOTES</span>" +
      openBtn +
      "</div></div></div>";
  });
  forumList.innerHTML = html;
}

async function loadForumFromApi() {
  const response = await fetch(apiUrl("/api/forum/posts"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Forum API request failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("Forum API payload is invalid: expected { items: [] }.");
  }

  forumUsesBackend = true;
  forumPosts = payload.items;

  try {
    const rawVotes = localStorage.getItem(FORUM_VOTE_STATE_KEY);
    const parsedVotes = rawVotes ? JSON.parse(rawVotes) : null;
    forumVoteState = parsedVotes && typeof parsedVotes === "object" ? parsedVotes : {};
  } catch (error) {
    forumVoteState = {};
    if (window.console) {
      console.warn("GRIOT NOIR: Failed to load forum vote state.", error);
    }
  }
}

async function loadForum() {
  try {
    await loadForumFromApi();
  } catch (error) {
    forumUsesBackend = false;
    loadForumFallback();
    if (window.console) {
      console.warn("GRIOT NOIR: Forum API unavailable, using local fallback.", error);
    }
  }
  renderForum();
}

if (forumList) {
  forumList.addEventListener("click", async function (ev) {
    const voteBtn = ev.target.closest(".forum-vote");
    if (!voteBtn) return;
    const row = voteBtn.closest(".forum-post");
    const id = row ? String(row.getAttribute("data-id") || "") : "";
    if (!id) return;

    if (forumUsesBackend) {
      const voted = !!forumVoteState[id];
      const delta = voted ? -1 : 1;
      try {
        const response = await fetch(apiUrl(`/api/forum/posts/${id}/vote`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta })
        });
        if (!response.ok) {
          throw new Error(`Vote request failed: ${response.status} ${response.statusText}`);
        }
        const payload = await response.json();
        if (!payload || !payload.item) {
          throw new Error("Vote response payload is invalid.");
        }
        forumVoteState[id] = !voted;
        forumPosts = forumPosts.map((post) => (String(post.id) === id ? payload.item : post));
        saveForumLocalState();
        renderForum();
      } catch (error) {
        if (window.console) {
          console.warn("GRIOT NOIR: Failed to vote forum post.", error);
        }
      }
      return;
    }

    for (let i = 0; i < forumPosts.length; i += 1) {
      if (String(forumPosts[i].id) === id) {
        if (isForumPostVoted(forumPosts[i])) {
          forumVoteState[id] = false;
          forumPosts[i].votes = Math.max(0, forumPosts[i].votes - 1);
        } else {
          forumVoteState[id] = true;
          forumPosts[i].votes += 1;
        }
        break;
      }
    }
    saveForumLocalState();
    renderForum();
  });
}

if (forumPostForm) {
  forumPostForm.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const value = forumPostInput.value.trim();
    if (!value) return;

    if (forumUsesBackend) {
      try {
        const response = await fetch(apiUrl("/api/forum/posts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: value, handle: "@you" })
        });
        if (!response.ok) {
          throw new Error(`Post creation failed: ${response.status} ${response.statusText}`);
        }
        const payload = await response.json();
        if (!payload || !payload.item) {
          throw new Error("Forum create response payload is invalid.");
        }
        forumPosts.unshift(payload.item);
        forumVoteState[String(payload.item.id)] = true;
        forumPostInput.value = "";
        saveForumLocalState();
        renderForum();
      } catch (error) {
        if (window.console) {
          console.warn("GRIOT NOIR: Failed to create forum post.", error);
        }
      }
      return;
    }

    const localId = "fp-" + Date.now();
    forumPosts.unshift({ id: localId, title: value, handle: "@you", votes: 1, article_key: "" });
    forumVoteState[localId] = true;
    forumPostInput.value = "";
    saveForumLocalState();
    renderForum();
  });
}

const wireForm = document.getElementById("wireForm");
wireForm.addEventListener("submit", function (ev) {
  ev.preventDefault();
  wireForm.style.display = "none";
  document.getElementById("wireOk").style.display = "block";
});

const clockLagos = document.getElementById("clockLagos");
const clockLondon = document.getElementById("clockLdn");
const clockNewYork = document.getElementById("clockNy");

function fmtClock(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date());
  } catch {
    return "--:--";
  }
}

function tickClock() {
  clockLagos.textContent = fmtClock("Africa/Lagos");
  clockLondon.textContent = fmtClock("Europe/London");
  clockNewYork.textContent = fmtClock("America/New_York");
}

tickClock();
setInterval(tickClock, 10000);
document.getElementById("yr").textContent = new Date().getFullYear();

renderWall();
loadForum();
loadFeed();
