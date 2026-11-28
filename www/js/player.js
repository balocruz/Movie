import { apiGet } from "./api.js";
import { saveHistory } from "./storage.js";

export function createPlayer({ onHistoryChange, onPlayerVisibilityChange }) {
    const video = document.getElementById("player");
    const container = document.getElementById("player-container");
    const title = document.getElementById("player-title");
    const subtitle = document.getElementById("player-subtitle");
    const controlsHost = document.getElementById("tv-controls-host");
    const minimizeButton = document.getElementById("pip-player-btn");
    const miniPlayerDragHandle = document.querySelector(".player-heading");
    const miniPlayerResizeHandle = document.getElementById("resize-mini-player-btn");
    let playing = false;
    let requestId = 0;
    let selectedItem = null;
    let selectedType = "movie";

    function resetMiniPlayerGeometry() {
        ["left", "top", "right", "bottom", "width"].forEach((property) => {
            container.style.removeProperty(property);
        });
    }

    const servers = [
        ["superembed", "Server 1 (SuperEmbed)"],
        ["videasy", "Server 2 (Videasy)"],
        ["vidlink", "Server 3 (VidLink)"],
        ["smashystream", "Server 4 (SmashyStream)"],
        ["multiembed", "Server 5 (MultiEmbed)"],
        ["vidsrc", "Server 6 (VidSrc Me)"],
        ["2embed", "Server 7 (2Embed)"]
    ];

    function show() {
        resetMiniPlayerGeometry();
        container.classList.remove("pip-mode");
        container.classList.add("player-open");
        document.body.classList.add("player-is-open");
        onPlayerVisibilityChange?.(true);
        minimizeButton.textContent = "Minimize";
        minimizeButton.setAttribute("aria-label", "Minimize player");
    }

    function minimize() {
        if (!playing) return;
        if (document.fullscreenElement === container) {
            document.exitFullscreen().catch((error) => console.error("Could not exit fullscreen:", error));
        }
        container.classList.remove("player-open");
        container.classList.add("pip-mode");
        document.body.classList.remove("player-is-open");
        minimizeButton.textContent = "Expand";
        minimizeButton.setAttribute("aria-label", "Restore player");
    }

    function close() {
        requestId++;
        container.classList.remove("player-open", "pip-mode");
        container.style.removeProperty("display");
        document.body.classList.remove("player-is-open");
        minimizeButton.textContent = "Minimize";
        minimizeButton.setAttribute("aria-label", "Minimize player");
        if (document.fullscreenElement === container) {
            document.exitFullscreen().catch((error) => console.error("Could not exit fullscreen:", error));
        }
        video.src = "";
        playing = false;
        onPlayerVisibilityChange?.(false);
    }

    function buildControls(type, seasons = []) {
        controlsHost.replaceChildren();
        const controls = document.createElement("div");
        controls.id = "tv-controls";
        controls.className = "tv-selector-container";
        const serverGroup = document.createElement("div");
        serverGroup.className = "selector-group selector-server";
        const serverLabel = document.createElement("label");
        serverLabel.htmlFor = "server-select";
        serverLabel.textContent = "Server:";
        const serverSelect = document.createElement("select");
        serverSelect.id = "server-select";
        servers.forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            serverSelect.appendChild(option);
        });
        serverGroup.append(serverLabel, serverSelect);
        controls.appendChild(serverGroup);

        if (type === "tv") {
            const seasonGroup = document.createElement("div");
            seasonGroup.className = "selector-group selector-season";
            const seasonLabel = document.createElement("label");
            seasonLabel.htmlFor = "season-select";
            seasonLabel.textContent = "Season:";
            const seasonSelect = document.createElement("select");
            seasonSelect.id = "season-select";
            seasons.forEach((season) => {
                const option = document.createElement("option");
                option.value = season.season_number;
                option.textContent = `Season ${season.season_number}`;
                seasonSelect.appendChild(option);
            });
            seasonGroup.append(seasonLabel, seasonSelect);

            const episodeGroup = document.createElement("div");
            episodeGroup.className = "selector-group selector-episode";
            const episodeLabel = document.createElement("label");
            episodeLabel.htmlFor = "episode-select";
            episodeLabel.textContent = "Episode:";
            const episodeSelect = document.createElement("select");
            episodeSelect.id = "episode-select";
            const loadingOption = document.createElement("option");
            loadingOption.textContent = "Loading...";
            episodeSelect.appendChild(loadingOption);
            episodeGroup.append(episodeLabel, episodeSelect);
            controls.append(seasonGroup, episodeGroup);
        }
        controlsHost.appendChild(controls);
        return {
            serverSelect,
            seasonSelect: document.getElementById("season-select"),
            episodeSelect: document.getElementById("episode-select")
        };
    }

    async function play(item, type, historyEntry = null) {
        const currentRequest = ++requestId;
        selectedItem = item;
        selectedType = type;
        playing = true;
        show();
        title.textContent = item.title || item.name || "Now Playing";
        subtitle.textContent = type === "tv" ? "Choose a season and episode" : "Movie";

        let seasons = [];
        if (type === "tv") {
            try {
                const data = await apiGet(`/tv/${item.id}?language=en-US`);
                if (currentRequest !== requestId) return;
                seasons = (data.seasons || []).filter((season) => season.season_number > 0);
                if (!seasons.length) seasons = data.seasons || [];
            } catch (error) {
                if (currentRequest === requestId) {
                    console.error("TV details failed:", error);
                    subtitle.textContent = "Could not load show details.";
                }
            }
        }

        const { serverSelect, seasonSelect, episodeSelect } = buildControls(type, seasons);
        const loadEpisodes = async (seasonNumber) => {
            if (!episodeSelect) return;
            episodeSelect.replaceChildren();
            const loading = document.createElement("option");
            loading.textContent = "Loading...";
            episodeSelect.appendChild(loading);
            try {
                const data = await apiGet(`/tv/${item.id}/season/${seasonNumber}?language=en-US`);
                if (currentRequest !== requestId) return;
                episodeSelect.replaceChildren();
                (data.episodes || []).forEach((episode) => {
                    const option = document.createElement("option");
                    option.value = episode.episode_number;
                    option.textContent = `Episode ${episode.episode_number}${episode.name ? ` · ${episode.name}` : ""}`;
                    episodeSelect.appendChild(option);
                });
                if (!episodeSelect.options.length) {
                    subtitle.textContent = "No episodes are available for this season.";
                    return;
                }
                if (historyEntry && Number(historyEntry.season) === Number(seasonNumber)) {
                    episodeSelect.value = String(historyEntry.episode);
                }
                updateEmbedUrl();
            } catch (error) {
                if (currentRequest === requestId) subtitle.textContent = "Could not load episodes.";
            }
        };

        if (seasonSelect) {
            const savedSeason = seasons.some((season) => Number(season.season_number) === Number(historyEntry?.season));
            if (savedSeason) seasonSelect.value = String(historyEntry.season);
            seasonSelect.addEventListener("change", () => loadEpisodes(seasonSelect.value));
            episodeSelect.addEventListener("change", updateEmbedUrl);
            await loadEpisodes(seasonSelect.value || seasons[0]?.season_number || 1);
        }
        serverSelect.addEventListener("change", updateEmbedUrl);
        if (!seasonSelect) updateEmbedUrl();
    }

    function updateEmbedUrl() {
        if (!selectedItem) return;
        const server = document.getElementById("server-select")?.value || "superembed";
        const season = document.getElementById("season-select")?.value || 1;
        const episode = document.getElementById("episode-select")?.value || 1;
        const id = selectedItem.id;

        if (selectedType === "tv") {
            if (server === "superembed") video.src = `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
            else if (server === "videasy") video.src = `https://player.videasy.net/tv/${id}/${season}/${episode}`;
            else if (server === "vidlink") video.src = `https://vidlink.pro/tv/${id}/${season}/${episode}`;
            else if (server === "smashystream") video.src = `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${season}&episode=${episode}`;
            else if (server === "multiembed") video.src = `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
            else if (server === "vidsrc") video.src = `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`;
            else video.src = `https://www.2embed.cc/embedtv/${id}?s=${season}&e=${episode}`;
        } else {
            if (server === "superembed") video.src = `https://multiembed.mov/?video_id=${id}&tmdb=1`;
            else if (server === "videasy") video.src = `https://player.videasy.net/movie/${id}`;
            else if (server === "vidlink") video.src = `https://vidlink.pro/movie/${id}`;
            else if (server === "smashystream") video.src = `https://embed.smashystream.com/playere.php?tmdb=${id}`;
            else if (server === "multiembed") video.src = `https://multiembed.mov/?video_id=${id}&tmdb=1`;
            else if (server === "vidsrc") video.src = `https://vidsrc.me/embed/movie?tmdb=${id}`;
            else video.src = `https://www.2embed.cc/embed/${id}`;
        }

        const selectedSeason = document.getElementById("season-select")?.value || 1;
        const selectedEpisode = document.getElementById("episode-select")?.value || 1;
        saveHistory(selectedItem, selectedType, selectedSeason, selectedEpisode);
        subtitle.textContent = selectedType === "tv"
            ? `Season ${selectedSeason}, Episode ${selectedEpisode}`
            : "Movie";
        onHistoryChange();
    }

    document.getElementById("close-pip-btn").addEventListener("click", close);
    document.getElementById("close-mini-player-btn").addEventListener("click", close);
    minimizeButton.addEventListener("click", () => {
        container.classList.contains("pip-mode") ? show() : minimize();
    });
    document.getElementById("fullscreen-player-btn").addEventListener("click", async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await container.requestFullscreen();
        } catch (error) {
            console.error("Could not change fullscreen mode:", error);
        }
    });

    miniPlayerDragHandle.addEventListener("pointerdown", (event) => {
        if (!container.classList.contains("pip-mode") || event.button !== 0) return;
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = rect.left;
        const startTop = rect.top;
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
        miniPlayerDragHandle.setPointerCapture(event.pointerId);

        const move = (pointerEvent) => {
            const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
            const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
            const left = Math.min(maxLeft, Math.max(8, startLeft + pointerEvent.clientX - startX));
            const top = Math.min(maxTop, Math.max(8, startTop + pointerEvent.clientY - startY));
            container.style.left = `${left}px`;
            container.style.top = `${top}px`;
        };
        const stop = () => {
            miniPlayerDragHandle.removeEventListener("pointermove", move);
            miniPlayerDragHandle.removeEventListener("pointerup", stop);
            miniPlayerDragHandle.removeEventListener("pointercancel", stop);
        };

        miniPlayerDragHandle.addEventListener("pointermove", move);
        miniPlayerDragHandle.addEventListener("pointerup", stop, { once: true });
        miniPlayerDragHandle.addEventListener("pointercancel", stop, { once: true });
    });

    miniPlayerResizeHandle.addEventListener("pointerdown", (event) => {
        if (!container.classList.contains("pip-mode") || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = container.getBoundingClientRect();
        const headerHeight = container.querySelector(".player-header").getBoundingClientRect().height;
        const startX = event.clientX;
        const startWidth = rect.width;
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
        miniPlayerResizeHandle.setPointerCapture(event.pointerId);

        const move = (pointerEvent) => {
            const minWidth = Math.min(210, window.innerWidth - 16);
            const maxByWidth = window.innerWidth - 16;
            const availableHeight = window.innerHeight - rect.top - headerHeight - 34;
            const maxByHeight = Math.max(minWidth, availableHeight * 16 / 9);
            const maxWidth = Math.max(minWidth, Math.min(maxByWidth, maxByHeight));
            const width = Math.min(maxWidth, Math.max(minWidth, startWidth + pointerEvent.clientX - startX));
            container.style.width = `${width}px`;
        };
        const stop = () => {
            miniPlayerResizeHandle.removeEventListener("pointermove", move);
            miniPlayerResizeHandle.removeEventListener("pointerup", stop);
            miniPlayerResizeHandle.removeEventListener("pointercancel", stop);
        };

        miniPlayerResizeHandle.addEventListener("pointermove", move);
        miniPlayerResizeHandle.addEventListener("pointerup", stop, { once: true });
        miniPlayerResizeHandle.addEventListener("pointercancel", stop, { once: true });
    });

    miniPlayerResizeHandle.addEventListener("keydown", (event) => {
        if (!container.classList.contains("pip-mode") || !event.key.startsWith("Arrow")) return;
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const headerHeight = container.querySelector(".player-header").getBoundingClientRect().height;
        const minWidth = Math.min(210, window.innerWidth - 16);
        const availableHeight = window.innerHeight - rect.top - headerHeight - 34;
        const maxWidth = Math.max(minWidth, Math.min(window.innerWidth - 16, availableHeight * 16 / 9));
        const increase = event.key === "ArrowRight" || event.key === "ArrowDown";
        const width = Math.min(maxWidth, Math.max(minWidth, rect.width + (increase ? 16 : -16)));
        container.style.width = `${width}px`;
    });

    document.addEventListener("keydown", (event) => {
        if ((event.key === "Escape" || event.key === "Backspace") && container.classList.contains("player-open")) close();
    });

    return { play, minimize, close, isPlaying: () => playing };
}
