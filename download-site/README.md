# MoviesHub APK download site

This static vanilla HTML/CSS/JavaScript site is served from the repository's `download-site/` directory. It reads public release metadata from `balocruz/Movie` through a small Netlify Function that caches successful responses. No GitHub token is used in browser code.

## Netlify setup

Keep the existing Netlify site connected to the repository root; the root `netlify.toml` publishes the main app from `www/`. For the download site, create a second Netlify site connected to this repository and set its **Base directory** to `download-site`. The `download-site/netlify.toml` publishes the base itself (`.`). Each site's ignore rule skips builds when files outside that site change.

## Local preview

Open `index.html` with a local static web server, or use Netlify Dev from the repository root. GitHub's public Releases API must be reachable for release details to load.
