const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env. Copy .env.example to .env and set TMDB_ACCESS_TOKEN.");
}

dotenv.config({ path: envPath });
const token = process.env.TMDB_ACCESS_TOKEN?.trim();
if (!token) throw new Error("TMDB_ACCESS_TOKEN is missing from .env.");

const generatedConfig = `export const TMDB_ACCESS_TOKEN = ${JSON.stringify(token)};\n`;
const outputPaths = [
    path.join(projectRoot, "www/js/config.js"),
    path.join(projectRoot, "android/app/src/main/assets/public/js/config.js")
];

for (const outputPath of outputPaths) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, generatedConfig, "utf8");
}

console.log("Generated local TMDB config for web and Android builds.");