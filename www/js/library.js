import { createMovieCard } from "./cards.js";
import {
    clearHistory,
    getHistory,
    getMyList,
    isInMyList,
    removeFromHistory,
    removeFromMyList
} from "./storage.js";

export function createLibrary({ container, onOpen }) {
    const activeFilters = { history: "all", list: "all" };

    function renderRecent() {
        renderCollection({
            collection: "history",
            eyebrow: "YOUR LIBRARY",
            title: "Recently Watched",
            description: "Pick up a title you've played recently.",
            items: getHistory(),
            emptyText: "Titles you play will show up here.",
            clearText: "Clear history",
            removeItem: removeFromHistory,
            onClear: () => {
                clearHistory();
                renderRecent();
            }
        });
    }

    function renderMyList() {
        renderCollection({
            collection: "list",
            eyebrow: "SAVED FOR LATER",
            title: "My List",
            description: "Your saved movies and shows, all in one place.",
            items: getMyList(),
            emptyText: "Save a movie or show from its details page and it will appear here.",
            clearText: "Clear My List",
            removeItem: removeFromMyList,
            onClear: () => {
                getMyList().forEach(removeFromMyList);
                renderMyList();
            }
        });
    }

    function renderCollection({ collection, eyebrow, title, description, items, emptyText, clearText, removeItem, onClear }) {
        const currentFilter = activeFilters[collection];
        const filteredItems = currentFilter === "all"
            ? items
            : items.filter((item) => item.media_type === currentFilter);

        container.replaceChildren();
        const section = document.createElement("section");
        section.className = `history-page library-page library-page-${collection}`;

        const header = document.createElement("header");
        header.className = "history-page-header library-header";
        const label = document.createElement("p");
        label.className = "section-eyebrow";
        label.textContent = eyebrow;
        const heading = document.createElement("h2");
        heading.className = "page-title";
        heading.textContent = title;
        const supportingText = document.createElement("p");
        supportingText.className = "library-description";
        supportingText.textContent = description;

        const clearButton = document.createElement("button");
        clearButton.className = "library-clear-button";
        clearButton.type = "button";
        clearButton.textContent = clearText;
        clearButton.disabled = !items.length;
        clearButton.addEventListener("click", onClear);
        header.append(label, heading, supportingText, clearButton);
        section.appendChild(header);

        const toolbar = document.createElement("div");
        toolbar.className = "library-toolbar";
        const count = document.createElement("p");
        count.className = "library-count";
        count.textContent = `${filteredItems.length} ${filteredItems.length === 1 ? "title" : "titles"}`;
        const filters = document.createElement("div");
        filters.className = "library-filters";
        filters.setAttribute("role", "group");
        filters.setAttribute("aria-label", `Filter ${title} by type`);
        [
            { value: "all", label: "All" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV Shows" }
        ].forEach(({ value, label: filterLabel }) => {
            const button = document.createElement("button");
            button.className = "library-filter";
            button.type = "button";
            button.textContent = filterLabel;
            button.setAttribute("aria-pressed", String(currentFilter === value));
            button.addEventListener("click", () => {
                activeFilters[collection] = value;
                collection === "history" ? renderRecent() : renderMyList();
            });
            filters.appendChild(button);
        });
        toolbar.append(count, filters);
        section.appendChild(toolbar);

        if (filteredItems.length) {
            const grid = document.createElement("div");
            grid.className = "grid-container history-grid library-grid";
            filteredItems.forEach((item) => {
                const mediaType = item.media_type;
                const itemShell = document.createElement("div");
                itemShell.className = "library-item";
                const card = createMovieCard(item, {
                    type: mediaType,
                    historyEntry: collection === "history" ? item : null,
                    onOpen,
                    saved: collection === "history" && isInMyList(item, mediaType)
                });
                const removeButton = document.createElement("button");
                removeButton.className = "library-remove-button";
                removeButton.type = "button";
                removeButton.textContent = "\u00d7";
                removeButton.setAttribute("aria-label", `Remove ${item.title || item.name || "title"} from ${collection === "history" ? "history" : "My List"}`);
                removeButton.title = collection === "history" ? "Remove from history" : "Remove from My List";
                removeButton.addEventListener("click", () => {
                    removeItem(item);
                    collection === "history" ? renderRecent() : renderMyList();
                });
                itemShell.append(card, removeButton);
                grid.appendChild(itemShell);
            });
            section.appendChild(grid);
        } else {
            const empty = document.createElement("div");
            empty.className = "state-message empty-history library-empty";
            const titleText = document.createElement("strong");
            titleText.textContent = items.length ? `No ${currentFilter === "movie" ? "movies" : "TV shows"} here yet` : title === "My List" ? "Your list is ready" : "Nothing here yet";
            const message = document.createElement("span");
            message.textContent = items.length ? "Choose another filter to see more titles." : emptyText;
            empty.append(titleText, message);
            section.appendChild(empty);
        }
        container.appendChild(section);
    }

    return { renderRecent, renderMyList };
}
