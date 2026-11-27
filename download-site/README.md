# MoviesHub Android downloads

This is the public APK page for MoviesHub. It is a small vanilla HTML, CSS, and JavaScript site; release details and APK links come from public GitHub Releases through a cached Netlify Function.

## Netlify sites

This repository contains two separate Netlify sites. Keep both sites' **Base directory** set to the repository root (blank in Netlify). The root `netlify.toml` publishes the main app from `www/`; this site's config publishes `download-site/` and places its release lookup function outside the public files.

For the main app Netlify site, leave **Package directory** blank. For the APK site, set **Package directory** to `download-site`. Keep the `GEMINI_API_KEY` environment variable on the main app site only. The main app also needs `TMDB_ACCESS_TOKEN` at build time.

The ignore rules build the main app only for app/build inputs and this site only when `download-site/` or its release function changes.

## Local preview

From the repository root, run `npx netlify-cli dev --port 8888` to preview the main app. To preview this site, run `npx netlify-cli dev --config download-site/netlify.toml --port 8889`. Release details need access to the public GitHub API.
