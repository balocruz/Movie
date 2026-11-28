import { apiGet } from "./api.js";
import { createMovieCard } from "./cards.js";

const RECENT_SEARCHES_KEY = "cruzflix.recentSearches.v1";
const TRENDING_PATH = "/trending/all/week?language=en-US&page=1";

export function createSearch({
    input,
    button,
    clearButton,
    experience,
    content,
    genres,
    onModeChange,
    onGenre,
    onOpen
}) {
    let debounceTimer = null;
    let requestId = 0;
    let discoveryRequestId = 0;
    let isOpen = false;
    let activeType = "all";
    let activeGenre = "";
    let activeYear = "";
    let minimumRating = 0;
    const resultCache = new Map();
    const inFlight = new Map();
    let trendingPromise;

    function setMode(open) {
        isOpen = open;
        experience.hidden = !open;
        onModeChange?.(open);
    }

    function readRecentSearches() {
        try {
            const searches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
            return Array.isArray(searches) ? searches.filter((term) => typeof term === "string") : [];
        } catch {
            return [];
        }
    }

    function rememberSearch(query) {
        const normalized = query.trim();
        if (!normalized) return;
        const searches = [normalized, ...readRecentSearches().filter((term) => term.toLowerCase() !== normalized.toLowerCase())].slice(0, 6);
        try {
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
        } catch (error) {
            console.warn("Could not save recent searches:", error);
        }
    }

    function createSectionTitle(title, detail = "") {
        const header = document.createElement("div");
        header.className = "search-section-heading";
        const heading = document.createElement("h3");
        heading.textContent = title;
        header.appendChild(heading);
        if (detail) {
            const note = document.createElement("span");
            note.textContent = detail;
            header.appendChild(note);
        }
        return header;
    }

    function createSearchSkeletons(count = 6) {
        return Array.from({ length: count }, () => {
            const skeleton = document.createElement("div");
            skeleton.className = "search-skeleton-card";
            skeleton.setAttribute("aria-hidden", "true");
            const poster = document.createElement("span");
            poster.className = "search-skeleton-poster";
            const title = document.createElement("span");
            title.className = "search-skeleton-line search-skeleton-title";
            const detail = document.createElement("span");
            detail.className = "search-skeleton-line search-skeleton-detail";
            skeleton.append(poster, title, detail);
            return skeleton;
        });
    }

    function renderDiscovery() {
        const renderId = ++discoveryRequestId;
        content.replaceChildren();
        const recent = readRecentSearches();
        if (recent.length) {
            const section = document.createElement("section");
            section.className = "search-discovery-section recent-searches";
            section.appendChild(createSectionTitle("Recent searches"));
            const chips = document.createElement("div");
            chips.className = "search-discovery-chips";
            recent.forEach((term) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "search-discovery-chip";
                chip.textContent = term;
                chip.addEventListener("click", () => runSearch(term, true));
                chips.appendChild(chip);
            });
            section.appendChild(chips);
            content.appendChild(section);
        }

        if (genres.length) {
            const section = document.createElement("section");
            section.className = "search-discovery-section popular-genres";
            section.appendChild(createSectionTitle("Browse by genre"));
            const chips = document.createElement("div");
            chips.className = "search-discovery-chips";
            genres.forEach((genre) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "search-discovery-chip genre-discovery-chip";
                chip.textContent = genre.label;
                chip.addEventListener("click", () => onGenre?.(genre));
                chips.appendChild(chip);
            });
            section.appendChild(chips);
            content.appendChild(section);
        }

        const trendingSection = document.createElement("section");
        trendingSection.className = "search-discovery-section trending-discovery";
        trendingSection.appendChild(createSectionTitle("Trending this week"));
        const grid = document.createElement("div");
        grid.className = "grid-container search-discovery-grid";
        const status = document.createElement("p");
        status.className = "state-message search-status";
        status.setAttribute("role", "status");
        status.textContent = "Loading popular titles...";
        grid.replaceChildren(...createSearchSkeletons(8));
        trendingSection.append(grid, status);
        content.appendChild(trendingSection);

        if (!trendingPromise) trendingPromise = apiGet(TRENDING_PATH);
        trendingPromise.then((data) => {
            if (renderId !== discoveryRequestId || !isOpen || input.value.trim()) return;
            const items = (data.results || []).filter((item) => item.media_type === "movie" || item.media_type === "tv").slice(0, 10);
            grid.replaceChildren(...items.map((item) => createMovieCard(item, {
                type: item.media_type,
                onOpen
            })));
            status.textContent = items.length ? "" : "No trending titles are available right now.";
            status.hidden = Boolean(items.length);
        }).catch((error) => {
            if (renderId !== discoveryRequestId) return;
            trendingPromise = null;
            console.error("Trending search discovery failed:", error);
            status.replaceChildren();
            const message = document.createElement("span");
            message.textContent = "Popular titles are unavailable right now.";
            const retry = document.createElement("button");
            retry.className = "secondary-action";
            retry.type = "button";
            retry.textContent = "Try again";
            retry.addEventListener("click", renderDiscovery);
            status.append(message, retry);
        });
    }

    function ensureMode() {
        const shouldRenderDiscovery = !isOpen || experience.hidden;
        setMode(true);
        if (!input.value.trim() && shouldRenderDiscovery) renderDiscovery();
    }

    function buildResultPage(query) {
        content.replaceChildren();
        const header = document.createElement("div");
        header.className = "search-results-heading";
        const title = document.createElement("h2");
        title.textContent = `Results for "${query}"`;
        const count = document.createElement("p");
        count.className = "search-results-count";
        header.append(title, count);

        const toolbar = document.createElement("div");
        toolbar.className = "search-results-toolbar";
        const typeFilters = document.createElement("div");
        typeFilters.className = "search-type-filters";
        typeFilters.setAttribute("role", "group");
        typeFilters.setAttribute("aria-label", "Filter search results by media type");
        const grid = document.createElement("div");
        grid.className = "grid-container search-results-grid";
        const status = document.createElement("p");
        status.className = "state-message search-status";
        status.setAttribute("role", "status");

        let resultItems = [];
        const renderGrid = () => {
            const selectedGenre = genres.find((genre) => genre.label === activeGenre);
            const filtered = resultItems.filter((item) => {
                const type = item.media_type;
                if (activeType !== "all" && type !== activeType) return false;
                if (activeYear) {
                    const date = item.release_date || item.first_air_date || "";
                    if (date.slice(0, 4) !== activeYear) return false;
                }
                const rating = Number(item.vote_average) || 0;
                if (minimumRating > 0 && rating < minimumRating) return false;
                if (selectedGenre) {
                    const id = type === "tv" ? selectedGenre.tvId : selectedGenre.movieId;
                    if (!id || !(item.genre_ids || []).includes(Number(id))) return false;
                }
                return true;
            });
            count.textContent = `${filtered.length} ${filtered.length === 1 ? "title" : "titles"}`;
            if (activeType === "all") {
                const groups = [
                    { type: "movie", label: "Movies" },
                    { type: "tv", label: "TV Shows" }
                ].map(({ type, label }) => {
                    const items = filtered.filter((item) => item.media_type === type);
                    if (!items.length) return null;
                    const section = document.createElement("section");
                    section.className = "search-result-group";
                    const heading = document.createElement("h3");
                    heading.textContent = `${label} (${items.length})`;
                    const cards = document.createElement("div");
                    cards.className = "grid-container search-result-type-grid";
                    cards.append(...items.map((item) => createMovieCard(item, { type, onOpen })));
                    section.append(heading, cards);
                    return section;
                }).filter(Boolean);
                grid.replaceChildren(...groups);
            } else {
                grid.replaceChildren(...filtered.map((item) => createMovieCard(item, { type: item.media_type, onOpen })));
            }
            status.hidden = filtered.length > 0;
            if (!resultItems.length) {
                status.textContent = "No results found. Try another title.";
            } else if (!filtered.length) {
                status.textContent = "No titles match these filters. Adjust the filters to see more.";
            }
        };

        const typeOptions = [
            { value: "all", label: "All" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV Shows" }
        ];
        typeOptions.forEach(({ value, label }) => {
            const filter = document.createElement("button");
            filter.type = "button";
            filter.className = "search-type-filter";
            filter.textContent = label;
            filter.setAttribute("aria-pressed", String(activeType === value));
            filter.addEventListener("click", () => {
                activeType = value;
                typeFilters.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === filter)));
                renderGrid();
            });
            typeFilters.appendChild(filter);
        });

        const advanced = document.createElement("details");
        advanced.className = "search-advanced-filters";
        const summary = document.createElement("summary");
        summary.textContent = "Filters";
        advanced.appendChild(summary);
        const fields = document.createElement("div");
        fields.className = "search-filter-fields";

        const genreLabel = document.createElement("label");
        genreLabel.textContent = "Genre";
        const genreSelect = document.createElement("select");
        genreSelect.setAttribute("aria-label", "Filter by genre");
        const anyGenre = document.createElement("option");
        anyGenre.value = "";
        anyGenre.textContent = "Any genre";
        genreSelect.appendChild(anyGenre);
        genres.forEach((genre) => {
            const option = document.createElement("option");
            option.value = genre.label;
            option.textContent = genre.label;
            genreSelect.appendChild(option);
        });
        genreSelect.value = activeGenre;
        genreLabel.appendChild(genreSelect);
        genreSelect.addEventListener("change", () => {
            activeGenre = genreSelect.value;
            renderGrid();
        });

        const yearLabel = document.createElement("label");
        yearLabel.textContent = "Release year";
        const yearInput = document.createElement("input");
        yearInput.type = "number";
        yearInput.min = "1900";
        yearInput.max = String(new Date().getFullYear());
        yearInput.inputMode = "numeric";
        yearInput.placeholder = "Any year";
        yearInput.value = activeYear;
        yearInput.setAttribute("aria-label", "Filter by release year");
        yearLabel.appendChild(yearInput);
        yearInput.addEventListener("input", () => {
            activeYear = yearInput.value.trim();
            renderGrid();
        });

        const ratingLabel = document.createElement("label");
        ratingLabel.className = "search-rating-filter";
        const ratingTitle = document.createElement("span");
        ratingTitle.textContent = "Minimum rating";
        const ratingControl = document.createElement("span");
        ratingControl.className = "search-rating-control";
        const ratingInput = document.createElement("input");
        ratingInput.type = "range";
        ratingInput.min = "0";
        ratingInput.max = "9";
        ratingInput.step = "0.5";
        ratingInput.value = String(minimumRating);
        const ratingValue = document.createElement("output");
        ratingValue.textContent = minimumRating ? `${minimumRating.toFixed(1)}+` : "Any";
        ratingControl.append(ratingInput, ratingValue);
        ratingLabel.append(ratingTitle, ratingControl);
        ratingInput.addEventListener("input", () => {
            minimumRating = Number(ratingInput.value);
            ratingValue.textContent = minimumRating ? `${minimumRating.toFixed(1)}+` : "Any";
            renderGrid();
        });
        fields.append(genreLabel, yearLabel, ratingLabel);
        advanced.appendChild(fields);
        toolbar.append(typeFilters, advanced);
        content.append(header, toolbar, grid, status);

        return {
            setItems(items) {
                resultItems = items;
                renderGrid();
            },
            setLoading() {
                resultItems = [];
                grid.replaceChildren(...createSearchSkeletons(8));
                count.textContent = "";
                status.hidden = false;
                status.textContent = "Searching...";
            },
            setError(message, retry) {
                resultItems = [];
                grid.replaceChildren();
                count.textContent = "";
                status.hidden = false;
                status.replaceChildren();
                const text = document.createElement("span");
                text.textContent = message;
                const retryButton = document.createElement("button");
                retryButton.className = "secondary-action";
                retryButton.type = "button";
                retryButton.textContent = "Try again";
                retryButton.addEventListener("click", retry);
                status.append(text, retryButton);
            }
        };
    }

    async function fetchResults(query) {
        const key = query.toLowerCase();
        if (resultCache.has(key)) return resultCache.get(key);
        if (!inFlight.has(key)) {
            const request = apiGet(`/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`)
                .then((data) => {
                    const results = (data.results || []).filter((item) => item.media_type === "movie" || item.media_type === "tv");
                    resultCache.set(key, results);
                    if (resultCache.size > 24) resultCache.delete(resultCache.keys().next().value);
                    return results;
                })
                .finally(() => inFlight.delete(key));
            inFlight.set(key, request);
        }
        return inFlight.get(key);
    }

    async function runSearch(query = input.value.trim(), saveRecent = false) {
        const normalized = query.trim();
        clearTimeout(debounceTimer);
        input.value = normalized;
        updateClearButton();
        ensureMode();
        if (normalized.length < 2) {
            renderDiscovery();
            return;
        }
        if (saveRecent) rememberSearch(normalized);
        const currentRequest = ++requestId;
        const page = buildResultPage(normalized);
        page.setLoading();
        try {
            const results = await fetchResults(normalized);
            if (currentRequest !== requestId || !isOpen || input.value.trim().toLowerCase() !== normalized.toLowerCase()) return;
            page.setItems(results);
        } catch (error) {
            if (currentRequest !== requestId) return;
            console.error("Search failed:", error);
            page.setError("Search is unavailable right now. Check your connection and try again.", () => runSearch(normalized, false));
        }
    }

    function openDiscovery() {
        ensureMode();
    }

    function updateClearButton() {
        clearButton.hidden = !input.value;
    }

    function close() {
        clearTimeout(debounceTimer);
        requestId++;
        discoveryRequestId++;
        input.value = "";
        updateClearButton();
        setMode(false);
        content.replaceChildren();
    }

    input.addEventListener("focus", openDiscovery);
    input.addEventListener("input", () => {
        updateClearButton();
        ensureMode();
        const query = input.value.trim();
        clearTimeout(debounceTimer);
        if (query.length < 2) {
            requestId++;
            renderDiscovery();
            if (query.length === 1) {
                const note = document.createElement("p");
                note.className = "search-input-hint";
                note.textContent = "Type one more character to search.";
                content.prepend(note);
            }
            return;
        }
        debounceTimer = window.setTimeout(() => runSearch(query), 340);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runSearch(input.value, true);
        } else if (event.key === "Escape") {
            input.blur();
            close();
        }
    });
    button.addEventListener("click", () => runSearch(input.value, true));
    clearButton.addEventListener("click", () => {
        input.value = "";
        updateClearButton();
        setMode(true);
        renderDiscovery();
        input.focus();
    });

    return { runSearch, openDiscovery, close };
}
