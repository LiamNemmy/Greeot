const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const MOBILE_WEB_DIR = path.join(ROOT_DIR, "mobile-web");
const WEB_ENTRIES = ["index.html", "admin.html", "directory.html", "js", "data"];

fs.rmSync(MOBILE_WEB_DIR, { recursive: true, force: true });
fs.mkdirSync(MOBILE_WEB_DIR, { recursive: true });

for (const entry of WEB_ENTRIES) {
  const source = path.join(ROOT_DIR, entry);
  const target = path.join(MOBILE_WEB_DIR, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required web asset: ${entry}`);
  }
  fs.cpSync(source, target, { recursive: true });
}

console.log("Prepared mobile-web assets for Capacitor.");
