const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
const token = process.env.TMDB_ACCESS_TOKEN?.trim();
if (!token) throw new Error("TMDB_ACCESS_TOKEN is missing. Set it in .env or the deployment environment.");
const webGeminiFunctionUrl = "/.netlify/functions/gemini-chat";
const androidGeminiFunctionUrl = "https://cruzflix.netlify.app/.netlify/functions/gemini-chat";

if (new URL(androidGeminiFunctionUrl).protocol !== "https:") {
    throw new Error("The Android chat function URL must use HTTPS.");
}

function configFor(geminiFunctionUrl) {
    return `export const TMDB_ACCESS_TOKEN = ${JSON.stringify(token)};\nexport const GEMINI_FUNCTION_URL = ${JSON.stringify(geminiFunctionUrl)};\n`;
}

const webConfigPath = path.join(projectRoot, "www/js/config.js");
const androidConfigPath = path.join(projectRoot, "android/app/src/main/assets/public/js/config.js");
fs.mkdirSync(path.dirname(webConfigPath), { recursive: true });
fs.mkdirSync(path.dirname(androidConfigPath), { recursive: true });
fs.writeFileSync(webConfigPath, configFor(webGeminiFunctionUrl), "utf8");
fs.writeFileSync(androidConfigPath, configFor(androidGeminiFunctionUrl), "utf8");

console.log("Generated web and Android app config.");
