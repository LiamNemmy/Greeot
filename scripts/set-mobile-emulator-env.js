const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, ".env.example");

function ensureEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  }
}

function readEnvLines() {
  return fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
}

function setEnvLine(lines, key, value) {
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${prefix}${value}`;
    }
    return line;
  });
  if (!found) {
    next.push(`${prefix}${value}`);
  }
  return next;
}

ensureEnvFile();
let lines = readEnvLines();
const portLine = lines.find((line) => line.startsWith("PORT=")) || "PORT=4174";
const port = String(portLine.split("=")[1] || "4174").trim() || "4174";

lines = setEnvLine(lines, "HOST", "127.0.0.1");
lines = setEnvLine(lines, "CAP_SERVER_URL", `http://10.0.2.2:${port}`);
fs.writeFileSync(ENV_PATH, `${lines.join("\n").trimEnd()}\n`);

console.log(`Updated .env for Android emulator:`);
console.log(`HOST=127.0.0.1`);
console.log(`CAP_SERVER_URL=http://10.0.2.2:${port}`);
