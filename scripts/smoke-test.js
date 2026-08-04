const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4174";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_DEV_EMAIL || "publisher@griot.local";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_DEV_PASSWORD || "change-me-now";

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const summary = [payload.error || response.statusText, payload.details].filter(Boolean).join(" | ");
    throw new Error(`${path} failed (${response.status}): ${summary}`);
  }
  return payload;
}

async function run() {
  console.log(`Smoke test base: ${BASE_URL}`);
  const health = await jsonRequest("/api/health");
  console.log(`Health OK (storage=${health.storage})`);

  const login = await jsonRequest("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  if (!login.access_token) {
    throw new Error("Login did not return an access token.");
  }

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${login.access_token}`
  };

  const me = await jsonRequest("/api/admin/me", { headers: authHeaders });
  console.log(`Authenticated as ${me.user.email} (${me.user.role})`);

  const slug = `smoke-${Date.now()}`;
  const createPayload = {
    slug,
    title: `Smoke test article ${new Date().toISOString()}`,
    subtitle: "Created by staging smoke test",
    summary: "Quick smoke test summary",
    full_content: "Smoke body paragraph one.\n\nSmoke body paragraph two.",
    type: "article",
    categories: ["Ops"],
    tags: ["Smoke"],
    creators: [{ name: "Smoke Runner", role: "Writer" }],
    editorial_weight: 1,
    featured: false,
    pinned: false
  };

  const created = await jsonRequest("/api/admin/articles", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(createPayload)
  });
  const articleId = created.item.id;
  console.log(`Article created: ${articleId}`);

  await jsonRequest(`/api/admin/articles/${articleId}/submit-review`, {
    method: "POST",
    headers: authHeaders,
    body: "{}"
  });
  console.log("Transitioned to in_review");

  await jsonRequest(`/api/admin/articles/${articleId}/approve`, {
    method: "POST",
    headers: authHeaders,
    body: "{}"
  });
  console.log("Transitioned to approved");

  await jsonRequest(`/api/admin/articles/${articleId}/publish`, {
    method: "POST",
    headers: authHeaders,
    body: "{}"
  });
  console.log("Transitioned to published");

  const publicArticles = await jsonRequest("/api/articles");
  if (!Array.isArray(publicArticles.items) || !publicArticles.items.some((item) => item.id === articleId)) {
    throw new Error("Published article not visible on public feed.");
  }
  console.log("Public feed includes published article");

  const forumCreated = await jsonRequest("/api/forum/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Smoke forum post ${Date.now()}`, handle: "@smoke" })
  });
  const forumId = forumCreated.item.id;
  console.log(`Forum post created: ${forumId}`);

  await jsonRequest(`/api/forum/posts/${forumId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 1 })
  });
  console.log("Forum vote endpoint OK");

  await jsonRequest(`/api/admin/forum/posts/${forumId}/hide`, {
    method: "POST",
    headers: authHeaders,
    body: "{}"
  });
  console.log("Forum hide endpoint OK");

  await jsonRequest(`/api/admin/forum/posts/${forumId}/unhide`, {
    method: "POST",
    headers: authHeaders,
    body: "{}"
  });
  console.log("Forum unhide endpoint OK");

  const audit = await jsonRequest("/api/admin/audit-logs?limit=20", { headers: authHeaders });
  if (!Array.isArray(audit.items) || audit.items.length === 0) {
    throw new Error("Audit log endpoint returned no events.");
  }
  console.log("Audit logs endpoint OK");

  console.log("Smoke test passed");
}

run().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exit(1);
});
