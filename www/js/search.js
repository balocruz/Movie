import { apiGet, getYear, imageUrl, mediaTitle } from "./api.js";

export function createSearch({ input, button, suggestions, onSearch, onSearchState, onOpen }) {
    let debounceTimer = null;
    let requestId = 0;
    let suggestionId = 0;

    function hideSuggestions() {
        suggestionId++;
        suggestions.hidden = true;
        suggestions.replaceChildren();
    }

    async function submit() {
        const query = input.value.trim();
        hideSuggestions();
        if (!query) return;
        const currentRequest = ++requestId;
        onSearchState(`Searching for “${query}”…`, true);
        try {
            const data = await apiGet(`/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`);
            if (currentRequest === requestId) onSearch(query, (data.results || []).filter((item) => item.media_type !== "person"));
        } catch (error) {
            if (currentRequest === requestId) {
                console.error("Search failed:", error);
                onSearchState("Search is unavailable right now. Please try again.", false);
            }
        }
    }

    async function showSuggestions(query) {
        const currentRequest = ++suggestionId;
        if (query.length < 2) {
            hideSuggestions();
            return;
        }
        suggestions.replaceChildren();
        const status = document.createElement("div");
        status.className = "suggestion-status";
        status.textContent = "Searching...";
        suggestions.appendChild(status);
        suggestions.hidden = false;

        try {
            const data = await apiGet(`/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`);
            if (currentRequest !== suggestionId || query !== input.value.trim()) return;
            const items = (data.results || [])
                .filter((item) => item.media_type === "movie" || item.media_type === "tv")
                .slice(0, 5);
            suggestions.replaceChildren();
            if (!items.length) {
                status.textContent = "No matching titles";
                suggestions.appendChild(status);
                return;
            }
            items.forEach((item) => {
                const itemType = item.media_type;
                const option = document.createElement("button");
                option.type = "button";
                option.className = "search-suggestion";
                option.setAttribute("role", "option");
                const image = document.createElement("img");
                image.src = imageUrl(item.poster_path, "w92");
                image.alt = "";
                const details = document.createElement("span");
                details.className = "suggestion-details";
                const name = document.createElement("strong");
                name.textContent = mediaTitle(item);
                const meta = document.createElement("span");
                meta.textContent = `${itemType === "tv" ? "Series" : "Movie"} · ${getYear(item.release_date || item.first_air_date)}`;
                details.append(name, meta);
                option.append(image, details);
                option.addEventListener("click", () => {
                    input.value = mediaTitle(item);
                    hideSuggestions();
                    onOpen(item, itemType);
                });
                suggestions.appendChild(option);
            });
        } catch (error) {
            if (currentRequest !== suggestionId) return;
            console.error("Suggestions failed:", error);
            status.textContent = "Suggestions unavailable";
            suggestions.replaceChildren(status);
        }
    }

    button.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submit();
        } else if (event.key === "ArrowDown" && !suggestions.hidden) {
            event.preventDefault();
            suggestions.querySelector(".search-suggestion")?.focus();
        } else if (event.key === "Escape") {
            hideSuggestions();
        }
    });
    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => showSuggestions(input.value.trim()), 240);
    });
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".search-box")) hideSuggestions();
    });

    return { submit, hideSuggestions };
}