const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, ".env.example");

const PRIVATE_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./
];

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

function findLanIp() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const info of entries || []) {
      if (info && info.family === "IPv4" && !info.internal && PRIVATE_RANGES.some((rx) => rx.test(info.address))) {
        return info.address;
      }
    }
  }
  return "";
}

ensureEnvFile();

const ip = findLanIp();
if (!ip) {
  throw new Error("Could not detect a private LAN IPv4 address. Set CAP_SERVER_URL manually.");
}

let lines = readEnvLines();
const portLine = lines.find((line) => line.startsWith("PORT=")) || "PORT=4174";
const port = String(portLine.split("=")[1] || "4174").trim() || "4174";

lines = setEnvLine(lines, "HOST", "0.0.0.0");
lines = setEnvLine(lines, "CAP_SERVER_URL", `http://${ip}:${port}`);
fs.writeFileSync(ENV_PATH, `${lines.join("\n").trimEnd()}\n`);

console.log(`Updated .env for real-device LAN testing:`);
console.log(`HOST=0.0.0.0`);
console.log(`CAP_SERVER_URL=http://${ip}:${port}`);
