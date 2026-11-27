const RELEASES_URL = 'https://api.github.com/repos/balocruz/Movie/releases?per_page=20';
const LATEST_RELEASE_URL = 'https://api.github.com/repos/balocruz/Movie/releases/latest';

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'MoviesHub-download-site',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

exports.handler = async function () {
  let upstream;
  let latest;
  try {
    [upstream, latest] = await Promise.all([
      fetch(RELEASES_URL, { headers: githubHeaders() }),
      fetch(LATEST_RELEASE_URL, { headers: githubHeaders() })
    ]);
  } catch {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'GitHub release information is temporarily unavailable.' })
    };
  }

  if (!upstream.ok) {
    return {
      statusCode: upstream.status === 403 ? 503 : 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        error: upstream.status === 403
          ? 'GitHub temporarily rate limited release requests. Please try again shortly.'
          : 'GitHub release information is temporarily unavailable.'
      })
    };
  }

  const releases = await upstream.json();
  const latestRelease = latest.ok ? await latest.json() : null;
  const orderedReleases = latestRelease
    ? [latestRelease, ...releases.filter((release) => release.id !== latestRelease.id)]
    : releases;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=900, stale-while-revalidate=3600'
    },
    body: JSON.stringify(orderedReleases)
  };
};
