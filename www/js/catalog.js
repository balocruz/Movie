import { apiGet, CATEGORIES, imageUrl } from "./api.js";
import { createMovieCard } from "./cards.js";

export function createCatalog({ container, onOpen, isPlaying, minimizePlayer }) {
    let currentCategory = null;
    let currentPage = 1;
    let totalPages = 1;
    let isLoadingMore = false;
    let catalogRequestId = 0;

    function renderCategory(title, items, type, category = null) {
        if (!items.length) return;
        const section = document.createElement("section");
        section.className = "category-row";

        const header = document.createElement("div");
        header.className = "category-header-wrapper";
        const heading = document.createElement("h2");
        heading.className = "category-title";
        heading.textContent = title;
        header.appendChild(heading);

        if (category) {
            const more = document.createElement("button");
            more.className = "see-more-btn";
            more.type = "button";
            more.textContent = "See More";
            more.addEventListener("click", () => showExpanded(category));
            header.appendChild(more);
        }
        section.appendChild(header);

        const row = document.createElement("div");
        row.className = "horizontal-row";
        items.filter((item) => item.media_type !== "person").forEach((item) => {
            row.appendChild(createMovieCard(item, { type, onOpen }));
        });
        section.appendChild(row);
        container.appendChild(section);
    }

    async function loadHome() {
        const requestId = ++catalogRequestId;
        currentCategory = null;
        container.replaceChildren();
        for (const category of CATEGORIES) {
            try {
                const data = await apiGet(category.url);
                if (requestId !== catalogRequestId) return;
                renderCategory(category.title, data.results || [], category.type, category);
            } catch (error) {
                console.error(`Failed loading ${category.title}:`, error);
            }
        }
    }

    async function loadGenre(movieGenreId, tvGenreId, genreName) {
        const requestId = ++catalogRequestId;
        currentCategory = null;
        container.replaceChildren();
        const categories = [];
        if (movieGenreId) categories.push({
            title: `${genreName} Movies`,
            url: `https://api.themoviedb.org/3/discover/movie?with_genres=${movieGenreId}`,
            type: "movie"
        });
        if (tvGenreId) categories.push({
            title: `${genreName} TV Shows`,
            url: `https://api.themoviedb.org/3/discover/tv?with_genres=${tvGenreId}`,
            type: "tv"
        });

        try {
            const results = await Promise.all(categories.map(async (category) => ({
                category,
                items: (await apiGet(category.url)).results || []
            })));
            if (requestId !== catalogRequestId) return;
            results.forEach(({ category, items }) => renderCategory(category.title, items, category.type, category));
            if (!results.some(({ items }) => items.length)) showMessage(`No ${genreName.toLowerCase()} titles found.`);
        } catch (error) {
            if (requestId !== catalogRequestId) return;
            console.error("Genre fetch failed:", error);
            showMessage(`Could not load ${genreName.toLowerCase()} titles. Please try again.`);
        }
    }

    function showResults(title, items, emptyMessage = "No titles found.") {
        catalogRequestId++;
        currentCategory = null;
        container.replaceChildren();
        if (!items.length) {
            showMessage(emptyMessage);
            return;
        }
        renderCategory(title, items, null);
    }

    function showMessage(message, loading = false) {
        const status = document.createElement("p");
        status.className = loading ? "state-message is-loading" : "state-message";
        status.textContent = message;
        container.replaceChildren(status);
    }

    async function showExpanded(category) {
        catalogRequestId++;
        currentCategory = category;
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
                (data.results || []).filter((item) => item.media_type !== "person").forEach((item) => {
                    grid.appendChild(createMovieCard(item, { type: currentCategory.type, onOpen }));
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
        if (currentCategory && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 400) {
            fetchNextPage();
        }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });

    return { loadHome, loadGenre, showResults, showMessage };
}