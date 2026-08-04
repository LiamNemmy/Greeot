const FEED_SELECT =
  "id, slug, title, subtitle, summary, type, status, featured, pinned, editorial_weight, published_at, image_url, image_alt, work_creators ( role, position, person:people ( name, slug ) ), work_terms ( term:terms ( type, slug, name ) )";

function feedSort(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  const wa = a.editorial_weight || 0;
  const wb = b.editorial_weight || 0;
  if (wa !== wb) return wb - wa;
  return new Date(b.published_at || 0) - new Date(a.published_at || 0);
}

function isPublicRow(row) {
  return row.status === "published" && row.published_at && new Date(row.published_at) <= new Date();
}

function mapSupabaseRow(row) {
  const creators = (row.work_creators || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((workCreator) => ({
      name: (workCreator.person && workCreator.person.name) || "Unknown",
      role: workCreator.role || "Contributor"
    }));

  const categories = [];
  const categorySlugs = [];
  const tags = [];
  const tagSlugs = [];

  (row.work_terms || []).forEach((workTerm) => {
    const term = workTerm.term;
    if (!term) return;
    if (term.type === "category") {
      categories.push(term.name);
      categorySlugs.push(term.slug);
      return;
    }
    if (term.type === "tag") {
      tags.push(term.name);
      tagSlugs.push(term.slug);
    }
  });

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    type: row.type,
    status: row.status,
    featured: row.featured,
    pinned: row.pinned,
    editorial_weight: row.editorial_weight,
    published_at: row.published_at,
    image_url: row.image_url,
    image_alt: row.image_alt,
    creators,
    categories,
    category_slugs: categorySlugs,
    tags,
    tag_slugs: tagSlugs
  };
}

async function readLocalFeed(localFeedUrl) {
  const response = await fetch(localFeedUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Local feed request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Local feed must be an array of articles.");
  }
  return data.filter(isPublicRow).sort(feedSort);
}

function resolveApiPath(apiBaseUrl, path) {
  if (!apiBaseUrl) return path;
  return `${String(apiBaseUrl).replace(/\/+$/, "")}${path}`;
}

async function readApiFeed(apiBaseUrl) {
  const response = await fetch(resolveApiPath(apiBaseUrl, "/api/articles"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`API feed request failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("API feed payload is invalid: expected { items: [] }.");
  }
  return payload.items.filter(isPublicRow).sort(feedSort);
}

function createSupabaseClient(supabaseUrl, supabaseAnonKey) {
  if (!supabaseUrl && !supabaseAnonKey) return null;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Both SUPABASE_URL and SUPABASE_ANON_KEY must be configured together.");
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase SDK is not available on window.supabase.");
  }
  return window.supabase.createClient(supabaseUrl, supabaseAnonKey);
}

async function readSupabaseFeed(client) {
  const { data, error } = await client
    .from("works")
    .select(FEED_SELECT)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("editorial_weight", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  return (data || []).map(mapSupabaseRow).filter(isPublicRow).sort(feedSort);
}

export class ArticleService {
  constructor(config) {
    if (!config || !config.localFeedUrl) {
      throw new Error("ArticleService requires a localFeedUrl.");
    }
    this.apiBaseUrl = config.apiBaseUrl || "";
    this.localFeedUrl = config.localFeedUrl;
    this.supabaseClient = createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  async listArticles() {
    try {
      return { items: await readApiFeed(this.apiBaseUrl), mode: "api" };
    } catch (apiError) {
      if (this.supabaseClient) {
        try {
          return { items: await readSupabaseFeed(this.supabaseClient), mode: "live" };
        } catch (supabaseError) {
          try {
            return {
              items: await readLocalFeed(this.localFeedUrl),
              mode: "fallback",
              remoteError: new Error(`API failed (${apiError.message}); Supabase failed (${supabaseError.message})`)
            };
          } catch (localError) {
            throw new Error(
              `API failed (${apiError.message}), Supabase failed (${supabaseError.message}), and local fallback failed (${localError.message}).`
            );
          }
        }
      }

      try {
        return {
          items: await readLocalFeed(this.localFeedUrl),
          mode: "fallback",
          remoteError: apiError
        };
      } catch (localError) {
        throw new Error(`API failed (${apiError.message}) and local fallback failed (${localError.message}).`);
      }
    }
  }
}
