const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "db");
const DB_PATH = path.join(DATA_DIR, "griot.sqlite");
const LOCAL_WIRE_PATH = path.join(ROOT_DIR, "data", "local-wire.json");
const PORT = Number(process.env.PORT || 4174);
const SUPABASE_URL = process.env.SUPABASE_URL || "https://hfbdphfdxfgwmviogoif.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_A7fwIkNeUIjxXIn0oQ32bw_HwVO-Kye";
const SUPABASE_AUTO_SEED = process.env.SUPABASE_AUTO_SEED !== "false";

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

function normalizeHandle(rawHandle) {
  const trimmed = String(rawHandle || "").trim();
  if (!trimmed) return "@you";
  if (trimmed.startsWith("@")) return trimmed;
  return `@${trimmed}`;
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
    subtitle: row.subtitle,
    summary: row.summary,
    full_content: row.full_content || null,
    type: row.type || "article",
    status: row.status,
    featured: !!row.featured,
    pinned: !!row.pinned,
    editorial_weight: Number(row.editorial_weight || 0),
    published_at: row.published_at,
    image_url: row.image_url || null,
    image_alt: row.image_alt || null,
    creators: coerceArray(row.creators),
    categories: coerceArray(row.categories),
    category_slugs: coerceArray(row.category_slugs),
    tags: coerceArray(row.tags),
    tag_slugs: coerceArray(row.tag_slugs)
  };
}

function mapForumRecord(row) {
  return {
    id: String(row.id),
    title: row.title,
    handle: row.handle,
    votes: Number(row.votes || 0),
    article_key: row.article_key || ""
  };
}

function formatSupabaseError(prefix, error) {
  const message = error && error.message ? error.message : String(error || "unknown error");
  return new Error(`${prefix}: ${message}`);
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
        tag_slugs_json TEXT NOT NULL DEFAULT '[]'
      );
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS forum_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        handle TEXT NOT NULL,
        votes INTEGER NOT NULL DEFAULT 0,
        article_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async function seedArticles() {
    const countRow = await get("SELECT COUNT(*) AS count FROM articles");
    if ((countRow && countRow.count) > 0) return;

    const localWire = readLocalWire();
    await run("BEGIN");
    try {
      for (const article of localWire) {
        await run(
          `
            INSERT INTO articles (
              id, slug, title, subtitle, summary, full_content, type, status, featured, pinned,
              editorial_weight, published_at, image_url, image_alt,
              creators_json, categories_json, category_slugs_json, tags_json, tag_slugs_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            article.id,
            article.slug,
            article.title,
            article.subtitle || null,
            article.summary || null,
            buildFallbackBody(article),
            article.type || "article",
            article.status || "published",
            article.featured ? 1 : 0,
            article.pinned ? 1 : 0,
            Number(article.editorial_weight || 0),
            article.published_at || null,
            article.image_url || null,
            article.image_alt || null,
            JSON.stringify(article.creators || []),
            JSON.stringify(article.categories || []),
            JSON.stringify(article.category_slugs || []),
            JSON.stringify(article.tags || []),
            JSON.stringify(article.tag_slugs || [])
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
      for (const post of DEFAULT_FORUM_POSTS) {
        await run(
          `
            INSERT INTO forum_posts (title, handle, votes, article_key)
            VALUES (?, ?, ?, ?)
          `,
          [post.title, normalizeHandle(post.handle), Math.max(0, Number(post.votes || 0)), post.article_key || null]
        );
      }
      await run("COMMIT");
    } catch (error) {
      await run("ROLLBACK");
      throw error;
    }
  }

  return {
    mode: "sqlite",
    async init() {
      await initSchema();
      await seedArticles();
      await seedForum();
    },
    async listArticles() {
      const rows = await all(
        `
        SELECT
          id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight,
          published_at, image_url, image_alt,
          creators_json AS creators, categories_json AS categories, category_slugs_json AS category_slugs,
          tags_json AS tags, tag_slugs_json AS tag_slugs
        FROM articles
        WHERE status = 'published' AND published_at <= ?
        ORDER BY pinned DESC, editorial_weight DESC, published_at DESC
        LIMIT 100
        `,
        [new Date().toISOString()]
      );
      return rows.map(mapArticleRecord);
    },
    async getArticle(key) {
      const row = await get(
        `
        SELECT
          id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight,
          published_at, image_url, image_alt,
          creators_json AS creators, categories_json AS categories, category_slugs_json AS category_slugs,
          tags_json AS tags, tag_slugs_json AS tag_slugs
        FROM articles
        WHERE id = ? OR slug = ?
        LIMIT 1
        `,
        [key, key]
      );
      return row ? mapArticleRecord(row) : null;
    },
    async listForumPosts() {
      const rows = await all(
        `
        SELECT id, title, handle, votes, article_key
        FROM forum_posts
        ORDER BY votes DESC, id DESC
        LIMIT 200
        `
      );
      return rows.map(mapForumRecord);
    },
    async createForumPost({ title, handle, articleKey }) {
      const insert = await run(
        `
        INSERT INTO forum_posts (title, handle, votes, article_key)
        VALUES (?, ?, 1, ?)
        `,
        [title, handle, articleKey || null]
      );
      const row = await get("SELECT id, title, handle, votes, article_key FROM forum_posts WHERE id = ?", [insert.lastID]);
      return mapForumRecord(row);
    },
    async voteForumPost({ id, delta }) {
      const update = await run(
        `
        UPDATE forum_posts
        SET votes = CASE WHEN votes + ? < 0 THEN 0 ELSE votes + ? END
        WHERE id = ?
        `,
        [delta, delta, id]
      );
      if (update.changes === 0) return null;
      const row = await get("SELECT id, title, handle, votes, article_key FROM forum_posts WHERE id = ?", [id]);
      return mapForumRecord(row);
    }
  };
}

function createSupabaseStorage() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  function articleRowFromLocal(article) {
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      subtitle: article.subtitle || null,
      summary: article.summary || null,
      full_content: buildFallbackBody(article),
      type: article.type || "article",
      status: article.status || "published",
      featured: !!article.featured,
      pinned: !!article.pinned,
      editorial_weight: Number(article.editorial_weight || 0),
      published_at: article.published_at || null,
      image_url: article.image_url || null,
      image_alt: article.image_alt || null,
      creators: article.creators || [],
      categories: article.categories || [],
      category_slugs: article.category_slugs || [],
      tags: article.tags || [],
      tag_slugs: article.tag_slugs || []
    };
  }

  async function ensureSchemaExists() {
    const { error } = await supabase.from("articles").select("id", { head: true, count: "exact" }).limit(1);
    if (error) {
      throw formatSupabaseError(
        "Supabase articles table is unavailable (run supabase/schema.sql in your project SQL editor)",
        error
      );
    }
  }

  async function maybeSeedArticles() {
    const { count, error } = await supabase.from("articles").select("id", { head: true, count: "exact" });
    if (error) {
      throw formatSupabaseError("Failed checking Supabase article count", error);
    }
    if ((count || 0) > 0) return;

    const localWire = readLocalWire().map(articleRowFromLocal);
    const { error: insertError } = await supabase.from("articles").insert(localWire);
    if (insertError) {
      throw formatSupabaseError("Failed seeding Supabase articles from data/local-wire.json", insertError);
    }
  }

  async function maybeSeedForumPosts() {
    const { count, error } = await supabase.from("forum_posts").select("id", { head: true, count: "exact" });
    if (error) {
      throw formatSupabaseError("Failed checking Supabase forum post count", error);
    }
    if ((count || 0) > 0) return;

    const rows = DEFAULT_FORUM_POSTS.map((post) => ({
      title: post.title,
      handle: normalizeHandle(post.handle),
      votes: Math.max(0, Number(post.votes || 0)),
      article_key: post.article_key || null
    }));
    const { error: insertError } = await supabase.from("forum_posts").insert(rows);
    if (insertError) {
      throw formatSupabaseError("Failed seeding Supabase forum posts", insertError);
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
    async listArticles() {
      const { data, error } = await supabase
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs"
        )
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("pinned", { ascending: false })
        .order("editorial_weight", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(100);

      if (error) {
        throw formatSupabaseError("Failed to fetch Supabase articles", error);
      }
      return (data || []).map(mapArticleRecord);
    },
    async getArticle(key) {
      let result = await supabase
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs"
        )
        .eq("id", key)
        .limit(1);
      if (result.error) {
        throw formatSupabaseError("Failed to fetch Supabase article by id", result.error);
      }
      if (result.data && result.data.length) {
        return mapArticleRecord(result.data[0]);
      }

      result = await supabase
        .from("articles")
        .select(
          "id, slug, title, subtitle, summary, full_content, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, creators, categories, category_slugs, tags, tag_slugs"
        )
        .eq("slug", key)
        .limit(1);
      if (result.error) {
        throw formatSupabaseError("Failed to fetch Supabase article by slug", result.error);
      }
      if (!result.data || !result.data.length) {
        return null;
      }
      return mapArticleRecord(result.data[0]);
    },
    async listForumPosts() {
      const { data, error } = await supabase
        .from("forum_posts")
        .select("id, title, handle, votes, article_key")
        .order("votes", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);

      if (error) {
        throw formatSupabaseError("Failed to fetch Supabase forum posts", error);
      }
      return (data || []).map(mapForumRecord);
    },
    async createForumPost({ title, handle, articleKey }) {
      const { data, error } = await supabase
        .from("forum_posts")
        .insert({ title, handle, votes: 1, article_key: articleKey || null })
        .select("id, title, handle, votes, article_key")
        .single();

      if (error) {
        throw formatSupabaseError("Failed to create Supabase forum post", error);
      }
      return mapForumRecord(data);
    },
    async voteForumPost({ id, delta }) {
      const { data: currentRow, error: currentError } = await supabase
        .from("forum_posts")
        .select("id, title, handle, votes, article_key")
        .eq("id", id)
        .limit(1)
        .maybeSingle();

      if (currentError) {
        throw formatSupabaseError("Failed reading Supabase forum post before vote", currentError);
      }
      if (!currentRow) {
        return null;
      }

      const nextVotes = Math.max(0, Number(currentRow.votes || 0) + delta);
      const { data, error } = await supabase
        .from("forum_posts")
        .update({ votes: nextVotes })
        .eq("id", id)
        .select("id, title, handle, votes, article_key")
        .single();

      if (error) {
        throw formatSupabaseError("Failed updating Supabase forum vote", error);
      }
      return mapForumRecord(data);
    }
  };
}

const storage = createStorage();
const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "griot-noir-api", storage: storage.mode });
});

app.get("/api/articles", async (req, res) => {
  try {
    const items = await storage.listArticles();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch articles.", details: error.message });
  }
});

app.get("/api/articles/:key", async (req, res) => {
  const key = String(req.params.key || "").trim();
  if (!key) {
    res.status(400).json({ error: "Article key is required." });
    return;
  }

  try {
    const item = await storage.getArticle(key);
    if (!item) {
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
    const items = await storage.listForumPosts();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch forum posts.", details: error.message });
  }
});

app.post("/api/forum/posts", async (req, res) => {
  const title = String(req.body && req.body.title ? req.body.title : "").trim();
  const articleKey = String(req.body && req.body.article_key ? req.body.article_key : "").trim();
  const handle = normalizeHandle(req.body && req.body.handle);

  if (title.length < 3 || title.length > 120) {
    res.status(400).json({ error: "Title must be between 3 and 120 characters." });
    return;
  }

  try {
    const item = await storage.createForumPost({ title, handle, articleKey });
    res.status(201).json({ item });
  } catch (error) {
    res.status(500).json({ error: "Failed to create forum post.", details: error.message });
  }
});

app.post("/api/forum/posts/:id/vote", async (req, res) => {
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

app.use(express.static(ROOT_DIR, { index: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
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
