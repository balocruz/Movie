# Android APK releases

The `Android release` GitHub Actions workflow builds a signed APK on each push to `main` and on demand from **Actions → Android release → Run workflow**. It sets version codes to `10000 + GitHub workflow run number`, and version names to `1.0.<run number>`. Each successful run publishes `MoviesHub.apk` on a stable GitHub Release tagged `v1.0.<run number>`. The download site reads that release and prior stable releases directly from the public GitHub Releases API.

## Repository Actions secrets

In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the release `.jks`/`.keystore` file (single line) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing key alias |
| `ANDROID_KEY_PASSWORD` | Signing key password |
| `TMDB_ACCESS_TOKEN` | The same TMDB access token used by the app's local `.env` |
| `GEMINI_FUNCTION_URL` | Optional deployed Netlify chat function URL; may be left unset if the default path is correct |

Keep a secure backup of the keystore. Future APKs must use the same signing key for Android to recognize them as updates. Never commit the keystore or its passwords. The workflow writes the decoded keystore only to the temporary GitHub runner directory and uses GitHub's masked secrets for credentials.

For PowerShell, create the one-line secret value with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\release-keystore.jks'))
```

For macOS/Linux:

```sh
base64 -w 0 release-keystore.jks
```

## Trigger and inspect a build

Push a commit to `main`, or manually run the workflow from the GitHub Actions tab. A successful job verifies the APK signature, then creates a release with the version tag and `MoviesHub.apk`. The download page updates from the public API on page load; no download URL needs to be edited. A build will fail early if signing credentials or `TMDB_ACCESS_TOKEN` are missing.

To verify the full path, run the workflow manually, confirm the job succeeds, open its GitHub Release and download `MoviesHub.apk`, then visit the Netlify site and check the displayed version, file size, release notes, and download button. Install the APK on an Android device/emulator to confirm the signed package can be installed. Release notes are GitHub-generated unless you edit them on the release page.

## Netlify sites

Keep the existing main app site at the repository root; the root `netlify.toml` publishes `www/`. Deploy the APK website as a second Netlify site connected to this repository, with **Base directory** set to `download-site`. That site uses `download-site/netlify.toml` and publishes `.`. The per-site ignore rules skip builds for commits that do not change that site's files.
