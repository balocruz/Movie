# Android APK releases

The `Android release` workflow runs only when a `v*` tag is pushed or when someone starts it from GitHub Actions. A tag such as `v1.1.0` creates version name `1.1.0`; a manual run asks for the version name. The Android version code increases for each workflow run. Ordinary commits do not build or publish an APK.

## GitHub Actions secrets

In GitHub, open **Settings > Secrets and variables > Actions > New repository secret** and add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the release `.jks`/`.keystore` file (single line) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Signing key password |
| `TMDB_ACCESS_TOKEN` | The TMDB access token used by the app |
| `GEMINI_FUNCTION_URL` | Optional public URL for the Netlify chat function used by native Android |

Keep a secure backup of the keystore. Future APKs must use the same signing key for Android to recognize them as updates. Never commit the keystore or its passwords. The workflow writes the decoded keystore only to the temporary GitHub runner directory.

On the main app's Netlify site, set `TMDB_ACCESS_TOKEN` for the build and `GEMINI_API_KEY` for the chat function. Keep the Gemini key in Netlify environment variables; it does not belong in the browser or repository.

For PowerShell, create the one-line keystore secret with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\release-keystore.jks'))
```

For macOS/Linux:

```sh
base64 -w 0 release-keystore.jks
```

## Run and inspect a build

Push a new version tag such as `v1.1.0`, or manually run the workflow from the GitHub Actions tab and enter the desired release version. A successful job verifies the APK signature and publishes `MoviesHub.apk` to GitHub Releases. The download page reads the release GitHub marks as latest; no download URL needs to be edited. A build fails if signing credentials or `TMDB_ACCESS_TOKEN` are missing.

## Netlify sites

Both Netlify sites use the repository root as their **Base directory** (leave this field blank). On the main app site, leave **Package directory** blank; the root `netlify.toml` publishes `www/` and deploys `netlify/functions/`. On the APK site, set **Package directory** to `download-site`; its `netlify.toml` publishes `download-site/` and uses `netlify/download-site-functions/`. Do not set the main app's Package directory to `download-site`, or it will serve the APK page instead. Each site's ignore rule skips commits outside its source files.
