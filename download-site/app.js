const repo = 'balocruz/Movie';
const api = '/.netlify/functions/github-releases?v=2';
const publicApi = `https://api.github.com/repos/${repo}/releases?per_page=20`;
const autoDownloadLatest = new URLSearchParams(window.location.search).get('download') === 'latest';
const fallbackNotes = 'No notes were included with this update.';
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function apkAsset(release) {
  return (release.assets || []).find((asset) => asset.name.toLowerCase() === 'movieshub.apk' || asset.name.toLowerCase().endsWith('.apk'));
}
function formatSize(bytes) {
  if (!bytes) return 'File size unavailable';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function renderNotes(body) {
  const groups = [];
  let current = { title: "What's new", items: [] };
  groups.push(current);
  (body || fallbackNotes).split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      current = { title: heading[1].replace(/[*_`]/g, '').trim(), items: [] };
      groups.push(current);
      return;
    }
    const item = line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (item) current.items.push(item);
  });
  const populated = groups.filter((group) => group.items.length);
  if (!populated.length) populated.push({ title: "What's new", items: [fallbackNotes] });
  return populated.map((group) => `<section class="release-note-group"><h3>${escapeHTML(group.title)}</h3><ul>${group.items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul></section>`).join('');
}
async function releaseNotesFor(release) {
  try {
    const path = `release-notes/${encodeURIComponent(release.tag_name)}.md`;
    const response = await fetch(path);
    if (response.ok) return response.text();
  } catch {
    // Older releases may not have a site-side notes file.
  }
  return release.body || fallbackNotes;
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
function startRequestedDownload() {
  if (!autoDownloadLatest) return;
  const link = document.querySelector('#download');
  if (!link || link.getAttribute('aria-disabled') !== 'false' || !link.href) return;

  history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  document.querySelector('#release-meta').textContent = 'Starting the APK download. If it does not begin, tap Download APK.';
  link.click();
}
function renderRelease(release, isLatest, notes) {
  const asset = apkAsset(release);
  const version = release.tag_name.replace(/^v/i, '');
  const published = release.published_at ? dateFormat.format(new Date(release.published_at)) : 'Date unavailable';
  if (isLatest) {
    document.querySelector('#version').textContent = `Version ${version} for Android`;
    document.querySelector('#release-number').textContent = `v${version}`;
    document.querySelector('#release-title').textContent = release.name || `MoviesHub ${version}`;
    document.querySelector('#release-date').textContent = `Released ${published}`;
    document.querySelector('#release-notes').innerHTML = renderNotes(notes);
    const link = document.querySelector('#download');
    if (asset) {
      link.href = asset.browser_download_url;
      link.setAttribute('aria-disabled', 'false');
      document.querySelector('#download-label').textContent = 'Download APK';
      document.querySelector('#release-meta').textContent = `${formatSize(asset.size)} · Released ${published}`;
    } else {
      link.removeAttribute('href');
      document.querySelector('#download-label').textContent = 'APK not attached';
      document.querySelector('#release-meta').textContent = 'This release doesn’t have an APK yet.';
    }
  }
  return `<article class="release-item"><b>v${escapeHTML(version)}</b><span>${escapeHTML(release.name || 'MoviesHub for Android')}</span><time>${escapeHTML(published)}</time>${asset ? `<a href="${escapeHTML(asset.browser_download_url)}">${formatSize(asset.size)} · Download APK ↗</a>` : '<span>No APK for this version</span>'}</article>`;
}
async function loadReleases() {
  try {
    const releases = (await fetchReleases()).filter((release) => !release.draft && !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name));
    if (!releases.length) throw new Error('No Android releases are available yet.');
    const latest = releases[0];
    document.querySelector('#release-list').innerHTML = releases.slice(1).length ? releases.slice(1).map((release) => renderRelease(release, false)).join('') : '<p class="muted">This is the first release. Earlier versions will show up here when they’re available.</p>';
    renderRelease(latest, true, latest.body || fallbackNotes);
    startRequestedDownload();

    const latestNotes = await releaseNotesFor(latest);
    document.querySelector('#release-notes').innerHTML = renderNotes(latestNotes);
  } catch (error) {
    document.querySelector('#version').textContent = 'Couldn’t load the latest version';
    document.querySelector('#download-label').textContent = 'Download unavailable right now';
    document.querySelector('#release-meta').textContent = 'We couldn’t load the latest release. Try again shortly.';
    document.querySelector('#release-title').textContent = "What's new is unavailable";
    document.querySelector('#release-notes').textContent = 'Please refresh the page in a little while.';
    document.querySelector('#release-list').innerHTML = '<p class="muted">We couldn’t load previous versions. Try again shortly.</p>';
  }
}
document.querySelector('#year').textContent = new Date().getFullYear();
loadReleases();
