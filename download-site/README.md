# MoviesHub APK download site

This static vanilla HTML/CSS/JavaScript site is served from the repository's `download-site/` directory. It reads public release metadata from `balocruz/Movie` and links to the APK attached to each stable GitHub Release. No GitHub token is used in browser code.

## Netlify setup

Connect this repository to Netlify and leave the repository root as the base directory. The root `netlify.toml` sets `download-site` as the publish directory. The existing Android app remains in `www/`; it is not the download site's publish directory. The root config retains the existing `netlify/functions` location.

## Local preview

Open `index.html` with a local static web server, or use Netlify Dev from the repository root. GitHub's public Releases API must be reachable for release details to load.
