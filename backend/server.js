const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "db");
const DB_PATH = path.join(DATA_DIR, "griot.sqlite");
const LOCAL_WIRE_PATH = path.join(ROOT_DIR, "data", "local-wire.json");

const PORT = Number(process.env.PORT || 4174);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_AUTO_SEED = process.env.SUPABASE_AUTO_SEED !== "false";

const ADMIN_DEV_EMAIL = process.env.ADMIN_DEV_EMAIL || "publisher@griot.local";
const ADMIN_DEV_PASSWORD = process.env.ADMIN_DEV_PASSWORD || "change-me-now";
const ADMIN_DEV_ROLE = process.env.ADMIN_DEV_ROLE || "admin";
const ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "dev-admin-token";

const ROLE_LEVEL = {
  writer: 10,
  editor: 20,
  publisher: 30,
  admin: 40
};

const ARTICLE_STATUSES = new Set(["draft", "in_review", "approved", "published"]);

const STATUS_TRANSITIONS = {
  draft: { in_review: "writer" },
  in_review: { approved: "editor", draft: "writer" },
  approved: { published: "publisher", draft: "editor" },
  published: { draft: "editor" }
};

const DEFAULT_FORUM_POSTS = [
  {
    title: "Did the blackout economy dispatch miss any key fuel brokers?",
    handle: "@nightbureau",
    votes: 84,
    article_key: "lagos-after-dark"
  },
  {
    title: "Mural wars: is preservation possible without gentrification?",
    handle: "@wallwriter",
    votes: 61,
    article_key: "mural-wars-joburg"
  },
  {
    title: "Silicon Savannah layoffs: correction or collapse?",
    handle: "@stacktraceafrica",
    votes: 47,
    article_key: "nairobi-silicon-savannah-villain-arc"
  }
];

function roleRank(role) {
  return ROLE_LEVEL[String(role || "").toLowerCase()] || 0;
}

function hasMinimumRole(role, minimumRole) {
  return roleRank(role) >= roleRank(minimumRole);
}

function normalizeText(value, maxLength = 5000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function coerceBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "off", ""].includes(lowered)) return false;
  }
  return fallback;
}

function normalizeHandle(rawHandle) {
  const trimmed = normalizeText(rawHandle, 80);
  if (!trimmed) return "@you";
  if (trimmed.startsWith("@")) return trimmed;
  return `@${trimmed}`;
}

function slugify(value) {
  return normalizeText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item, 120))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => normalizeText(item, 120))
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function sanitizeRichContent(value) {
  const raw = normalizeText(value, 100000);
  if (!raw) return null;
  const withoutScripts = raw.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  const withoutJsProtocols = withoutScripts.replace(/javascript:/gi, "");
  const withoutEventHandlers = withoutJsProtocols.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  return withoutEventHandlers;
}

function sanitizeMediaUrl(value) {
  const raw = normalizeText(value, 1000);
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Image URL must be a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Image URL must use http or https.");
  }
  return parsed.toString();
}

function isIsoDateString(value) {
  const raw = normalizeText(value, 64);
  if (!raw) return false;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed);
}

function buildFallbackBody(article) {
  const blocks = [];
  if (article.summary) blocks.push(article.summary);
  if (article.subtitle) blocks.push(article.subtitle);
  blocks.push("Full dispatch copy will be managed through the CMS in production.");
  return blocks.join("\n\n");
}

function readLocalWire() {
  const raw = fs.readFileSync(LOCAL_WIRE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("data/local-wire.json must be an array.");
  }
  return parsed;
}

function mapArticleRecord(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || null,
    summary: row.summary || null,
    full_content: row.full_content || null,
    type: row.type || "article",
    status: row.status || "draft",
    featured: !!row.featured,
    pinned: !!row.pinned,
    editorial_weight: Number(row.editorial_weight || 0),
    published_at: row.published_at || null,
    image_url: row.image_url || null,
    image_alt: row.image_alt || null,
    creators: coerceArray(row.creators),
    categories: coerceArray(row.categories),
    category_slugs: coerceArray(row.category_slugs),
    tags: coerceArray(row.tags),
    tag_slugs: coerceArray(row.tag_slugs),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function mapForumRecord(row) {
  return {
    id: String(row.id),
    title: row.title,
    handle: row.handle,
    votes: Number(row.votes || 0),
    article_key: row.article_key || "",
    is_hidden: !!row.is_hidden,
    created_at: row.created_at || null
  };
}

function mapAuditRecord(row) {
  return {
    id: String(row.id),
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    actor_user_id: row.actor_user_id || null,
    actor_email: row.actor_email || null,
    actor_role: row.actor_role || null,
    details: typeof row.details === "string" ? safeJsonParse(row.details, {}) : row.details || {},
    created_at: row.created_at || null
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatSupabaseError(prefix, error) {
  const message = error && error.message ? error.message : String(error || "unknown error");
  return new Error(`${prefix}: ${message}`);
}

function parseCreators(payload) {
  const raw = payload.creators;
  if (!Array.isArray(raw)) {
    const name = normalizeText(payload.creator_name, 80);
    if (!name) return [];
    return [{ name, role: normalizeText(payload.creator_role || "Writer", 60) || "Writer" }];
  }
  return raw
    .map((creator) => ({
      name: normalizeText(creator && creator.name, 80),
      role: normalizeText(creator && creator.role, 60) || "Contributor"
    }))
    .filter((creator) => creator.name)
    .slice(0, 8);
}

function parseArticleInput(payload, { requireCoreFields }) {
  const slug = slugify(payload.slug);
  const title = normalizeText(payload.title, 200);
  const subtitle = normalizeText(payload.subtitle, 280) || null;
  const summary = normalizeText(payload.summary, 2000) || null;
  const fullContent = sanitizeRichContent(payload.full_content);
  const type = normalizeText(payload.type, 40) || "article";
  const status = normalizeText(payload.status, 30).toLowerCase() || "draft";
  const featured = coerceBoolean(payload.featured, false);
  const pinned = coerceBoolean(payload.pinned, false);
  const editorialWeight = Number.isFinite(Number(payload.editorial_weight))
    ? Math.max(0, Math.min(10000, Number(payload.editorial_weight)))
    : 0;
  const imageUrl = sanitizeMediaUrl(payload.image_url);
  const imageAlt = normalizeText(payload.image_alt, 300) || null;
  const categories = toStringList(payload.categories);
  const tags = toStringList(payload.tags);
  const categorySlugs = toStringList(payload.category_slugs);
  const tagSlugs = toStringList(payload.tag_slugs);
  const creators = parseCreators(payload);
  const publishedAtRaw = normalizeText(payload.published_at, 80);
  const publishedAt = publishedAtRaw
    ? isIsoDateString(publishedAtRaw)
      ? new Date(publishedAtRaw).toISOString()
      : (() => {
          throw new Error("published_at must be a valid ISO datetime.");
        })()
    : null;

  if (requireCoreFields && (!slug || !title)) {
    throw new Error("Both slug and title are required.");
  }
  if (!ARTICLE_STATUSES.has(status)) {
    throw new Error("Invalid article status.");
  }

  return {
    slug: slug || undefined,
    title: title || undefined,
    subtitle,
    summary,
    full_content: fullContent,
    type,
    status,
    featured,
    pinned,
    editorial_weight: editorialWeight,
    published_at: publishedAt,
    image_url: imageUrl,
    image_alt: imageAlt,
    creators,
    categories,
    category_slugs: categorySlugs.length ? categorySlugs : categories.map(slugify).filter(Boolean),
    tags,
    tag_slugs: tagSlugs.length ? tagSlugs : tags.map(slugify).filter(Boolean)
  };
}

function getTransitionRequiredRole(fromStatus, toStatus) {
  const transitions = STATUS_TRANSITIONS[fromStatus] || {};
  return transitions[toStatus] || null;
}

function assertTransitionAllowed(fromStatus, toStatus, actorRole) {
  if (fromStatus === toStatus) return;
  if (actorRole === "admin") return;
  const requiredRole = getTransitionRequiredRole(fromStatus, toStatus);
  if (!requiredRole) {
    throw new Error(`Transition ${fromStatus} -> ${toStatus} is not allowed.`);
  }
  if (!hasMinimumRole(actorRole, requiredRole)) {
    throw new Error(`Transition ${fromStatus} -> ${toStatus} requires ${requiredRole} role or higher.`);
  }
}

function createStorage() {
  const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
  if (!hasSupabaseConfig) {
    return createSqliteStorage();
  }
  return createSupabaseStorage();
}

function createSqliteStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new sqlite3.Database(DB_PATH);

  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  function all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  async function ensureColumn(tableName, columnName, ddl) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      await run(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
    }
  }

  async function initSchema() {
    await run(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        summary TEXT,
        full_content TEXT,
        type TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        featured INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        editorial_weight INTEGER NOT NULL DEFAULT 0,
        published_at TEXT,
        image_url TEXT,
        image_alt TEXT,
        creators_json TEXT NOT NULL DEFAULT '[]',
        categories_json TEXT NOT NULL DEFAULT '[]',
        category_slugs_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        tag_slugs_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      );
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS forum_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        handle TEXT NOT NULL,
        votes INTEGER NOT NULL DEFAULT 0,
        article_key TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_user_id TEXT,
        actor_email TEXT,
        actor_role TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await ensureColumn("forum_posts", "is_hidden", "is_hidden INTEGER NOT NULL DEFAULT 0");
    await ensureColumn("articles", "created_at", "created_at TEXT");
    await ensureColumn("articles", "updated_at", "updated_at TEXT");
    await ensureColumn("forum_posts", "created_at", "created_at TEXT");
    await ensureColumn("forum_posts", "updated_at", "updated_at TEXT");
  }

  async function writeAuditLog(entry) {
    await run(
      `
      INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, actor_email, actor_role, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entry.entity_type,
        entry.entity_id,
        entry.action,
        entry.actor_user_id || null,
        entry.actor_email || null,
        entry.actor_role || null,
        JSON.stringify(entry.details || {}),
        new Date().toISOString()
      ]
    );
  }

  async function seedArticles() {
    const countRow = await get("SELECT COUNT(*) AS count FROM articles");
    if ((countRow && countRow.count) > 0) return;
    const localWire = readLocalWire();
    await run("BEGIN");
    try {
      const nowIso = new Date().toISOString();
      for (const article of localWire) {
        await run(
          `
          INSERT INTO articles (
            id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight,
            published_at, image_url, image_alt, creators_json, categories_json, category_slugs_json, tags_json,
            tag_slugs_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            article.id,
            article.slug,
            article.title,
            article.subtitle || null,
            article.summary || null,
            buildFallbackBody(article),
            article.type || "article",
            ARTICLE_STATUSES.has(article.status) ? article.status : "published",
            article.featured ? 1 : 0,
            article.pinned ? 1 : 0,
            Number(article.editorial_weight || 0),
            article.published_at || nowIso,
            article.image_url || null,
            article.image_alt || null,
            JSON.stringify(article.creators || []),
            JSON.stringify(article.categories || []),
            JSON.stringify(article.category_slugs || []),
            JSON.stringify(article.tags || []),
            JSON.stringify(article.tag_slugs || []),
            nowIso,
            nowIso
          ]
        );
      }
      await run("COMMIT");
    } catch (error) {
      await run("ROLLBACK");
      throw error;
    }
  }

  async function seedForum() {
    const countRow = await get("SELECT COUNT(*) AS count FROM forum_posts");
    if ((countRow && countRow.count) > 0) return;
    await run("BEGIN");
    try {
      const nowIso = new Date().toISOString();
      for (const post of DEFAULT_FORUM_POSTS) {
        await run(
          `
          INSERT INTO forum_posts (title, handle, votes, article_key, is_hidden, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, ?, ?)
          `,
          [post.title, normalizeHandle(post.handle), Math.max(0, Number(post.votes || 0)), post.article_key || null, nowIso, nowIso]
        );
      }
      await run("COMMIT");
    } catch (error) {
      await run("ROLLBACK");
      throw error;
    }
  }

  function rowToArticle(row) {
    return mapArticleRecord({
      ...row,
      creators: row.creators_json,
      categories: row.categories_json,
      category_slugs: row.category_slugs_json,
      tags: row.tags_json,
      tag_slugs: row.tag_slugs_json
    });
  }

  return {
    mode: "sqlite",
    async init() {
      await initSchema();
      await seedArticles();
      await seedForum();
    },
    async verifyAccessToken(token) {
      if (token !== ADMIN_DEV_TOKEN) return null;
      return { id: "local-admin", email: ADMIN_DEV_EMAIL, role: ADMIN_DEV_ROLE };
    },
    async authenticatePublisher({ email, password }) {
      if (email !== ADMIN_DEV_EMAIL || password !== ADMIN_DEV_PASSWORD) {
        throw new Error("Invalid credentials.");
      }
      return {
        access_token: ADMIN_DEV_TOKEN,
        refresh_token: "",
        expires_in: 3600,
        user: { id: "local-admin", email: ADMIN_DEV_EMAIL, role: ADMIN_DEV_ROLE }
      };
    },
    async listPublicArticles() {
      const rows = await all(
        `
        SELECT *
        FROM articles
        WHERE status = 'published' AND published_at <= ?
        ORDER BY pinned DESC, editorial_weight DESC, published_at DESC
        LIMIT 100
        `,
        [new Date().toISOString()]
      );
      return rows.map(rowToArticle);
    },
    async listAdminArticles() {
      const rows = await all(
        `
        SELECT *
        FROM articles
        ORDER BY updated_at DESC, title ASC
        LIMIT 500
        `
      );
      return rows.map(rowToArticle);
    },
    async getArticle(key) {
      const row = await get("SELECT * FROM articles WHERE id = ? OR slug = ? LIMIT 1", [key, key]);
      return row ? rowToArticle(row) : null;
    },
    async createAdminArticle(input, actor) {
      const nowIso = new Date().toISOString();
      const id = `art-${crypto.randomUUID()}`;
      const status = actor.role === "admin" ? input.status : "draft";
      const publishedAt = status === "published" ? input.published_at || nowIso : null;
      await run(
        `
        INSERT INTO articles (
          id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight,
          published_at, image_url, image_alt, creators_json, categories_json, category_slugs_json, tags_json,
          tag_slugs_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          input.slug,
          input.title,
          input.subtitle,
          input.summary,
          input.full_content,
          input.type,
          status,
          input.featured ? 1 : 0,
          input.pinned ? 1 : 0,
          input.editorial_weight,
          publishedAt,
          input.image_url,
          input.image_alt,
          JSON.stringify(input.creators),
          JSON.stringify(input.categories),
          JSON.stringify(input.category_slugs),
          JSON.stringify(input.tags),
          JSON.stringify(input.tag_slugs),
          nowIso,
          nowIso
        ]
      );
      await writeAuditLog({
        entity_type: "article",
        entity_id: id,
        action: "article.create",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: { status, slug: input.slug }
      });
      return this.getArticle(id);
    },
    async updateAdminArticle(id, input, actor) {
      const current = await this.getArticle(id);
      if (!current) return null;
      if (input.status !== current.status && actor.role !== "admin") {
        throw new Error("Use workflow transition endpoints to change article status.");
      }
      const nextStatus = actor.role === "admin" ? input.status : current.status;
      const nowIso = new Date().toISOString();
      await run(
        `
        UPDATE articles
        SET slug = ?, title = ?, subtitle = ?, summary = ?, full_content = ?, type = ?, status = ?, featured = ?, pinned = ?,
            editorial_weight = ?, published_at = ?, image_url = ?, image_alt = ?, creators_json = ?, categories_json = ?,
            category_slugs_json = ?, tags_json = ?, tag_slugs_json = ?, updated_at = ?
        WHERE id = ?
        `,
        [
          input.slug,
          input.title,
          input.subtitle,
          input.summary,
          input.full_content,
          input.type,
          nextStatus,
          input.featured ? 1 : 0,
          input.pinned ? 1 : 0,
          input.editorial_weight,
          nextStatus === "published" ? input.published_at || current.published_at || nowIso : null,
          input.image_url,
          input.image_alt,
          JSON.stringify(input.creators),
          JSON.stringify(input.categories),
          JSON.stringify(input.category_slugs),
          JSON.stringify(input.tags),
          JSON.stringify(input.tag_slugs),
          nowIso,
          current.id
        ]
      );
      await writeAuditLog({
        entity_type: "article",
        entity_id: current.id,
        action: "article.update",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: { slug: input.slug, status: nextStatus }
      });
      return this.getArticle(current.id);
    },
    async transitionArticle(id, targetStatus, actor) {
      const current = await this.getArticle(id);
      if (!current) return null;
      assertTransitionAllowed(current.status, targetStatus, actor.role);
      const nowIso = new Date().toISOString();
      const publishedAt = targetStatus === "published" ? current.published_at || nowIso : null;
      await run("UPDATE articles SET status = ?, published_at = ?, updated_at = ? WHERE id = ?", [
        targetStatus,
        publishedAt,
        nowIso,
        current.id
      ]);
      await writeAuditLog({
        entity_type: "article",
        entity_id: current.id,
        action: "article.transition",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: { from: current.status, to: targetStatus }
      });
      return this.getArticle(current.id);
    },
    async listPublicForumPosts() {
      const rows = await all(
        `
        SELECT id, title, handle, votes, article_key, is_hidden, created_at
        FROM forum_posts
        WHERE is_hidden = 0
        ORDER BY votes DESC, id DESC
        LIMIT 200
        `
      );
      return rows.map(mapForumRecord);
    },
    async listAdminForumPosts() {
      const rows = await all(
        `
        SELECT id, title, handle, votes, article_key, is_hidden, created_at
        FROM forum_posts
        ORDER BY created_at DESC, id DESC
        LIMIT 500
        `
      );
      return rows.map(mapForumRecord);
    },
    async createForumPost({ title, handle, articleKey }) {
      const nowIso = new Date().toISOString();
      const insert = await run(
        `
        INSERT INTO forum_posts (title, handle, votes, article_key, is_hidden, created_at, updated_at)
        VALUES (?, ?, 1, ?, 0, ?, ?)
        `,
        [title, handle, articleKey || null, nowIso, nowIso]
      );
      const row = await get(
        "SELECT id, title, handle, votes, article_key, is_hidden, created_at FROM forum_posts WHERE id = ?",
        [insert.lastID]
      );
      return mapForumRecord(row);
    },
    async voteForumPost({ id, delta }) {
      const update = await run(
        `
        UPDATE forum_posts
        SET votes = CASE WHEN votes + ? < 0 THEN 0 ELSE votes + ? END, updated_at = ?
        WHERE id = ? AND is_hidden = 0
        `,
        [delta, delta, new Date().toISOString(), id]
      );
      if (update.changes === 0) return null;
      const row = await get("SELECT id, title, handle, votes, article_key, is_hidden, created_at FROM forum_posts WHERE id = ?", [id]);
      return mapForumRecord(row);
    },
    async setForumHidden(id, hidden, actor) {
      const update = await run("UPDATE forum_posts SET is_hidden = ?, updated_at = ? WHERE id = ?", [
        hidden ? 1 : 0,
        new Date().toISOString(),
        id
      ]);
      if (update.changes === 0) return null;
      const row = await get("SELECT id, title, handle, votes, article_key, is_hidden, created_at FROM forum_posts WHERE id = ?", [id]);
      await writeAuditLog({
        entity_type: "forum_post",
        entity_id: String(id),
        action: hidden ? "forum.hide" : "forum.unhide",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: {}
      });
      return mapForumRecord(row);
    },
    async listAuditLogs(limit) {
      const rows = await all(
        `
        SELECT id, entity_type, entity_id, action, actor_user_id, actor_email, actor_role, details_json AS details, created_at
        FROM audit_logs
        ORDER BY id DESC
        LIMIT ?
        `,
        [Math.max(1, Math.min(500, Number(limit || 100)))]
      );
      return rows.map(mapAuditRecord);
    }
  };
}

function createSupabaseStorage() {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const anonClient = SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null;

  function articleRowFromLocal(article) {
    const nowIso = new Date().toISOString();
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle || null,
      summary: article.summary || null,
      full_content: buildFallbackBody(article),
      type: article.type || "article",
      status: ARTICLE_STATUSES.has(article.status) ? article.status : "published",
      featured: !!article.featured,
      pinned: !!article.pinned,
      editorial_weight: Number(article.editorial_weight || 0),
      published_at: article.published_at || nowIso,
      image_url: article.image_url || null,
      image_alt: article.image_alt || null,
      creators: article.creators || [],
      categories: article.categories || [],
      category_slugs: article.category_slugs || [],
      tags: article.tags || [],
      tag_slugs: article.tag_slugs || [],
      created_at: nowIso,
      updated_at: nowIso
    };
  }

  async function assertSupabaseSelect(table, selectColumns, label) {
    const { error } = await serviceClient.from(table).select(selectColumns).limit(1);
    if (error) {
      throw formatSupabaseError(`Supabase ${label} is unavailable (run supabase/schema.sql in your project SQL editor)`, error);
    }
  }

  async function ensureSchemaExists() {
    await assertSupabaseSelect("articles", "id,status,published_at", "articles table/schema");
    await assertSupabaseSelect("forum_posts", "id,is_hidden,votes", "forum_posts table/schema");
    await assertSupabaseSelect("publisher_profiles", "user_id,email,role", "publisher_profiles table/schema");
    await assertSupabaseSelect("audit_logs", "id,entity_type,action,details,created_at", "audit_logs table/schema");
  }

  async function maybeSeedArticles() {
    const { count, error } = await serviceClient.from("articles").select("id", { head: true, count: "exact" });
    if (error) {
      throw formatSupabaseError("Failed checking Supabase article count", error);
    }
    if ((count || 0) > 0) return;
    const localWire = readLocalWire().map(articleRowFromLocal);
    const { error: insertError } = await serviceClient.from("articles").insert(localWire);
    if (insertError) {
      throw formatSupabaseError("Failed seeding Supabase articles from data/local-wire.json", insertError);
    }
  }

  async function maybeSeedForumPosts() {
    const { count, error } = await serviceClient.from("forum_posts").select("id", { head: true, count: "exact" });
    if (error) {
      throw formatSupabaseError("Failed checking Supabase forum post count", error);
    }
    if ((count || 0) > 0) return;
    const nowIso = new Date().toISOString();
    const rows = DEFAULT_FORUM_POSTS.map((post) => ({
      title: post.title,
      handle: normalizeHandle(post.handle),
      votes: Math.max(0, Number(post.votes || 0)),
      article_key: post.article_key || null,
      is_hidden: false,
      created_at: nowIso,
      updated_at: nowIso
    }));
    const { error: insertError } = await serviceClient.from("forum_posts").insert(rows);
    if (insertError) {
      throw formatSupabaseError("Failed seeding Supabase forum posts", insertError);
    }
  }

  async function getPublisherRole(userId) {
    const { data, error } = await serviceClient
      .from("publisher_profiles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw formatSupabaseError("Failed reading publisher role", error);
    }
    return data && data.role ? String(data.role).toLowerCase() : null;
  }

  async function writeAuditLog(entry) {
    const { error } = await serviceClient.from("audit_logs").insert({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      actor_user_id: entry.actor_user_id || null,
      actor_email: entry.actor_email || null,
      actor_role: entry.actor_role || null,
      details: entry.details || {},
      created_at: new Date().toISOString()
    });
    if (error) {
      throw formatSupabaseError("Failed writing audit log", error);
    }
  }

  return {
    mode: "supabase",
    async init() {
      await ensureSchemaExists();
      if (SUPABASE_AUTO_SEED) {
        await maybeSeedArticles();
        await maybeSeedForumPosts();
      }
    },
    async verifyAccessToken(token) {
      if (!anonClient) {
        throw new Error("SUPABASE_ANON_KEY is required for publisher authentication.");
      }
      const { data, error } = await anonClient.auth.getUser(token);
      if (error || !data || !data.user) return null;
      const role = await getPublisherRole(data.user.id);
      if (!role) return null;
      return {
        id: data.user.id,
        email: data.user.email || "",
        role
      };
    },
    async authenticatePublisher({ email, password }) {
      if (!anonClient) {
        throw new Error("SUPABASE_ANON_KEY is required for publisher authentication.");
      }
      const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
      if (error || !data || !data.session || !data.user) {
        throw formatSupabaseError("Invalid publisher credentials", error || "missing session");
      }
      const role = await getPublisherRole(data.user.id);
      if (!role) {
        throw new Error("Publisher account has no assigned role. Add row to public.publisher_profiles.");
      }
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token || "",
        expires_in: data.session.expires_in || 3600,
        user: {
          id: data.user.id,
          email: data.user.email || "",
          role
        }
      };
    },
    async listPublicArticles() {
      const { data, error } = await serviceClient
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("pinned", { ascending: false })
        .order("editorial_weight", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(100);
      if (error) throw formatSupabaseError("Failed to fetch Supabase articles", error);
      return (data || []).map(mapArticleRecord);
    },
    async listAdminArticles() {
      const { data, error } = await serviceClient
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw formatSupabaseError("Failed to fetch admin articles", error);
      return (data || []).map(mapArticleRecord);
    },
    async getArticle(key) {
      let result = await serviceClient
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .eq("id", key)
        .limit(1);
      if (result.error) throw formatSupabaseError("Failed to fetch article by id", result.error);
      if (result.data && result.data.length) return mapArticleRecord(result.data[0]);

      result = await serviceClient
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .eq("slug", key)
        .limit(1);
      if (result.error) throw formatSupabaseError("Failed to fetch article by slug", result.error);
      if (!result.data || !result.data.length) return null;
      return mapArticleRecord(result.data[0]);
    },
    async createAdminArticle(input, actor) {
      const nowIso = new Date().toISOString();
      const status = actor.role === "admin" ? input.status : "draft";
      const row = {
        id: `art-${crypto.randomUUID()}`,
        slug: input.slug,
        title: input.title,
        subtitle: input.subtitle,
        summary: input.summary,
        full_content: input.full_content,
        type: input.type,
        status,
        featured: input.featured,
        pinned: input.pinned,
        editorial_weight: input.editorial_weight,
        published_at: status === "published" ? input.published_at || nowIso : null,
        image_url: input.image_url,
        image_alt: input.image_alt,
        creators: input.creators,
        categories: input.categories,
        category_slugs: input.category_slugs,
        tags: input.tags,
        tag_slugs: input.tag_slugs,
        created_at: nowIso,
        updated_at: nowIso
      };
      const { data, error } = await serviceClient
        .from("articles")
        .insert(row)
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .single();
      if (error) throw formatSupabaseError("Failed creating article", error);
      await writeAuditLog({
        entity_type: "article",
        entity_id: data.id,
        action: "article.create",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: { status, slug: input.slug }
      });
      return mapArticleRecord(data);
    },
    async updateAdminArticle(id, input, actor) {
      const current = await this.getArticle(id);
      if (!current) return null;
      if (input.status !== current.status && actor.role !== "admin") {
        throw new Error("Use workflow transition endpoints to change article status.");
      }
      const patch = {
        slug: input.slug,
        title: input.title,
        subtitle: input.subtitle,
        summary: input.summary,
        full_content: input.full_content,
        type: input.type,
        status: actor.role === "admin" ? input.status : current.status,
        featured: input.featured,
        pinned: input.pinned,
        editorial_weight: input.editorial_weight,
        published_at:
          (actor.role === "admin" ? input.status : current.status) === "published"
            ? input.published_at || current.published_at || new Date().toISOString()
            : null,
        image_url: input.image_url,
        image_alt: input.image_alt,
        creators: input.creators,
        categories: input.categories,
        category_slugs: input.category_slugs,
        tags: input.tags,
        tag_slugs: input.tag_slugs,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await serviceClient
        .from("articles")
        .update(patch)
        .eq("id", current.id)
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .single();
      if (error) throw formatSupabaseError("Failed updating article", error);
      await writeAuditLog({
        entity_type: "article",
        entity_id: data.id,
        action: "article.update",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: { slug: input.slug, status: data.status }
      });
      return mapArticleRecord(data);
    },
    async transitionArticle(id, targetStatus, actor) {
      const current = await this.getArticle(id);
      if (!current) return null;
      assertTransitionAllowed(current.status, targetStatus, actor.role);
      const patch = {
        status: targetStatus,
        published_at: targetStatus === "published" ? current.published_at || new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await serviceClient
        .from("articles")
        .update(patch)
        .eq("id", current.id)
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs, created_at, updated_at"
        )
        .single();
      if (error) throw formatSupabaseError("Failed transitioning article", error);
      await writeAuditLog({
        entity_type: "article",
        entity_id: data.id,
        action: "article.transition",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: { from: current.status, to: targetStatus }
      });
      return mapArticleRecord(data);
    },
    async listPublicForumPosts() {
      const { data, error } = await serviceClient
        .from("forum_posts")
        .select("id, title, handle, votes, article_key, is_hidden, created_at")
        .eq("is_hidden", false)
        .order("votes", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);
      if (error) throw formatSupabaseError("Failed to fetch forum posts", error);
      return (data || []).map(mapForumRecord);
    },
    async listAdminForumPosts() {
      const { data, error } = await serviceClient
        .from("forum_posts")
        .select("id, title, handle, votes, article_key, is_hidden, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw formatSupabaseError("Failed to fetch admin forum posts", error);
      return (data || []).map(mapForumRecord);
    },
    async createForumPost({ title, handle, articleKey }) {
      const nowIso = new Date().toISOString();
      const { data, error } = await serviceClient
        .from("forum_posts")
        .insert({ title, handle, votes: 1, article_key: articleKey || null, is_hidden: false, created_at: nowIso, updated_at: nowIso })
        .select("id, title, handle, votes, article_key, is_hidden, created_at")
        .single();
      if (error) throw formatSupabaseError("Failed creating forum post", error);
      return mapForumRecord(data);
    },
    async voteForumPost({ id, delta }) {
      const { data: currentRow, error: currentError } = await serviceClient
        .from("forum_posts")
        .select("id, title, handle, votes, article_key, is_hidden, created_at")
        .eq("id", id)
        .eq("is_hidden", false)
        .limit(1)
        .maybeSingle();
      if (currentError) throw formatSupabaseError("Failed reading forum post before vote", currentError);
      if (!currentRow) return null;
      const nextVotes = Math.max(0, Number(currentRow.votes || 0) + delta);
      const { data, error } = await serviceClient
        .from("forum_posts")
        .update({ votes: nextVotes, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, title, handle, votes, article_key, is_hidden, created_at")
        .single();
      if (error) throw formatSupabaseError("Failed updating forum vote", error);
      return mapForumRecord(data);
    },
    async setForumHidden(id, hidden, actor) {
      const { data, error } = await serviceClient
        .from("forum_posts")
        .update({ is_hidden: !!hidden, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, title, handle, votes, article_key, is_hidden, created_at")
        .single();
      if (error && error.code === "PGRST116") return null;
      if (error) throw formatSupabaseError("Failed moderating forum post", error);
      await writeAuditLog({
        entity_type: "forum_post",
        entity_id: String(id),
        action: hidden ? "forum.hide" : "forum.unhide",
        actor_user_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        details: {}
      });
      return mapForumRecord(data);
    },
    async listAuditLogs(limit) {
      const { data, error } = await serviceClient
        .from("audit_logs")
        .select("id, entity_type, entity_id, action, actor_user_id, actor_email, actor_role, details, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.max(1, Math.min(500, Number(limit || 100))));
      if (error) throw formatSupabaseError("Failed listing audit logs", error);
      return (data || []).map(mapAuditRecord);
    }
  };
}

const storage = createStorage();
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

const rateLimitState = new Map();
const forumDuplicateState = new Map();

function cleanupRateState(now) {
  if (rateLimitState.size < 5000) return;
  for (const [key, value] of rateLimitState.entries()) {
    if (value.resetAt <= now) rateLimitState.delete(key);
  }
}

function createRateLimiter({ keyPrefix, windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    cleanupRateState(now);
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const current = rateLimitState.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      res.status(429).json({ error: "Rate limit exceeded. Please retry shortly." });
      return;
    }
    next();
  };
}

function assertForumPostAllowed(req, title) {
  const normalized = normalizeText(title, 120).toLowerCase();
  const blockedTokens = ["<script", "javascript:", "http://", "https://", "porn", "casino", "viagra"];
  if (blockedTokens.some((token) => normalized.includes(token))) {
    throw new Error("Forum post contains blocked content.");
  }
  if (/(.)\1{9,}/.test(normalized)) {
    throw new Error("Forum post looks like spam.");
  }
  const ip = getClientIp(req);
  const dedupeKey = `${ip}:${normalized}`;
  const now = Date.now();
  const previous = forumDuplicateState.get(dedupeKey);
  if (previous && now - previous < 5 * 60 * 1000) {
    throw new Error("Duplicate forum post detected. Try a different title.");
  }
  forumDuplicateState.set(dedupeKey, now);
  if (forumDuplicateState.size > 5000) {
    for (const [key, ts] of forumDuplicateState.entries()) {
      if (now - ts > 5 * 60 * 1000) forumDuplicateState.delete(key);
    }
  }
}

const loginLimiter = createRateLimiter({ keyPrefix: "admin-login", windowMs: 15 * 60 * 1000, max: 25 });
const forumCreateLimiter = createRateLimiter({ keyPrefix: "forum-create", windowMs: 10 * 60 * 1000, max: 30 });
const forumVoteLimiter = createRateLimiter({ keyPrefix: "forum-vote", windowMs: 60 * 1000, max: 120 });

function getBearerToken(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

function requireRole(minimumRole) {
  return async (req, res, next) => {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing bearer token." });
      return;
    }
    try {
      const user = await storage.verifyAccessToken(token);
      if (!user) {
        res.status(401).json({ error: "Invalid or expired token." });
        return;
      }
      if (!hasMinimumRole(user.role, minimumRole)) {
        res.status(403).json({ error: `Requires ${minimumRole} role or higher.` });
        return;
      }
      req.publisher = user;
      next();
    } catch (error) {
      res.status(500).json({ error: "Failed to authorize publisher.", details: error.message });
    }
  };
}

async function transitionArticleRoute(req, res, targetStatus) {
  const id = normalizeText(req.params.id, 180);
  if (!id) {
    res.status(400).json({ error: "Article id is required." });
    return;
  }
  try {
    const item = await storage.transitionArticle(id, targetStatus, req.publisher);
    if (!item) {
      res.status(404).json({ error: "Article not found." });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(400).json({ error: "Failed to transition article.", details: error.message });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "griot-noir-api", storage: storage.mode });
});

app.get("/api/public-config", (req, res) => {
  res.json({
    supabase_url: SUPABASE_URL || "",
    supabase_anon_key: SUPABASE_ANON_KEY || "",
    members_enabled: !!(SUPABASE_URL && SUPABASE_ANON_KEY)
  });
});

app.get("/api/articles", async (req, res) => {
  try {
    const items = await storage.listPublicArticles();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch articles.", details: error.message });
  }
});

app.get("/api/articles/:key", async (req, res) => {
  const key = normalizeText(req.params.key, 180);
  if (!key) {
    res.status(400).json({ error: "Article key is required." });
    return;
  }
  try {
    const item = await storage.getArticle(key);
    if (!item || item.status !== "published") {
      res.status(404).json({ error: "Article not found." });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch article.", details: error.message });
  }
});

app.get("/api/forum/posts", async (req, res) => {
  try {
    const items = await storage.listPublicForumPosts();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch forum posts.", details: error.message });
  }
});

app.post("/api/forum/posts", forumCreateLimiter, async (req, res) => {
  const title = normalizeText(req.body && req.body.title, 120);
  const articleKey = normalizeText(req.body && req.body.article_key, 180);
  const handle = normalizeHandle(req.body && req.body.handle);
  if (title.length < 3) {
    res.status(400).json({ error: "Title must be between 3 and 120 characters." });
    return;
  }
  try {
    assertForumPostAllowed(req, title);
    const item = await storage.createForumPost({ title, handle, articleKey });
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: "Failed to create forum post.", details: error.message });
  }
});

app.post("/api/forum/posts/:id/vote", forumVoteLimiter, async (req, res) => {
  const id = Number(req.params.id);
  const delta = Number(req.body && req.body.delta);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid forum post id." });
    return;
  }
  if (delta !== 1 && delta !== -1) {
    res.status(400).json({ error: "Vote delta must be 1 or -1." });
    return;
  }
  try {
    const item = await storage.voteForumPost({ id, delta });
    if (!item) {
      res.status(404).json({ error: "Forum post not found." });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to vote forum post.", details: error.message });
  }
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const email = normalizeText(req.body && req.body.email, 200).toLowerCase();
  const password = String(req.body && req.body.password ? req.body.password : "");
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  try {
    const session = await storage.authenticatePublisher({ email, password });
    res.json(session);
  } catch (error) {
    res.status(401).json({ error: "Publisher login failed.", details: error.message });
  }
});

app.get("/api/admin/me", requireRole("writer"), (req, res) => {
  res.json({ user: req.publisher });
});

app.get("/api/admin/articles", requireRole("writer"), async (req, res) => {
  try {
    const items = await storage.listAdminArticles();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch admin articles.", details: error.message });
  }
});

app.post("/api/admin/articles", requireRole("writer"), async (req, res) => {
  let input;
  try {
    input = parseArticleInput(req.body || {}, { requireCoreFields: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  try {
    const item = await storage.createAdminArticle(input, req.publisher);
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: "Failed to create article.", details: error.message });
  }
});

app.put("/api/admin/articles/:id", requireRole("writer"), async (req, res) => {
  const id = normalizeText(req.params.id, 180);
  if (!id) {
    res.status(400).json({ error: "Article id is required." });
    return;
  }
  let input;
  try {
    input = parseArticleInput(req.body || {}, { requireCoreFields: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  try {
    const item = await storage.updateAdminArticle(id, input, req.publisher);
    if (!item) {
      res.status(404).json({ error: "Article not found." });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(400).json({ error: "Failed to update article.", details: error.message });
  }
});

app.post("/api/admin/articles/:id/submit-review", requireRole("writer"), async (req, res) => {
  await transitionArticleRoute(req, res, "in_review");
});

app.post("/api/admin/articles/:id/approve", requireRole("editor"), async (req, res) => {
  await transitionArticleRoute(req, res, "approved");
});

app.post("/api/admin/articles/:id/publish", requireRole("publisher"), async (req, res) => {
  await transitionArticleRoute(req, res, "published");
});

app.post("/api/admin/articles/:id/unpublish", requireRole("editor"), async (req, res) => {
  await transitionArticleRoute(req, res, "draft");
});

app.get("/api/admin/forum/posts", requireRole("editor"), async (req, res) => {
  try {
    const items = await storage.listAdminForumPosts();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch admin forum posts.", details: error.message });
  }
});

app.post("/api/admin/forum/posts/:id/hide", requireRole("editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid forum post id." });
    return;
  }
  try {
    const item = await storage.setForumHidden(id, true, req.publisher);
    if (!item) {
      res.status(404).json({ error: "Forum post not found." });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to hide forum post.", details: error.message });
  }
});

app.post("/api/admin/forum/posts/:id/unhide", requireRole("editor"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid forum post id." });
    return;
  }
  try {
    const item = await storage.setForumHidden(id, false, req.publisher);
    if (!item) {
      res.status(404).json({ error: "Forum post not found." });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to unhide forum post.", details: error.message });
  }
});

app.get("/api/admin/audit-logs", requireRole("editor"), async (req, res) => {
  const limit = Number(req.query.limit);
  try {
    const items = await storage.listAuditLogs(Number.isFinite(limit) ? limit : 100);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit logs.", details: error.message });
  }
});

app.use(express.static(ROOT_DIR, { index: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "admin.html"));
});

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

storage
  .init()
  .then(() => {
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`GRIOT NOIR API listening at http://127.0.0.1:${PORT} (storage: ${storage.mode})`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage:", error);
    process.exit(1);
  });
