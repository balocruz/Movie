import { TMDB_ACCESS_TOKEN } from "./config.js";
const API_ROOT = "https://api.themoviedb.org/3";

export const CATEGORIES = [
    { title: "Trending Movies", url: `${API_ROOT}/trending/movie/week`, type: "movie" },
    { title: "Popular Movies", url: `${API_ROOT}/movie/popular`, type: "movie" },
    { title: "Trending TV Shows", url: `${API_ROOT}/trending/tv/week`, type: "tv" },
    { title: "Popular TV Shows", url: `${API_ROOT}/tv/popular`, type: "tv" }
];

export async function apiGet(pathOrUrl) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_ROOT}${pathOrUrl}`;
    const response = await fetch(url, {
        headers: {
            accept: "application/json",
            Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`
        }
    });
    if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
    return response.json();
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