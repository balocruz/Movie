import { apiGet, CATEGORIES } from "./api.js";
import { createMovieCard } from "./cards.js";

const MAX_PARALLEL_HOME_REQUESTS = 2;
const ROW_SIZE = 5;

export function createCatalog({ container, onOpen, isPlaying, minimizePlayer, onFeatured, onFeaturedError, onHomeReady, onHomeStart, onExpanded }) {
    let currentCategory = null;
    let currentPage = 1;
    let totalPages = 1;
    let isLoadingMore = false;
    let catalogRequestId = 0;
    let homeObserver = null;
    let activeHomeLoads = 0;
    let homeQueue = [];
    let homeSections = [];

    function createSection(category) {
        const section = document.createElement("section");
        section.className = `category-row${category.ranked ? " is-ranked" : ""}${category.anime ? " is-anime" : ""}`;
        section.dataset.categoryTitle = category.title;

        const header = document.createElement("div");
        header.className = "category-header-wrapper";
        const heading = document.createElement("h2");
        heading.className = "category-title";
        heading.textContent = category.title;
        header.appendChild(heading);

        const more = document.createElement("button");
        more.className = "see-more-btn";
        more.type = "button";
        more.textContent = "See all";
        more.addEventListener("click", () => showExpanded(category));
        header.appendChild(more);
        section.appendChild(header);

        const row = document.createElement("div");
        row.className = "horizontal-row";
        row.setAttribute("aria-label", category.title);
        section.appendChild(row);
        return section;
    }

    function renderItems(row, items, category) {
        row.replaceChildren();
        const unique = new Map();
        (items || []).forEach((item) => {
            if (item && item.id && item.media_type !== "person" && !unique.has(item.id)) unique.set(item.id, item);
        });
        const matchingItems = [...unique.values()].filter((item) => !category.animeTrending
            || (item.genre_ids || []).includes(16) && (item.origin_country || []).includes("JP"));
        matchingItems.slice(0, category.ranked ? ROW_SIZE : 20).forEach((item, index) => {
            const card = createMovieCard(item, { type: category.type, onOpen });
            card.dataset.tmdbId = String(item.id);
            if (category.ranked) {
                card.classList.add("ranked-movie-card");
                card.dataset.rank = String(index + 1);
                card.setAttribute("aria-label", `${category.title}, number ${index + 1}: ${item.title || item.name || "Untitled"}`);
            }
            row.appendChild(card);
        });
        if (!row.childElementCount) {
            const empty = document.createElement("p");
            empty.className = "catalog-inline-state";
            empty.textContent = category.animeTrending
                ? "No Japanese-origin anime appeared in this week's trending TV results."
                : "No titles are available in this section right now.";
            row.appendChild(empty);
        }
    }

    function finishHomeRequest(category, section, requestId, data, error = null) {
        if (requestId !== catalogRequestId) return;
        const row = section.querySelector(".horizontal-row");
        section.classList.remove("is-loading");
        section.dataset.loading = "false";
        if (error) {
            const message = document.createElement("p");
            message.className = "catalog-inline-state";
            message.textContent = "This row couldn't load.";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "catalog-retry";
            retry.textContent = "Try again";
            retry.addEventListener("click", () => enqueueHomeCategory(category, section, requestId));
            row.replaceChildren(message, retry);
            console.warn(`Failed loading ${category.title}:`, error);
        } else {
            section.dataset.loaded = "true";
            const items = data?.results || [];
            if (category.featured) onFeatured?.(items);
            renderItems(row, items, category);
        }
        if (category.featured) {
            if (error) onFeaturedError?.(error);
            onHomeReady?.();
        }
    }

    function pumpHomeQueue() {
        while (activeHomeLoads < MAX_PARALLEL_HOME_REQUESTS && homeQueue.length) {
            const task = homeQueue.shift();
            if (task.requestId !== catalogRequestId) continue;
            activeHomeLoads++;
            apiGet(task.category.url)
                .then((data) => finishHomeRequest(task.category, task.section, task.requestId, data))
                .catch((error) => finishHomeRequest(task.category, task.section, task.requestId, null, error))
                .finally(() => {
                    activeHomeLoads--;
                    pumpHomeQueue();
                });
        }
    }

    function enqueueHomeCategory(category, section, requestId) {
        if (requestId !== catalogRequestId || section.dataset.loaded === "true" || section.dataset.loading === "true") return;
        section.dataset.loading = "true";
        section.classList.add("is-loading");
        homeQueue.push({ category, section, requestId });
        pumpHomeQueue();
    }

    function loadHome() {
        const requestId = ++catalogRequestId;
        currentCategory = null;
        homeQueue = [];
        homeObserver?.disconnect();
        homeObserver = null;
        homeSections = [];
        onHomeStart?.();
        container.replaceChildren();
        if (!navigator.onLine) {
            onFeaturedError?.();
            onHomeReady?.();
            showOfflineState();
            return;
        }

        const sections = CATEGORIES.map((category) => {
            const section = createSection(category);
            section.classList.add("is-loading");
            section.dataset.loading = "false";
            section.dataset.loaded = "false";
            container.appendChild(section);
            return { category, section };
        });
        homeSections = sections;
        if ("IntersectionObserver" in window) {
            homeObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const section = entry.target;
                    homeObserver.unobserve(section);
                    const record = sections.find((item) => item.section === section);
                    if (record) {
                        enqueueHomeCategory(record.category, section, requestId);
                    }
                });
            }, { rootMargin: "500px 0px", threshold: 0.01 });
            sections.forEach(({ section }) => homeObserver.observe(section));
        } else {
            sections.slice(0, 3).forEach(({ category, section }) => enqueueHomeCategory(category, section, requestId));
        }
    }

    function showOfflineState() {
        const status = document.createElement("div");
        status.className = "state-message offline-state";
        status.setAttribute("role", "status");
        const message = document.createElement("p");
        message.textContent = navigator.onLine
            ? "Couldn't load movies and shows. Check your connection and try again."
            : "You're offline. Connect to the internet, then try again.";
        const retry = document.createElement("button");
        retry.className = "secondary-action";
        retry.type = "button";
        retry.textContent = "Retry";
        retry.addEventListener("click", loadHome);
        status.append(message, retry);
        container.replaceChildren(status);
    }

    async function loadGenre(movieGenreId, tvGenreId, genreName) {
        const requestId = ++catalogRequestId;
        homeObserver?.disconnect();
        homeSections = [];
        homeQueue = [];
        currentCategory = null;
        container.replaceChildren();
        const categories = [];
        if (movieGenreId) categories.push({ title: `${genreName} Movies`, url: `https://api.themoviedb.org/3/discover/movie?with_genres=${movieGenreId}&sort_by=popularity.desc`, type: "movie" });
        if (tvGenreId) categories.push({ title: `${genreName} TV Shows`, url: `https://api.themoviedb.org/3/discover/tv?with_genres=${tvGenreId}&sort_by=popularity.desc`, type: "tv" });
        try {
            const results = await Promise.all(categories.map(async (category) => ({ category, items: (await apiGet(category.url)).results || [] })));
            if (requestId !== catalogRequestId) return;
            results.forEach(({ category, items }) => {
                const section = createSection(category);
                renderItems(section.querySelector(".horizontal-row"), items, category);
                container.appendChild(section);
            });
            if (!results.length || !results.some(({ items }) => items.length)) showMessage(`No ${genreName.toLowerCase()} titles found.`);
        } catch (error) {
            if (requestId !== catalogRequestId) return;
            console.error("Genre fetch failed:", error);
            showMessage(`Could not load ${genreName.toLowerCase()} titles. Please try again.`);
        }
    }

    function showResults(title, items, emptyMessage = "No titles found.") {
        catalogRequestId++;
        homeObserver?.disconnect();
        homeSections = [];
        currentCategory = null;
        container.replaceChildren();
        if (!items.length) {
            showMessage(emptyMessage);
            return;
        }
        const category = { title, type: null };
        const section = createSection(category);
        section.querySelector(".see-more-btn").hidden = true;
        renderItems(section.querySelector(".horizontal-row"), items, category);
        container.appendChild(section);
    }

    function showMessage(message, loading = false) {
        const status = document.createElement("p");
        status.className = loading ? "state-message is-loading" : "state-message";
        status.textContent = message;
        container.replaceChildren(status);
    }

    async function showExpanded(category) {
        catalogRequestId++;
        homeObserver?.disconnect();
        homeQueue = [];
        homeSections = [];
        currentCategory = category;
        onExpanded?.();
        currentPage = 1;
        totalPages = 1;
        if (isPlaying()) minimizePlayer();
        container.replaceChildren();

        const section = document.createElement("section");
        section.className = "expanded-category";
        const back = document.createElement("button");
        back.type = "button";
        back.className = "back-button";
        back.textContent = "Back to titles";
        back.addEventListener("click", loadHome);
        const heading = document.createElement("h2");
        heading.className = "page-title";
        heading.textContent = category.title;
        const grid = document.createElement("div");
        grid.id = "expanded-grid";
        grid.className = "grid-container";
        const loader = document.createElement("p");
        loader.id = "infinite-loader";
        loader.className = "loading-indicator active";
        loader.textContent = "Loading titles...";
        section.append(back, heading, grid, loader);
        container.appendChild(section);
        await fetchNextPage();
    }

    async function fetchNextPage() {
        if (!currentCategory || isLoadingMore || currentPage > totalPages) return;
        isLoadingMore = true;
        const loader = document.getElementById("infinite-loader");
        if (loader) loader.classList.add("active");
        try {
            const separator = currentCategory.url.includes("?") ? "&" : "?";
            const data = await apiGet(`${currentCategory.url}${separator}page=${currentPage}`);
            totalPages = data.total_pages || 1;
            const grid = document.getElementById("expanded-grid");
            if (grid && currentCategory) {
                const existingIds = new Set(Array.from(grid.querySelectorAll("[data-tmdb-id]"), (card) => card.dataset.tmdbId));
                (data.results || [])
                    .filter((item) => item.media_type !== "person")
                    .filter((item) => !currentCategory.animeTrending || (item.genre_ids || []).includes(16) && (item.origin_country || []).includes("JP"))
                    .filter((item) => item.id && !existingIds.has(String(item.id)))
                    .forEach((item) => {
                        const card = createMovieCard(item, { type: currentCategory.type, onOpen });
                        card.dataset.tmdbId = String(item.id);
                        grid.appendChild(card);
                    });
                currentPage++;
            }
        } catch (error) {
            console.error("Failed loading category titles:", error);
            if (loader) loader.textContent = "Could not load titles. Scroll to retry.";
        } finally {
            isLoadingMore = false;
            if (loader && currentPage > totalPages) loader.classList.remove("active");
        }
    }

    function onScroll() {
        if (!homeObserver && homeSections.length) {
            const requestId = catalogRequestId;
            homeSections.forEach(({ category, section }) => {
                if (section.dataset.loaded === "true" || section.dataset.loading === "true") return;
                const rect = section.getBoundingClientRect();
                if (rect.top < window.innerHeight + 500 && rect.bottom > -100) enqueueHomeCategory(category, section, requestId);
            });
        }
        if (currentCategory && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 400) fetchNextPage();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });
    window.addEventListener("online", () => { if (container.querySelector(".offline-state")) loadHome(); });
    return { loadHome, loadGenre, showResults, showMessage };
}
