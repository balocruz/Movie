import { createMovieCard } from "./cards.js";
import { clearHistory, getHistory, getMyList, isInMyList, removeFromMyList } from "./storage.js";

export function createLibrary({ container, onOpen }) {
    function renderRecent() {
        renderCollection({
            eyebrow: "YOUR LIBRARY",
            title: "Recently Watched",
            items: getHistory(),
            emptyText: "Titles you play will appear here.",
            clearText: "Clear history",
            onClear: () => {
                clearHistory();
                renderRecent();
            }
        });
    }

    function renderMyList() {
        renderCollection({
            eyebrow: "SAVED FOR LATER",
            title: "My List",
            items: getMyList(),
            emptyText: "Save a movie or series from its details page to find it here.",
            clearText: "Remove all",
            onClear: () => {
                getMyList().forEach(removeFromMyList);
                renderMyList();
            },
            removable: true
        });
    }

    function renderCollection({ eyebrow, title, items, emptyText, clearText, onClear, removable = false }) {
        container.replaceChildren();
        const section = document.createElement("section");
        section.className = "history-page library-page";
        const header = document.createElement("div");
        header.className = "history-page-header";
        const label = document.createElement("p");
        label.className = "section-eyebrow";
        label.textContent = eyebrow;
        const heading = document.createElement("h2");
        heading.className = "page-title";
        heading.textContent = title;
        const clearButton = document.createElement("button");
        clearButton.className = "see-more-btn";
        clearButton.type = "button";
        clearButton.textContent = clearText;
        clearButton.disabled = !items.length;
        clearButton.addEventListener("click", onClear);
        header.append(label, heading, clearButton);
        section.appendChild(header);

        if (items.length) {
            const grid = document.createElement("div");
            grid.className = "grid-container history-grid";
            items.forEach((item) => {
                const card = createMovieCard(item, {
                    type: item.media_type,
                    historyEntry: removable ? null : item,
                    onOpen,
                    saved: isInMyList(item, item.media_type)
                });
                grid.appendChild(card);
            });
            section.appendChild(grid);
        } else {
            const empty = document.createElement("p");
            empty.className = "state-message empty-history";
            empty.textContent = emptyText;
            section.appendChild(empty);
        }
        container.appendChild(section);
    }

    return { renderRecent, renderMyList };
}