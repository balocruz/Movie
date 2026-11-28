const HISTORY_KEY = "movieshub.watchHistory.v1";
const MY_LIST_KEY = "movieshub.myList.v1";
const MAX_HISTORY_ITEMS = 20;
const MAX_SAVED_ITEMS = 100;

function readCollection(key) {
    try {
        const items = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(items) ? items.filter((item) => item && item.id !== undefined) : [];
    } catch (error) {
        console.warn(`Could not read ${key}:`, error);
        return [];
    }
}

function writeCollection(key, items) {
    try {
        localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_SAVED_ITEMS)));
        return true;
    } catch (error) {
        console.warn(`Could not save ${key}:`, error);
        return false;
    }
}

function normalizeItem(item, type) {
    return {
        ...item,
        id: item.id,
        media_type: type || item.media_type || (item.first_air_date ? "tv" : "movie"),
        title: item.title || item.name || "Untitled"
    };
}

function sameItem(left, right) {
    return String(left.id) === String(right.id) && left.media_type === right.media_type;
}

export function getHistory() {
    return readCollection(HISTORY_KEY).filter((item) =>
        item.media_type === "movie" || item.media_type === "tv"
    );
}

export function saveHistory(item, type, season = 1, episode = 1) {
    const entry = {
        ...normalizeItem(item, type),
        season: type === "tv" ? Number(season) || 1 : null,
        episode: type === "tv" ? Number(episode) || 1 : null,
        updated_at: Date.now()
    };
    writeCollection(HISTORY_KEY, [entry, ...getHistory().filter((saved) => !sameItem(saved, entry)).slice(0, MAX_HISTORY_ITEMS - 1)]);
}

export function clearHistory() {
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
        console.warn("Could not clear watch history:", error);
    }
}

export function removeFromHistory(item) {
    writeCollection(HISTORY_KEY, getHistory().filter((saved) => !sameItem(saved, item)));
}

export function getMyList() {
    return readCollection(MY_LIST_KEY).filter((item) =>
        item.media_type === "movie" || item.media_type === "tv"
    );
}

function compactLibraryItems(items) {
    return items.slice(0, 8).map((item) => {
        const mediaType = item.media_type;
        const title = String(item.title || item.name || "").trim().slice(0, 100);
        const date = mediaType === "tv" ? item.first_air_date : item.release_date;
        return {
            id: Number(item.id),
            media_type: mediaType,
            title,
            year: /^\d{4}/.test(date || "") ? date.slice(0, 4) : "",
            genre_ids: Array.isArray(item.genre_ids)
                ? [...new Set(item.genre_ids.map(Number).filter(Number.isInteger))].slice(0, 8)
                : [],
            overview: String(item.overview || "").replace(/\s+/g, " ").trim().slice(0, 140)
        };
    }).filter((item) => Number.isInteger(item.id) && item.id > 0 && item.title);
}

// Read the existing collections only when the current request explicitly asks
// Maya to personalize recommendations using the user's saved/watch activity.
export function getMayaLibraryContext(prompt) {
    const text = String(prompt || "").toLowerCase();
    const asksForRecommendations = /\b(?:recommend|recommendations?|suggest|suggestions?|what should i watch|what to watch|find .*similar|movies? like|shows? like|similar to|what should i watch next)\b/.test(text);
    if (!asksForRecommendations) return null;
    const asksNextWatch = /\bwhat should i watch next\b|\bwhat to watch next\b|\bwhat should i watch now\b/.test(text);
    const asksUnwatched = /\b(?:not|haven't|have not|never) watched\b|\bunwatched\b|\bnew to me\b|\bnot seen\b/.test(text);
    const asksWatchedContext = asksUnwatched
        || /\b(?:watch|viewing) history\b|\bwatched (?:movies|shows|titles|content)\b|\bthings i(?:'ve| have) watched\b|\bwhat i watched\b/.test(text);
    const asksListContext = /\bmy list\b|\bsaved (?:movies|shows|titles|items)\b|\bthings i saved\b/.test(text);
    const asksActivityContext = /\b(?:based on|using|from) my (?:movieshub )?activity\b|\bbased on my (?:watching|viewing)\b/.test(text);

    const useWatched = asksNextWatch || asksActivityContext || asksWatchedContext;
    const useMyList = asksNextWatch || asksActivityContext || asksListContext;
    if (!useWatched && !useMyList) return null;

    return {
        watched: useWatched ? compactLibraryItems(getHistory()) : [],
        myList: useMyList ? compactLibraryItems(getMyList()) : [],
        sources: { watched: useWatched, myList: useMyList },
        excludeWatched: asksUnwatched
    };
}

export function isInMyList(item, type) {
    const normalized = normalizeItem(item, type);
    return getMyList().some((saved) => sameItem(saved, normalized));
}

export function toggleMyList(item, type) {
    const normalized = normalizeItem(item, type);
    const list = getMyList();
    const exists = list.some((saved) => sameItem(saved, normalized));
    const next = exists
        ? list.filter((saved) => !sameItem(saved, normalized))
        : [normalized, ...list];
    return writeCollection(MY_LIST_KEY, next) && !exists;
}

export function removeFromMyList(item) {
    writeCollection(MY_LIST_KEY, getMyList().filter((saved) => !sameItem(saved, item)));
}
