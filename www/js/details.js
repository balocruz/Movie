import { apiGet, getYear, imageUrl, mediaTitle } from "./api.js";
import { isInMyList, toggleMyList } from "./storage.js";

export function createDetails({ page, browseContent, genreBar, onBack, onPlay, onListChange }) {
    const backButton = document.getElementById("details-back");
    const backdrop = document.getElementById("details-backdrop");
    const typeLabel = document.getElementById("details-type");
    const title = document.getElementById("details-title");
    const metadata = document.getElementById("details-meta");
    const genres = document.getElementById("details-genres");
    const overview = document.getElementById("details-overview");
    const playButton = document.getElementById("details-play");
    const listButton = document.getElementById("details-list");
    let activeTitle = null;
    let requestId = 0;

    function updateListButton() {
        const saved = activeTitle && isInMyList(activeTitle.item, activeTitle.type);
        listButton.textContent = saved ? "Added to My List" : "Add to My List";
        listButton.setAttribute("aria-pressed", String(Boolean(saved)));
    }

    function setGenres(items) {
        genres.replaceChildren();
        (items || []).forEach((genre) => {
            const tag = document.createElement("span");
            tag.className = "detail-genre";
            tag.textContent = genre.name;
            genres.appendChild(tag);
        });
    }

    function show(item, type, historyEntry = null) {
        const id = ++requestId;
        const itemType = type || item.media_type || (item.first_air_date ? "tv" : "movie");
        activeTitle = { item: { ...item, media_type: itemType }, type: itemType, historyEntry };
        browseContent.hidden = true;
        page.hidden = false;
        genreBar.hidden = true;
        typeLabel.textContent = itemType === "tv" ? "TV" : "FILM";
        title.textContent = mediaTitle(item);
        metadata.textContent = `${getYear(item.release_date || item.first_air_date)}  ·  ★ ${Number(item.vote_average) ? Number(item.vote_average).toFixed(1) : "N/A"}`;
        overview.textContent = item.overview || "Loading title information...";
        backdrop.src = imageUrl(item.backdrop_path || item.poster_path, "w1280");
        backdrop.hidden = !backdrop.src;
        setGenres([]);
        updateListButton();
        playButton.onclick = () => onPlay(activeTitle.item, activeTitle.type, activeTitle.historyEntry);
        listButton.onclick = () => {
            const saved = toggleMyList(activeTitle.item, activeTitle.type);
            updateListButton();
            onListChange(saved);
        };

        apiGet(`/${itemType}/${item.id}?language=en-US`).then((details) => {
            if (id !== requestId) return;
            activeTitle.item = { ...activeTitle.item, ...details, media_type: itemType };
            title.textContent = mediaTitle(details);
            overview.textContent = details.overview || "No overview is available for this title.";
            setGenres(details.genres);
            const date = details.release_date || details.first_air_date;
            const rating = Number(details.vote_average) ? `★ ${Number(details.vote_average).toFixed(1)}` : "Unrated";
            const runtime = itemType === "movie"
                ? details.runtime
                : (details.episode_run_time || [])[0];
            const runtimeText = runtime ? `${runtime} min` : "";
            metadata.textContent = [getYear(date), rating, runtimeText].filter(Boolean).join("  ·  ");
            backdrop.src = imageUrl(details.backdrop_path || details.poster_path, "w1280");
            backdrop.hidden = !backdrop.src;
            updateListButton();
        }).catch((error) => {
            if (id !== requestId) return;
            console.error("Could not load title details:", error);
            overview.textContent = item.overview || "Title details are unavailable right now.";
        });
    }

    function close() {
        requestId++;
        page.hidden = true;
        browseContent.hidden = false;
        genreBar.hidden = false;
        onBack();
    }

    backButton.addEventListener("click", close);
    return { show, close };
}