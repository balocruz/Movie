const RELEASES_URL = 'https://api.github.com/repos/balocruz/Movie/releases?per_page=20';
const LATEST_RELEASE_URL = 'https://api.github.com/repos/balocruz/Movie/releases/latest';
const ALLOWED_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

function responseHeaders(origin, cacheControl = 'no-store') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'Vary': 'Origin'
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Accept, Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'MoviesHub-download-site',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

exports.handler = async function (event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return { statusCode: 403, headers: responseHeaders(''), body: JSON.stringify({ error: 'Origin not allowed.' }) };
  }
  if (event?.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: responseHeaders(origin), body: '' };
  }
  if (event?.httpMethod && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: responseHeaders(origin), body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

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
      headers: responseHeaders(origin),
      body: JSON.stringify({ error: 'GitHub release information is temporarily unavailable.' })
    };
  }

  if (!upstream.ok) {
    return {
      statusCode: upstream.status === 403 ? 503 : 502,
      headers: responseHeaders(origin),
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
      ...responseHeaders(origin, 'public, max-age=300'),
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=300, stale-while-revalidate=300'
    },
    body: JSON.stringify(orderedReleases)
  };
};
