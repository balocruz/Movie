import { TMDB_ACCESS_TOKEN } from "./config.js";
const API_ROOT = "https://api.themoviedb.org/3";

export const CATEGORIES = [
    { title: "Trending Movies", url: `${API_ROOT}/trending/movie/week`, type: "movie", featured: true },
    { title: "Popular Movies", url: `${API_ROOT}/movie/popular`, type: "movie" },
    { title: "Trending TV Shows", url: `${API_ROOT}/trending/tv/week`, type: "tv" },
    { title: "Popular TV Shows", url: `${API_ROOT}/tv/popular`, type: "tv" },
    { title: "Top Rated Movies", url: `${API_ROOT}/movie/top_rated`, type: "movie" },
    { title: "Now Playing in Theatres", url: `${API_ROOT}/movie/now_playing`, type: "movie" },
    { title: "Coming Soon", url: `${API_ROOT}/movie/upcoming`, type: "movie" },
    { title: "Top Rated TV Shows", url: `${API_ROOT}/tv/top_rated`, type: "tv" },
    { title: "Currently Airing", url: `${API_ROOT}/tv/on_the_air`, type: "tv" },
    { title: "Top 5 Action Movies", url: `${API_ROOT}/discover/movie?with_genres=28&sort_by=popularity.desc`, type: "movie", ranked: true },
    { title: "Top 5 Sci-Fi Movies", url: `${API_ROOT}/discover/movie?with_genres=878&sort_by=popularity.desc`, type: "movie", ranked: true },
    { title: "Top 5 Horror Movies", url: `${API_ROOT}/discover/movie?with_genres=27&sort_by=popularity.desc`, type: "movie", ranked: true },
    { title: "Top 5 Adventure Movies", url: `${API_ROOT}/discover/movie?with_genres=12&sort_by=popularity.desc`, type: "movie", ranked: true },
    { title: "Top 5 Thrillers", url: `${API_ROOT}/discover/movie?with_genres=53&sort_by=popularity.desc`, type: "movie", ranked: true },
    { title: "Top 5 Crime Series", url: `${API_ROOT}/discover/tv?with_genres=80&sort_by=popularity.desc`, type: "tv", ranked: true },
    { title: "Top 5 Sci-Fi Series", url: `${API_ROOT}/discover/tv?with_genres=10765&sort_by=popularity.desc`, type: "tv", ranked: true },
    { title: "Top 5 Drama Series", url: `${API_ROOT}/discover/tv?with_genres=18&sort_by=popularity.desc`, type: "tv", ranked: true },
    { title: "Popular Anime Series", url: `${API_ROOT}/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc`, type: "tv", ranked: true, anime: true },
    { title: "Top Rated Anime", url: `${API_ROOT}/discover/tv?with_genres=16&with_origin_country=JP&sort_by=vote_average.desc&vote_count.gte=100`, type: "tv", ranked: true, anime: true },
    { title: "Anime Movies", url: `${API_ROOT}/discover/movie?with_genres=16&with_origin_country=JP&sort_by=popularity.desc`, type: "movie", ranked: true, anime: true },
    { title: "Trending Anime", url: `${API_ROOT}/trending/tv/week`, type: "tv", ranked: true, animeTrending: true }
];

const responseCache = new Map();
const CACHE_TTL_MS = 120_000;

export async function apiGet(pathOrUrl) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_ROOT}${pathOrUrl}`;
    const cached = responseCache.get(url);
    if (cached?.data && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
    if (cached?.promise) return cached.promise;
    const promise = fetch(url, {
        headers: {
            accept: "application/json",
            Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
        }
    }).then((response) => {
        if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
        return response.json();
    }).then((data) => {
        responseCache.set(url, { data, timestamp: Date.now() });
        return data;
    }).catch((error) => {
        responseCache.delete(url);
        throw error;
    });
    responseCache.set(url, { promise, timestamp: Date.now() });
    return promise;
}

export function getYear(dateString) {
    return dateString ? dateString.slice(0, 4) : "N/A";
}

export function imageUrl(path, size = "w500") {
    return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

export function mediaTitle(item) {
    return item.title || item.name || "Untitled";
}
