const repo = 'balocruz/Movie';
const api = '/.netlify/functions/github-releases';
const publicApi = `https://api.github.com/repos/${repo}/releases?per_page=20`;
const fallbackNotes = 'No release notes were added for this version.';
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function apkAsset(release) {
  return (release.assets || []).find((asset) => asset.name.toLowerCase() === 'movieshub.apk' || asset.name.toLowerCase().endsWith('.apk'));
}
function formatSize(bytes) {
  if (!bytes) return 'Size unavailable';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function renderNotes(body) {
  const lines = (body || fallbackNotes).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = lines.map((line) => line.replace(/^[-*]\s*/, '')).filter(Boolean);
  return `<ul>${items.map((line) => `<li>${escapeHTML(line)}</li>`).join('')}</ul>`;
}
async function fetchReleases() {
  let response = await fetch(api, { headers: { Accept: 'application/json' } });
  if (response.status === 404 && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    response = await fetch(publicApi, { headers: { Accept: 'application/vnd.github+json' } });
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Release service returned ${response.status}`);
  return body;
}
function renderRelease(release, isLatest) {
  const asset = apkAsset(release);
  const version = release.tag_name.replace(/^v/i, '');
  const published = release.published_at ? dateFormat.format(new Date(release.published_at)) : 'Date unavailable';
  if (isLatest) {
    document.querySelector('#version').textContent = `Version ${version} · Android`;
    document.querySelector('#release-number').textContent = `v${version}`;
    document.querySelector('#release-title').textContent = release.name || `MoviesHub ${version}`;
    document.querySelector('#release-date').textContent = `Released ${published}`;
    document.querySelector('#release-notes').innerHTML = renderNotes(release.body);
    const link = document.querySelector('#download');
    if (asset) {
      link.href = asset.browser_download_url;
      link.setAttribute('aria-disabled', 'false');
      document.querySelector('#download-label').textContent = 'Download APK';
      document.querySelector('#release-meta').textContent = `${formatSize(asset.size)} · Released ${published}`;
    } else {
      link.removeAttribute('href');
      document.querySelector('#download-label').textContent = 'APK not attached';
      document.querySelector('#release-meta').textContent = 'This release does not include an APK yet.';
    }
  }
  return `<article class="release-item"><b>v${escapeHTML(version)}</b><span>${escapeHTML(release.name || 'MoviesHub for Android')}</span><time>${escapeHTML(published)}</time>${asset ? `<a href="${escapeHTML(asset.browser_download_url)}">${formatSize(asset.size)} · Download ↗</a>` : '<span>No APK attached</span>'}</article>`;
}
async function loadReleases() {
  try {
    const releases = (await fetchReleases()).filter((release) => !release.draft && !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name));
    if (!releases.length) throw new Error('No published version is available yet.');
    document.querySelector('#release-list').innerHTML = releases.slice(1).length ? releases.slice(1).map((release) => renderRelease(release, false)).join('') : '<p class="muted">This is the first published version. Earlier releases will appear here.</p>';
    renderRelease(releases[0], true);
  } catch (error) {
    document.querySelector('#version').textContent = 'Release information unavailable';
    document.querySelector('#download-label').textContent = 'Try again later';
    document.querySelector('#release-meta').textContent = error.message;
    document.querySelector('#release-title').textContent = 'Release notes are not available yet';
    document.querySelector('#release-notes').textContent = 'Publish a stable GitHub release with an APK asset to display its details here.';
    document.querySelector('#release-list').innerHTML = '<p class="muted">No published releases found.</p>';
  }
}
document.querySelector('#year').textContent = new Date().getFullYear();
loadReleases();
