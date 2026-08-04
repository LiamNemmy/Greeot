import { GRIOT_CONFIG } from "./griot-config.js";

"use strict";

const authOverlay = document.getElementById("authOverlay");
const authCloseBtn = document.getElementById("authCloseBtn");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authModeToggleBtn = document.getElementById("authModeToggleBtn");
const authResetBtn = document.getElementById("authResetBtn");
const authMessage = document.getElementById("authMessage");

const memberAuthBtn = document.getElementById("memberAuthBtn");
const memberLogoutBtn = document.getElementById("memberLogoutBtn");
const memberChip = document.getElementById("memberChip");
const memberSavedBtn = document.getElementById("memberSavedBtn");

const savedOverlay = document.getElementById("savedOverlay");
const savedCloseBtn = document.getElementById("savedCloseBtn");
const savedMeta = document.getElementById("savedMeta");
const savedList = document.getElementById("savedList");

const readerBookmarkBtn = document.getElementById("readerBookmarkBtn");
const readerCommentsNote = document.getElementById("readerCommentsNote");
const readerCommentForm = document.getElementById("readerCommentForm");
const readerCommentInput = document.getElementById("readerCommentInput");
const readerCommentList = document.getElementById("readerCommentList");

if (
  !authOverlay ||
  !authForm ||
  !memberAuthBtn ||
  !memberSavedBtn ||
  !readerBookmarkBtn ||
  !readerCommentForm ||
  !readerCommentList
) {
  throw new Error("Member feature DOM elements are missing from index.html.");
}

const hasSupabaseConfig = !!(GRIOT_CONFIG.SUPABASE_URL && GRIOT_CONFIG.SUPABASE_ANON_KEY);
const canCreateClient = !!(window.supabase && typeof window.supabase.createClient === "function");
const memberEnabled = hasSupabaseConfig && canCreateClient;
const memberClient = memberEnabled
  ? window.supabase.createClient(GRIOT_CONFIG.SUPABASE_URL, GRIOT_CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

let authMode = "signin";
let sessionUser = null;
let currentReaderArticleKey = "";
let bookmarks = new Set();
let feedLookup = Object.create(null);

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function articleHandleFromUser(user) {
  const email = String((user && user.email) || "");
  const base = email.split("@")[0] || "reader";
  return "@" + base.replace(/[^a-zA-Z0-9_.-]+/g, "").slice(0, 32);
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function showOverlay(overlay) {
  overlay.classList.remove("gone");
  overlay.setAttribute("aria-hidden", "false");
}

function hideOverlay(overlay) {
  overlay.classList.add("gone");
  overlay.setAttribute("aria-hidden", "true");
}

function setAuthMessage(message, isError) {
  authMessage.textContent = message || "";
  authMessage.style.color = isError ? "var(--red)" : "var(--dim)";
}

function setAuthMode(nextMode) {
  authMode = nextMode === "signup" ? "signup" : "signin";
  if (authMode === "signup") {
    authTitle.textContent = "CREATE MEMBER ACCOUNT";
    authSubmitBtn.textContent = "CREATE ACCOUNT";
    authModeToggleBtn.textContent = "HAVE AN ACCOUNT? SIGN IN";
    authPassword.minLength = 8;
    return;
  }
  authTitle.textContent = "MEMBER SIGN IN";
  authSubmitBtn.textContent = "SIGN IN";
  authModeToggleBtn.textContent = "CREATE ACCOUNT";
  authPassword.minLength = 8;
}

function renderMemberControls() {
  if (!memberEnabled) {
    memberAuthBtn.textContent = "MEMBERS OFFLINE";
    memberAuthBtn.disabled = true;
    memberSavedBtn.disabled = true;
    memberLogoutBtn.classList.add("gone");
    memberChip.classList.add("gone");
    return;
  }

  memberAuthBtn.disabled = false;
  memberSavedBtn.disabled = false;
  if (!sessionUser) {
    memberAuthBtn.textContent = "SIGN IN";
    memberLogoutBtn.classList.add("gone");
    memberChip.classList.add("gone");
    return;
  }

  memberAuthBtn.textContent = "ACCOUNT";
  memberLogoutBtn.classList.remove("gone");
  memberChip.classList.remove("gone");
  memberChip.textContent = articleHandleFromUser(sessionUser);
}

function updateFeedLookup(items) {
  const next = Object.create(null);
  (items || []).forEach(function (item) {
    if (!item) return;
    if (item.id) next[String(item.id)] = item;
    if (item.slug) next[String(item.slug)] = item;
  });
  feedLookup = next;
}

function decorateFeedBookmarkButtons() {
  const cards = document.querySelectorAll(".main-col .interactive-article[data-article-id]");
  cards.forEach(function (card) {
    if (card.querySelector(".member-bookmark-btn")) return;
    const articleKey = String(card.getAttribute("data-article-id") || "");
    if (!articleKey) return;
    const readButton = card.querySelector(".card-read");
    const target = readButton && readButton.parentElement ? readButton.parentElement : card;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reader-bookmark member-bookmark-btn";
    button.setAttribute("data-bookmark-article", articleKey);
    button.textContent = "☆ SAVE";
    target.appendChild(button);
  });
}

function syncBookmarkButtons() {
  const buttons = document.querySelectorAll("[data-bookmark-article]");
  buttons.forEach(function (button) {
    const key = String(button.getAttribute("data-bookmark-article") || "");
    const isSaved = key && bookmarks.has(key);
    button.classList.toggle("saved", !!isSaved);
    if (button.id === "readerBookmarkBtn") {
      button.textContent = isSaved ? "★ SAVED DISPATCH" : "☆ SAVE DISPATCH";
      button.disabled = !memberEnabled;
      return;
    }
    button.textContent = isSaved ? "★ SAVED" : "☆ SAVE";
    button.disabled = !memberEnabled;
  });
}

function renderSavedList() {
  if (!sessionUser) {
    savedMeta.textContent = "Sign in to save and revisit dispatches.";
    savedList.innerHTML = "";
    return;
  }
  if (!bookmarks.size) {
    savedMeta.textContent = "No saved dispatches yet. Hit ☆ SAVE on any story.";
    savedList.innerHTML = "";
    return;
  }

  const rows = Array.from(bookmarks).map(function (key) {
    const item = feedLookup[key] || null;
    const title = item && item.title ? item.title : key;
    const subtitle = item && item.subtitle ? item.subtitle : "Saved from your wire session";
    const publishedAt = item && item.published_at ? fmtDateTime(item.published_at) : "";
    return (
      '<article class="reader-comment-item">' +
      '<div><b>' +
      esc(title) +
      "</b></div>" +
      '<div class="meta">' +
      esc(subtitle) +
      "</div>" +
      (publishedAt ? '<div class="meta">Published ' + esc(publishedAt) + "</div>" : "") +
      '<div style="margin-top:8px"><button class="forum-open" type="button" data-open-saved-article="' +
      esc(key) +
      '">OPEN DISPATCH</button></div></article>'
    );
  });
  savedMeta.textContent = `${bookmarks.size} saved dispatch${bookmarks.size === 1 ? "" : "es"}.`;
  savedList.innerHTML = rows.join("");
}

async function ensureMemberProfile() {
  if (!sessionUser) return;
  const payload = {
    user_id: sessionUser.id,
    display_name: articleHandleFromUser(sessionUser).slice(1)
  };
  const { error } = await memberClient.from("member_profiles").upsert(payload, { onConflict: "user_id" });
  if (error && window.console) {
    console.warn("GRIOT NOIR: Failed to upsert member profile.", error);
  }
}

async function loadBookmarks() {
  if (!sessionUser) {
    bookmarks = new Set();
    return;
  }
  const { data, error } = await memberClient.from("article_bookmarks").select("article_key");
  if (error) {
    throw new Error(`Bookmarks query failed: ${error.message}`);
  }
  bookmarks = new Set(
    (data || [])
      .map(function (row) {
        return String((row && row.article_key) || "");
      })
      .filter(Boolean)
  );
}

function updateCommentComposer() {
  if (!memberEnabled) {
    readerCommentsNote.textContent = "Member comments are unavailable until Supabase browser keys are configured.";
    readerCommentForm.classList.add("gone");
    return;
  }
  if (!sessionUser) {
    readerCommentsNote.textContent = "Sign in to join the conversation.";
    readerCommentForm.classList.add("gone");
    return;
  }
  if (!currentReaderArticleKey) {
    readerCommentsNote.textContent = "Open a dispatch to load comments.";
    readerCommentForm.classList.add("gone");
    return;
  }
  readerCommentsNote.textContent = `Commenting as ${articleHandleFromUser(sessionUser)}.`;
  readerCommentForm.classList.remove("gone");
}

function renderComments(items) {
  if (!items.length) {
    readerCommentList.innerHTML = '<div class="meta">No comments yet. Break the silence.</div>';
    return;
  }
  readerCommentList.innerHTML = items
    .map(function (comment) {
      return (
        '<article class="reader-comment-item"><div>' +
        esc(comment.body || "") +
        '</div><div class="meta">' +
        esc(comment.author_handle || "@reader") +
        " · " +
        esc(fmtDateTime(comment.created_at)) +
        "</div></article>"
      );
    })
    .join("");
}

async function loadComments(articleKey) {
  if (!articleKey) {
    readerCommentList.innerHTML = '<div class="meta">Open a dispatch to view comments.</div>';
    return;
  }
  if (!memberEnabled) {
    readerCommentList.innerHTML = '<div class="meta">Comments require Supabase browser auth configuration.</div>';
    return;
  }
  const { data, error } = await memberClient
    .from("article_comments")
    .select("id, article_key, author_handle, body, created_at, status")
    .eq("article_key", articleKey)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Comments query failed: ${error.message}`);
  }
  renderComments(data || []);
}

async function refreshMemberState() {
  renderMemberControls();
  if (!memberEnabled) {
    syncBookmarkButtons();
    updateCommentComposer();
    renderSavedList();
    return;
  }

  const { data, error } = await memberClient.auth.getSession();
  if (error) {
    throw new Error(`Session lookup failed: ${error.message}`);
  }
  sessionUser = data && data.session && data.session.user ? data.session.user : null;

  if (sessionUser) {
    await ensureMemberProfile();
    await loadBookmarks();
  } else {
    bookmarks = new Set();
  }

  renderMemberControls();
  decorateFeedBookmarkButtons();
  syncBookmarkButtons();
  updateCommentComposer();
  renderSavedList();
  if (currentReaderArticleKey) {
    await loadComments(currentReaderArticleKey);
  }
}

async function toggleBookmark(articleKey) {
  if (!memberEnabled) {
    return;
  }
  if (!sessionUser) {
    showOverlay(authOverlay);
    setAuthMessage("Sign in first to save dispatches.", false);
    return;
  }
  if (!articleKey) return;

  if (bookmarks.has(articleKey)) {
    const { error } = await memberClient.from("article_bookmarks").delete().eq("article_key", articleKey);
    if (error) throw new Error(`Unsave failed: ${error.message}`);
    bookmarks.delete(articleKey);
  } else {
    const { error } = await memberClient.from("article_bookmarks").insert({
      user_id: sessionUser.id,
      article_key: articleKey
    });
    if (error) throw new Error(`Save failed: ${error.message}`);
    bookmarks.add(articleKey);
  }

  syncBookmarkButtons();
  renderSavedList();
}

function handleAuthError(error, fallback) {
  const message = error && error.message ? error.message : fallback;
  setAuthMessage(message, true);
}

memberAuthBtn.addEventListener("click", function () {
  if (!memberEnabled) return;
  setAuthMessage("", false);
  showOverlay(authOverlay);
});

memberLogoutBtn.addEventListener("click", async function () {
  if (!memberEnabled) return;
  const { error } = await memberClient.auth.signOut();
  if (error) {
    handleAuthError(error, "Logout failed.");
    return;
  }
  sessionUser = null;
  bookmarks = new Set();
  renderMemberControls();
  syncBookmarkButtons();
  updateCommentComposer();
  renderSavedList();
});

memberSavedBtn.addEventListener("click", function () {
  if (!memberEnabled) return;
  renderSavedList();
  showOverlay(savedOverlay);
});

savedCloseBtn.addEventListener("click", function () {
  hideOverlay(savedOverlay);
});

savedOverlay.addEventListener("click", function (ev) {
  if (ev.target === savedOverlay) hideOverlay(savedOverlay);
});

savedList.addEventListener("click", function (ev) {
  const button = ev.target.closest("[data-open-saved-article]");
  if (!button) return;
  const key = String(button.getAttribute("data-open-saved-article") || "");
  if (!key) return;
  hideOverlay(savedOverlay);
  document.dispatchEvent(
    new CustomEvent("griot:open-article", {
      detail: { articleId: key }
    })
  );
});

authCloseBtn.addEventListener("click", function () {
  hideOverlay(authOverlay);
});

authOverlay.addEventListener("click", function (ev) {
  if (ev.target === authOverlay) hideOverlay(authOverlay);
});

authModeToggleBtn.addEventListener("click", function () {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
  setAuthMessage("", false);
});

authResetBtn.addEventListener("click", async function () {
  if (!memberEnabled) return;
  const email = String(authEmail.value || "").trim();
  if (!email) {
    setAuthMessage("Enter your email first, then click reset.", true);
    return;
  }
  const { error } = await memberClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) {
    handleAuthError(error, "Password reset failed.");
    return;
  }
  setAuthMessage("Password reset email sent.", false);
});

authForm.addEventListener("submit", async function (ev) {
  ev.preventDefault();
  if (!memberEnabled) return;
  const email = String(authEmail.value || "").trim().toLowerCase();
  const password = String(authPassword.value || "");
  if (!email || !password) {
    setAuthMessage("Email and password are required.", true);
    return;
  }

  if (authMode === "signup") {
    const { data, error } = await memberClient.auth.signUp({ email, password });
    if (error) {
      handleAuthError(error, "Account creation failed.");
      return;
    }
    if (data && data.session && data.user) {
      sessionUser = data.user;
      await refreshMemberState();
      hideOverlay(authOverlay);
      setAuthMessage("", false);
      return;
    }
    setAuthMessage("Account created. Check your email to confirm sign-in.", false);
    return;
  }

  const { data, error } = await memberClient.auth.signInWithPassword({ email, password });
  if (error || !data || !data.user) {
    handleAuthError(error || new Error("Sign-in failed."), "Sign-in failed.");
    return;
  }
  sessionUser = data.user;
  await refreshMemberState();
  hideOverlay(authOverlay);
  setAuthMessage("", false);
});

document.addEventListener("click", async function (ev) {
  const button = ev.target.closest("[data-bookmark-article]");
  if (!button) return;
  ev.preventDefault();
  ev.stopPropagation();
  const articleKey = String(button.getAttribute("data-bookmark-article") || "");
  try {
    await toggleBookmark(articleKey);
  } catch (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Bookmark toggle failed.", error);
    }
  }
});

document.addEventListener("griot:feed-rendered", function (ev) {
  const detail = ev && ev.detail ? ev.detail : {};
  updateFeedLookup(detail.items || []);
  decorateFeedBookmarkButtons();
  syncBookmarkButtons();
  renderSavedList();
});

document.addEventListener("griot:reader-open", async function (ev) {
  const detail = ev && ev.detail ? ev.detail : {};
  currentReaderArticleKey = String(detail.articleId || "");
  readerBookmarkBtn.setAttribute("data-bookmark-article", currentReaderArticleKey);
  syncBookmarkButtons();
  updateCommentComposer();
  try {
    await loadComments(currentReaderArticleKey);
  } catch (error) {
    readerCommentList.innerHTML = '<div class="meta">Could not load comments right now.</div>';
    if (window.console) {
      console.warn("GRIOT NOIR: Comment load failed.", error);
    }
  }
});

document.addEventListener("griot:reader-close", function () {
  currentReaderArticleKey = "";
  readerBookmarkBtn.setAttribute("data-bookmark-article", "");
  updateCommentComposer();
  readerCommentList.innerHTML = '<div class="meta">Open a dispatch to view comments.</div>';
});

readerCommentForm.addEventListener("submit", async function (ev) {
  ev.preventDefault();
  if (!memberEnabled) return;
  if (!sessionUser) {
    showOverlay(authOverlay);
    setAuthMessage("Sign in first to comment.", false);
    return;
  }
  const articleKey = String(currentReaderArticleKey || "");
  const body = String(readerCommentInput.value || "").trim();
  if (!articleKey) return;
  if (body.length < 2) return;

  const payload = {
    article_key: articleKey,
    user_id: sessionUser.id,
    author_handle: articleHandleFromUser(sessionUser),
    body,
    status: "approved"
  };
  const { error } = await memberClient.from("article_comments").insert(payload);
  if (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Comment insert failed.", error);
    }
    return;
  }
  readerCommentInput.value = "";
  try {
    await loadComments(articleKey);
  } catch (loadError) {
    if (window.console) {
      console.warn("GRIOT NOIR: Comment reload failed.", loadError);
    }
  }
});

if (memberEnabled) {
  memberClient.auth.onAuthStateChange(async function (_event, session) {
    sessionUser = session && session.user ? session.user : null;
    try {
      await refreshMemberState();
    } catch (error) {
      if (window.console) {
        console.warn("GRIOT NOIR: Auth state refresh failed.", error);
      }
    }
  });
}

setAuthMode("signin");
renderMemberControls();
decorateFeedBookmarkButtons();
syncBookmarkButtons();
updateCommentComposer();
readerCommentList.innerHTML = '<div class="meta">Open a dispatch to view comments.</div>';

(async function bootMemberFeatures() {
  if (!memberEnabled) {
    savedMeta.textContent = "Members are offline. Add SUPABASE_URL and SUPABASE_ANON_KEY in griot-config.js.";
    return;
  }
  try {
    await refreshMemberState();
  } catch (error) {
    if (window.console) {
      console.warn("GRIOT NOIR: Member bootstrap failed.", error);
    }
  }
})();
