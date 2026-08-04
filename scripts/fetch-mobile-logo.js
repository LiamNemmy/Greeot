const fs = require("fs");
const path = require("path");

const logoUrl = (process.argv[2] || process.env.CAP_LOGO_URL || "").trim();
if (!logoUrl) {
  throw new Error("Missing logo URL. Pass it as: npm run cap:logo:url -- \"https://.../logo.png\"");
}

const assetsDir = path.join(__dirname, "..", "assets");
const outPath = path.join(assetsDir, "logo.png");

async function main() {
  const response = await fetch(logoUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed downloading logo: ${response.status} ${response.statusText}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("image/png")) {
    throw new Error(`Expected a PNG image, got content-type: ${contentType || "unknown"}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(outPath, bytes);

  console.log(`Saved custom logo to ${outPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
