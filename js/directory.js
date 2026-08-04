import { GRIOT_CONFIG } from "./griot-config.js";
import { ArticleService } from "./article-service.js";

const service = new ArticleService({
  apiBaseUrl: GRIOT_CONFIG.API_BASE_URL,
  supabaseUrl: GRIOT_CONFIG.SUPABASE_URL,
  supabaseAnonKey: GRIOT_CONFIG.SUPABASE_ANON_KEY,
  localFeedUrl: GRIOT_CONFIG.LOCAL_FEED_URL
});

const metaEl = document.getElementById("directoryMeta");
const listEl = document.getElementById("directoryList");
const emptyEl = document.getElementById("directoryEmpty");
const searchEl = document.getElementById("directorySearch");

let allItems = [];

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "No publish date";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "No publish date";
  return parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function toSearchText(item) {
  return [
    item.title,
    item.subtitle,
    item.summary,
    ...(Array.isArray(item.categories) ? item.categories : []),
    ...(Array.isArray(item.tags) ? item.tags : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function render(items) {
  if (!items.length) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = items
    .map((item) => {
      const chips = (item.categories && item.categories.length ? item.categories : ["Dispatch"])
        .slice(0, 2)
        .map((name) => `<span class="chip">${esc(name)}</span>`)
        .join(" ");
      const hasImage = !!item.image_url;
      const bgImage = hasImage
        ? '<img class="card-bg-img" src="' +
          esc(item.image_url) +
          '" alt="' +
          esc(item.image_alt || item.title || "Dispatch image") +
          '" loading="lazy">'
        : "";
      return (
        '<article class="card' +
        (hasImage ? " has-image" : "") +
        '">' +
        bgImage +
        '<div class="card-content">' +
        "<h2>" +
        esc(item.title || "Untitled dispatch") +
        "</h2>" +
        "<p>" +
        esc(item.summary || item.subtitle || "No summary available.") +
        "</p>" +
        '<div class="row">Published: ' +
        esc(fmtDate(item.published_at)) +
        "</div>" +
        chips +
        "</div>" +
        "</article>"
      );
    })
    .join("");
}

function applyFilter() {
  const needle = String(searchEl.value || "").trim().toLowerCase();
  if (!needle) {
    render(allItems);
    return;
  }
  render(allItems.filter((item) => toSearchText(item).includes(needle)));
}

async function boot() {
  try {
    const feed = await service.listArticles();
    allItems = Array.isArray(feed.items) ? feed.items : [];
    metaEl.textContent = `Loaded ${allItems.length} published dispatches (${feed.mode}).`;
    render(allItems);
  } catch (error) {
    metaEl.textContent = "Directory unavailable right now.";
    listEl.innerHTML =
      '<article class="card"><h2>Feed error</h2><p>' +
      esc(error && error.message ? error.message : "Unknown error") +
      "</p></article>";
    emptyEl.hidden = true;
  }
}

searchEl.addEventListener("input", applyFilter);
boot();
