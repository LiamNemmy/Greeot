const SESSION_KEY = "griot_admin_session_v1";

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginStatus = document.getElementById("loginStatus");
const logoutBtn = document.getElementById("logoutBtn");
const cmsPanel = document.getElementById("cmsPanel");

const articleForm = document.getElementById("articleForm");
const articleId = document.getElementById("articleId");
const articleSlug = document.getElementById("articleSlug");
const articleTitle = document.getElementById("articleTitle");
const articleSubtitle = document.getElementById("articleSubtitle");
const articleSummary = document.getElementById("articleSummary");
const articleBody = document.getElementById("articleBody");
const articleType = document.getElementById("articleType");
const articleCategories = document.getElementById("articleCategories");
const articleTags = document.getElementById("articleTags");
const categoryPicker = document.getElementById("categoryPicker");
const tagPicker = document.getElementById("tagPicker");
const creatorName = document.getElementById("creatorName");
const creatorRole = document.getElementById("creatorRole");
const articleImageUrl = document.getElementById("articleImageUrl");
const articleImageAlt = document.getElementById("articleImageAlt");
const articleWeight = document.getElementById("articleWeight");
const articlePublishedAt = document.getElementById("articlePublishedAt");
const articleStatus = document.getElementById("articleStatus");
const articleFeatured = document.getElementById("articleFeatured");
const articlePinned = document.getElementById("articlePinned");

const newArticleBtn = document.getElementById("newArticleBtn");
const submitReviewBtn = document.getElementById("submitReviewBtn");
const approveBtn = document.getElementById("approveBtn");
const publishBtn = document.getElementById("publishBtn");
const unpublishBtn = document.getElementById("unpublishBtn");
const refreshArticlesBtn = document.getElementById("refreshArticlesBtn");
const refreshForumBtn = document.getElementById("refreshForumBtn");
const refreshAuditBtn = document.getElementById("refreshAuditBtn");

const articleList = document.getElementById("articleList");
const forumList = document.getElementById("forumList");
const auditList = document.getElementById("auditList");

let session = null;
let articles = [];
let forumPosts = [];
let auditLogs = [];

const DEFAULT_CATEGORIES = ["Africa", "World", "Power", "Economy", "Tech", "Culture", "Opinion"];
const DEFAULT_TAGS = ["Front Page", "Desk", "Trending", "Investigation", "Frequency", "Op-Ed"];

function setStatus(message, isError = false) {
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? "var(--red)" : "var(--dim)";
}

function saveSession(nextSession) {
  session = nextSession;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.access_token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toCommaList(value) {
  if (!Array.isArray(value)) return "";
  return value.join(", ");
}

function splitCommaInput(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function collectTaxonomyOptions(fieldName, fallbackValues) {
  const seen = new Map();
  fallbackValues.forEach((value) => {
    const normalized = normalizeToken(value);
    if (!normalized) return;
    if (!seen.has(normalized)) seen.set(normalized, String(value).trim());
  });
  articles.forEach((article) => {
    const values = Array.isArray(article[fieldName]) ? article[fieldName] : [];
    values.forEach((value) => {
      const normalized = normalizeToken(value);
      if (!normalized) return;
      if (!seen.has(normalized)) seen.set(normalized, String(value).trim());
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

function toggleCommaToken(inputEl, token) {
  const values = splitCommaInput(inputEl.value);
  const normalizedToken = normalizeToken(token);
  const index = values.findIndex((value) => normalizeToken(value) === normalizedToken);
  if (index >= 0) values.splice(index, 1);
  else values.push(token);
  inputEl.value = values.join(", ");
}

function renderTaxonomyPicker(targetEl, inputEl, options) {
  if (!targetEl || !inputEl) return;
  const selected = new Set(splitCommaInput(inputEl.value).map(normalizeToken));
  targetEl.innerHTML = options
    .map((option) => {
      const activeClass = selected.has(normalizeToken(option)) ? " active" : "";
      return `<button type="button" class="tax-pill${activeClass}" data-tax-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
    })
    .join("");
}

function renderTaxonomyPickers() {
  renderTaxonomyPicker(categoryPicker, articleCategories, collectTaxonomyOptions("categories", DEFAULT_CATEGORIES));
  renderTaxonomyPicker(tagPicker, articleTags, collectTaxonomyOptions("tags", DEFAULT_TAGS));
}

function statusTagClass(status) {
  if (status === "published") return "published";
  if (status === "approved") return "approved";
  if (status === "in_review") return "in_review";
  return "draft";
}

function currentArticlePayload() {
  const creators = [];
  if (creatorName.value.trim()) {
    creators.push({
      name: creatorName.value.trim(),
      role: creatorRole.value.trim() || "Writer"
    });
  }
  return {
    slug: articleSlug.value.trim(),
    title: articleTitle.value.trim(),
    subtitle: articleSubtitle.value.trim(),
    summary: articleSummary.value.trim(),
    full_content: articleBody.value.trim(),
    type: articleType.value,
    categories: articleCategories.value,
    tags: articleTags.value,
    creators,
    image_url: articleImageUrl.value.trim(),
    image_alt: articleImageAlt.value.trim(),
    editorial_weight: Number(articleWeight.value || 0),
    published_at: articlePublishedAt.value.trim(),
    status: articleStatus.value,
    featured: articleFeatured.checked,
    pinned: articlePinned.checked
  };
}

function resetArticleForm() {
  articleId.value = "";
  articleForm.reset();
  articleType.value = "article";
  articleStatus.value = "draft";
  articleWeight.value = "50";
  articleFeatured.checked = false;
  articlePinned.checked = false;
  renderTaxonomyPickers();
}

function hydrateArticleForm(article) {
  articleId.value = article.id || "";
  articleSlug.value = article.slug || "";
  articleTitle.value = article.title || "";
  articleSubtitle.value = article.subtitle || "";
  articleSummary.value = article.summary || "";
  articleBody.value = article.full_content || "";
  articleType.value = article.type || "article";
  articleCategories.value = toCommaList(article.categories);
  articleTags.value = toCommaList(article.tags);
  creatorName.value = article.creators && article.creators[0] ? article.creators[0].name || "" : "";
  creatorRole.value = article.creators && article.creators[0] ? article.creators[0].role || "" : "";
  articleImageUrl.value = article.image_url || "";
  articleImageAlt.value = article.image_alt || "";
  articleWeight.value = String(article.editorial_weight || 0);
  articlePublishedAt.value = article.published_at || "";
  articleStatus.value = article.status || "draft";
  articleFeatured.checked = !!article.featured;
  articlePinned.checked = !!article.pinned;
  renderTaxonomyPickers();
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (session && session.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload && payload.error ? payload.error : `${response.status} ${response.statusText}`);
  }
  return payload;
}

function renderArticles() {
  if (!articles.length) {
    articleList.innerHTML = '<div class="status">No articles yet.</div>';
    return;
  }
  articleList.innerHTML = articles
    .map((article) => {
      const statusClass = statusTagClass(article.status);
      return `<div class="item" data-article-id="${article.id}">
        <h4>${article.title || "(untitled)"} <span class="tag ${statusClass}">${article.status}</span></h4>
        <div class="meta">${article.slug} · weight ${article.editorial_weight || 0}</div>
        <div class="item-actions">
          <button type="button" data-action="edit" data-id="${article.id}">Edit</button>
          <button type="button" class="btn-warn" data-action="submit-review" data-id="${article.id}">Submit review</button>
          <button type="button" class="btn-muted" data-action="approve" data-id="${article.id}">Approve</button>
          <button type="button" class="btn-warn" data-action="publish" data-id="${article.id}">Publish</button>
          <button type="button" class="btn-muted" data-action="unpublish" data-id="${article.id}">Move to draft</button>
        </div>
      </div>`;
    })
    .join("");
}

function renderForum() {
  if (!forumPosts.length) {
    forumList.innerHTML = '<div class="status">No forum posts found.</div>';
    return;
  }
  forumList.innerHTML = forumPosts
    .map((post) => {
      const hiddenTag = post.is_hidden ? '<span class="tag hidden">hidden</span>' : "";
      return `<div class="item">
        <h4>${post.title} ${hiddenTag}</h4>
        <div class="meta">${post.handle} · ${post.votes} votes · ${post.article_key || "no article link"}</div>
        <div class="item-actions">
          <button type="button" class="${post.is_hidden ? "btn-muted" : "btn-danger"}" data-action="${
            post.is_hidden ? "unhide" : "hide"
          }" data-id="${post.id}">
            ${post.is_hidden ? "Unhide" : "Hide"}
          </button>
        </div>
      </div>`;
    })
    .join("");
}

function renderAudit() {
  if (!auditLogs.length) {
    auditList.innerHTML = '<div class="status">No audit events yet.</div>';
    return;
  }
  auditList.innerHTML = auditLogs
    .map((row) => {
      const details = row.details && typeof row.details === "object" ? JSON.stringify(row.details) : "{}";
      return `<div class="item audit">
        <div><b>${row.action}</b> on ${row.entity_type}:${row.entity_id}</div>
        <div class="meta">${row.created_at || ""} · ${row.actor_email || "system"} (${row.actor_role || "n/a"})</div>
        <div>${details}</div>
      </div>`;
    })
    .join("");
}

async function loadAdminData() {
  const [articlesPayload, forumPayload, auditPayload] = await Promise.all([
    api("/api/admin/articles"),
    api("/api/admin/forum/posts"),
    api("/api/admin/audit-logs?limit=120")
  ]);
  articles = articlesPayload.items || [];
  forumPosts = forumPayload.items || [];
  auditLogs = auditPayload.items || [];
  renderArticles();
  renderForum();
  renderAudit();
  renderTaxonomyPickers();
}

async function refreshSessionUser() {
  const me = await api("/api/admin/me");
  session.user = me.user;
  saveSession(session);
}

function setAuthenticatedUi(isAuthenticated) {
  cmsPanel.classList.toggle("hidden", !isAuthenticated);
  logoutBtn.classList.toggle("hidden", !isAuthenticated);
  loginEmail.disabled = isAuthenticated;
  loginPassword.disabled = isAuthenticated;
}

async function login(email, password) {
  const payload = await api("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {}
  });
  saveSession(payload);
  await refreshSessionUser();
}

async function changePublicationState(id, action) {
  const endpointMap = {
    "submit-review": "submit-review",
    approve: "approve",
    publish: "publish",
    unpublish: "unpublish"
  };
  const endpoint = endpointMap[action];
  if (!endpoint) {
    throw new Error("Unsupported transition action.");
  }
  const payload = await api(`/api/admin/articles/${id}/${endpoint}`, { method: "POST", body: "{}" });
  const idx = articles.findIndex((item) => item.id === payload.item.id);
  if (idx >= 0) articles[idx] = payload.item;
  renderArticles();
  if (articleId.value === payload.item.id) hydrateArticleForm(payload.item);
}

loginForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  setStatus("Signing in...");
  try {
    await login(loginEmail.value.trim().toLowerCase(), loginPassword.value);
    setAuthenticatedUi(true);
    setStatus(`Signed in as ${session.user.email} (${session.user.role})`);
    loginPassword.value = "";
    await loadAdminData();
  } catch (error) {
    setStatus(error.message || "Sign-in failed.", true);
  }
});

logoutBtn.addEventListener("click", () => {
  saveSession(null);
  setAuthenticatedUi(false);
  articles = [];
  forumPosts = [];
  auditLogs = [];
  articleList.innerHTML = "";
  forumList.innerHTML = "";
  auditList.innerHTML = "";
  resetArticleForm();
  renderTaxonomyPickers();
  setStatus("Signed out.");
});

articleForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const payload = currentArticlePayload();
  const id = articleId.value.trim();
  try {
    let result;
    if (id) {
      result = await api(`/api/admin/articles/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      const idx = articles.findIndex((item) => item.id === result.item.id);
      if (idx >= 0) articles[idx] = result.item;
    } else {
      result = await api("/api/admin/articles", { method: "POST", body: JSON.stringify(payload) });
      articles.unshift(result.item);
    }
    hydrateArticleForm(result.item);
    renderArticles();
    await loadAuditOnly();
    setStatus("Article saved.");
  } catch (error) {
    setStatus(error.message || "Failed to save article.", true);
  }
});

newArticleBtn.addEventListener("click", () => {
  resetArticleForm();
  setStatus("New draft form ready.");
});

async function transitionCurrent(action, successMsg) {
  const id = articleId.value.trim();
  if (!id) {
    setStatus("Select or save an article first.", true);
    return;
  }
  try {
    await changePublicationState(id, action);
    await loadAuditOnly();
    setStatus(successMsg);
  } catch (error) {
    setStatus(error.message || "Failed to transition article.", true);
  }
}

submitReviewBtn.addEventListener("click", () => transitionCurrent("submit-review", "Article sent for review."));
approveBtn.addEventListener("click", () => transitionCurrent("approve", "Article approved."));
publishBtn.addEventListener("click", () => transitionCurrent("publish", "Article published."));
unpublishBtn.addEventListener("click", () => transitionCurrent("unpublish", "Article moved to draft."));

articleList.addEventListener("click", async (ev) => {
  const button = ev.target.closest("button[data-action]");
  if (!button) return;
  const id = button.getAttribute("data-id");
  const action = button.getAttribute("data-action");
  if (!id || !action) return;

  if (action === "edit") {
    const article = articles.find((item) => item.id === id);
    if (article) {
      hydrateArticleForm(article);
      setStatus(`Editing ${article.slug}`);
    }
    return;
  }
  try {
    await changePublicationState(id, action);
    await loadAuditOnly();
    setStatus(`Article transition "${action}" applied.`);
  } catch (error) {
    setStatus(error.message || "Failed to transition article.", true);
  }
});

forumList.addEventListener("click", async (ev) => {
  const button = ev.target.closest("button[data-action]");
  if (!button) return;
  const id = button.getAttribute("data-id");
  const action = button.getAttribute("data-action");
  if (!id || !action) return;
  const endpoint = action === "hide" ? "hide" : "unhide";
  try {
    const payload = await api(`/api/admin/forum/posts/${id}/${endpoint}`, { method: "POST", body: "{}" });
    const idx = forumPosts.findIndex((item) => String(item.id) === String(payload.item.id));
    if (idx >= 0) forumPosts[idx] = payload.item;
    renderForum();
    await loadAuditOnly();
    setStatus(`Forum post ${endpoint}d.`);
  } catch (error) {
    setStatus(error.message || "Failed to moderate forum post.", true);
  }
});

async function loadAuditOnly() {
  const payload = await api("/api/admin/audit-logs?limit=120");
  auditLogs = payload.items || [];
  renderAudit();
}

refreshArticlesBtn.addEventListener("click", async () => {
  try {
    const payload = await api("/api/admin/articles");
    articles = payload.items || [];
    renderArticles();
    setStatus("Article list refreshed.");
  } catch (error) {
    setStatus(error.message || "Failed to refresh articles.", true);
  }
});

refreshForumBtn.addEventListener("click", async () => {
  try {
    const payload = await api("/api/admin/forum/posts");
    forumPosts = payload.items || [];
    renderForum();
    setStatus("Forum list refreshed.");
  } catch (error) {
    setStatus(error.message || "Failed to refresh forum.", true);
  }
});

refreshAuditBtn.addEventListener("click", async () => {
  try {
    await loadAuditOnly();
    setStatus("Audit logs refreshed.");
  } catch (error) {
    setStatus(error.message || "Failed to refresh audit logs.", true);
  }
});

if (categoryPicker) {
  categoryPicker.addEventListener("click", (ev) => {
    const button = ev.target.closest("button[data-tax-value]");
    if (!button) return;
    const value = button.getAttribute("data-tax-value");
    if (!value) return;
    toggleCommaToken(articleCategories, value);
    renderTaxonomyPickers();
  });
}

if (tagPicker) {
  tagPicker.addEventListener("click", (ev) => {
    const button = ev.target.closest("button[data-tax-value]");
    if (!button) return;
    const value = button.getAttribute("data-tax-value");
    if (!value) return;
    toggleCommaToken(articleTags, value);
    renderTaxonomyPickers();
  });
}

articleCategories.addEventListener("input", renderTaxonomyPickers);
articleTags.addEventListener("input", renderTaxonomyPickers);

(async function boot() {
  resetArticleForm();
  renderTaxonomyPickers();
  const existing = loadSession();
  if (!existing) {
    setAuthenticatedUi(false);
    return;
  }

  saveSession(existing);
  try {
    await refreshSessionUser();
    setAuthenticatedUi(true);
    loginEmail.value = session.user.email || "";
    setStatus(`Signed in as ${session.user.email} (${session.user.role})`);
    await loadAdminData();
  } catch {
    saveSession(null);
    setAuthenticatedUi(false);
    setStatus("Session expired. Please sign in again.", true);
  }
})();
