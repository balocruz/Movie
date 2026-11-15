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

export function getMyList() {
    return readCollection(MY_LIST_KEY).filter((item) =>
        item.media_type === "movie" || item.media_type === "tv"
    );
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