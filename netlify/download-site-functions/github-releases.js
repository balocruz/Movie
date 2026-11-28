const RELEASES_URL = 'https://api.github.com/repos/balocruz/Movie/releases?per_page=20';
const LATEST_RELEASE_URL = 'https://api.github.com/repos/balocruz/Movie/releases/latest';

function responseHeaders(cacheControl = 'no-store') {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'MoviesHub-download-site',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

exports.handler = async function (event) {
  const method = event?.httpMethod || 'GET';
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: responseHeaders(), body: '' };
  }
  if (method !== 'GET') {
    return { statusCode: 405, headers: responseHeaders(), body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  try {
    const [upstream, latest] = await Promise.all([
      fetch(RELEASES_URL, { headers: githubHeaders() }),
      fetch(LATEST_RELEASE_URL, { headers: githubHeaders() })
    ]);

    if (!upstream.ok) {
      return {
        statusCode: upstream.status === 403 ? 503 : 502,
        headers: responseHeaders(),
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
        ...responseHeaders('public, max-age=300'),
        'Netlify-CDN-Cache-Control': 'public, durable, max-age=300, stale-while-revalidate=300'
      },
      body: JSON.stringify(orderedReleases)
    };
  } catch {
    return {
      statusCode: 502,
      headers: responseHeaders(),
      body: JSON.stringify({ error: 'GitHub release information is temporarily unavailable.' })
    };
  }
};
