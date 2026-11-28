import { apiGet, getYear, imageUrl, mediaTitle } from "./api.js";
import { createMovieCard } from "./cards.js";
import { isInMyList, toggleMyList } from "./storage.js";

export function createDetails({ page, browseContent, genreBar, onBack, onPlay, onListChange }) {
    const backButton = document.getElementById("details-back");
    const hero = page.querySelector(".details-hero");
    const backdrop = document.getElementById("details-backdrop");
    const typeLabel = document.getElementById("details-type");
    const title = document.getElementById("details-title");
    const metadata = document.getElementById("details-meta");
    const genres = document.getElementById("details-genres");
    const fullOverview = document.getElementById("details-full-overview");
    const facts = document.getElementById("details-facts");
    const playButton = document.getElementById("details-play");
    const listButton = document.getElementById("details-list");
    const status = document.getElementById("details-status");
    const statusMessage = document.getElementById("details-status-message");
    const retryButton = document.getElementById("details-retry");
    const crewSection = document.getElementById("details-crew-section");
    const crewContainer = document.getElementById("details-crew");
    const castSection = document.getElementById("details-cast-section");
    const castContainer = document.getElementById("details-cast");
    const tvSection = document.getElementById("details-tv-section");
    const seasonSelect = document.getElementById("details-season");
    const episodesContainer = document.getElementById("details-episodes");
    const recommendationsSection = document.getElementById("details-recommendations-section");
    const recommendationsContainer = document.getElementById("details-recommendations");

    let activeTitle = null;
    let requestId = 0;
    let seasonRequestId = 0;

    function updateListButton() {
        const saved = activeTitle && isInMyList(activeTitle.item, activeTitle.type);
        listButton.textContent = saved ? "Added to My List" : "Add to My List";
        listButton.setAttribute("aria-pressed", String(Boolean(saved)));
    }

    function setGenres(items) {
        genres.replaceChildren();
        (items || []).forEach((genre) => {
            if (!genre?.name) return;
            const tag = document.createElement("span");
            tag.className = "detail-genre";
            tag.textContent = genre.name;
            genres.appendChild(tag);
        });
    }

    function setFacts(item, type) {
        facts.replaceChildren();
        const entries = type === "tv"
            ? [
                ["First aired", item.first_air_date],
                ["Seasons", item.number_of_seasons ? String(item.number_of_seasons) : ""],
                ["Episodes", item.number_of_episodes ? String(item.number_of_episodes) : ""],
                ["Rating", Number(item.vote_average) > 0 ? `${Number(item.vote_average).toFixed(1)} / 10` : ""]
            ]
            : [
                ["Released", item.release_date],
                ["Runtime", item.runtime ? `${item.runtime} minutes` : ""],
                ["TMDB rating", Number(item.vote_average) > 0 ? `${Number(item.vote_average).toFixed(1)} / 10` : ""]
            ];
        entries.filter(([, value]) => value).forEach(([label, value]) => {
            const term = document.createElement("dt");
            const description = document.createElement("dd");
            const fact = document.createElement("div");
            fact.className = "detail-fact";
            term.textContent = label;
            description.textContent = value;
            fact.append(term, description);
            facts.appendChild(fact);
        });
    }

    function setHeroImage(item) {
        hero.classList.remove("details-no-art");
        const backdropPath = item.backdrop_path;
        const posterPath = item.poster_path;
        backdrop.hidden = !backdropPath && !posterPath;
        backdrop.loading = "eager";
        backdrop.fetchPriority = "high";
        if (!backdropPath && !posterPath) hero.classList.add("details-no-art");
        backdrop.dataset.fallbackUsed = "false";
        backdrop.onerror = () => {
            if (posterPath && !backdrop.dataset.fallbackUsed && backdrop.src !== imageUrl(posterPath, "w1280")) {
                backdrop.dataset.fallbackUsed = "true";
                backdrop.src = imageUrl(posterPath, "w1280");
                return;
            }
            backdrop.hidden = true;
            hero.classList.add("details-no-art");
        };
        backdrop.src = imageUrl(backdropPath || posterPath, "w1280");
    }

    function renderPeople(container, people, kind) {
        container.replaceChildren();
        (people || []).slice(0, 16).forEach((person) => {
            const card = document.createElement("article");
            card.className = "details-person";
            const portrait = document.createElement("div");
            portrait.className = "details-person-portrait";
            if (person.profile_path) {
                const image = document.createElement("img");
                image.src = imageUrl(person.profile_path, "w185");
                image.alt = "";
                image.loading = "lazy";
                image.decoding = "async";
                image.onerror = () => {
                    image.hidden = true;
                    portrait.classList.add("is-missing");
                };
                portrait.appendChild(image);
            } else {
                portrait.classList.add("is-missing");
            }
            const name = document.createElement("strong");
            name.className = "details-person-name";
            name.textContent = person.name || "Cast member";
            const credit = document.createElement("span");
            credit.className = "details-person-credit";
            credit.textContent = kind === "cast" ? (person.character || "Cast") : (person.job || "Crew");
            card.append(portrait, name, credit);
            container.appendChild(card);
        });
    }

    function renderCrew(details, type) {
        const people = type === "tv"
            ? (details.created_by || []).map((person) => ({ ...person, job: "Creator" }))
            : (details.credits?.crew || []).filter((person) => person.job === "Director").slice(0, 3);
        crewSection.hidden = !people.length;
        crewContainer.replaceChildren();
        people.forEach((person) => {
            const item = document.createElement("p");
            item.className = "details-crew-person";
            const name = document.createElement("strong");
            name.textContent = person.name || "Unknown";
            const role = document.createElement("span");
            role.textContent = person.job;
            item.append(name, role);
            crewContainer.appendChild(item);
        });
    }

    function renderRecommendations(items, type) {
        recommendationsContainer.replaceChildren();
        const titles = (items || []).filter((item) => item?.id && (item.poster_path || item.backdrop_path)).slice(0, 12);
        recommendationsSection.hidden = !titles.length;
        titles.forEach((item) => {
            const itemType = item.media_type === "tv" || item.first_air_date ? "tv" : (item.media_type || type);
            recommendationsContainer.appendChild(createMovieCard(item, { type: itemType, onOpen: show }));
        });
    }

    function showEpisodesMessage(message, retrySeason = null) {
        episodesContainer.replaceChildren();
        const copy = document.createElement("p");
        copy.className = "details-inline-state";
        copy.textContent = message;
        episodesContainer.appendChild(copy);
        if (retrySeason !== null) {
            const retry = document.createElement("button");
            retry.className = "secondary-action";
            retry.type = "button";
            retry.textContent = "Try again";
            retry.addEventListener("click", () => loadSeason(retrySeason, requestId));
            episodesContainer.appendChild(retry);
        }
    }

    async function loadSeason(seasonNumber, titleRequestId) {
        if (!activeTitle || activeTitle.type !== "tv" || !seasonNumber) return;
        const currentSeasonRequestId = ++seasonRequestId;
        episodesContainer.classList.add("is-loading");
        showEpisodesMessage("Loading episodes...");
        try {
            const data = await apiGet(`/tv/${activeTitle.item.id}/season/${seasonNumber}?language=en-US`);
            if (titleRequestId !== requestId || currentSeasonRequestId !== seasonRequestId) return;
            episodesContainer.classList.remove("is-loading");
            const episodes = data.episodes || [];
            if (!episodes.length) {
                showEpisodesMessage("No episodes are listed for this season.");
                return;
            }
            episodesContainer.replaceChildren();
            episodes.forEach((episode) => {
                const card = document.createElement("article");
                card.className = "details-episode";
                const artwork = document.createElement("div");
                artwork.className = "details-episode-art";
                if (episode.still_path) {
                    const image = document.createElement("img");
                    image.src = imageUrl(episode.still_path, "w300");
                    image.alt = "";
                    image.loading = "lazy";
                    image.decoding = "async";
                    image.onerror = () => { image.hidden = true; artwork.classList.add("is-missing"); };
                    artwork.appendChild(image);
                } else {
                    artwork.classList.add("is-missing");
                }
                const detailsCopy = document.createElement("div");
                detailsCopy.className = "details-episode-copy";
                const number = document.createElement("p");
                number.className = "details-episode-number";
                number.textContent = `Episode ${episode.episode_number}${episode.runtime ? ` · ${episode.runtime} min` : ""}`;
                const name = document.createElement("h4");
                name.textContent = episode.name || `Episode ${episode.episode_number}`;
                const synopsis = document.createElement("p");
                synopsis.className = "details-episode-overview";
                synopsis.textContent = episode.overview || "No episode description is available.";
                detailsCopy.append(number, name, synopsis);
                const playEpisode = document.createElement("button");
                playEpisode.className = "episode-play-button";
                playEpisode.type = "button";
                playEpisode.setAttribute("aria-label", `Play episode ${episode.episode_number}: ${episode.name || "Untitled"}`);
                playEpisode.textContent = "Play episode";
                playEpisode.addEventListener("click", () => {
                    if (!activeTitle || titleRequestId !== requestId) return;
                    onPlay(activeTitle.item, "tv", { season: Number(seasonNumber), episode: Number(episode.episode_number) });
                });
                card.append(artwork, detailsCopy, playEpisode);
                episodesContainer.appendChild(card);
            });
        } catch (error) {
            if (titleRequestId !== requestId || currentSeasonRequestId !== seasonRequestId) return;
            episodesContainer.classList.remove("is-loading");
            console.error("Could not load season episodes:", error);
            showEpisodesMessage("Episodes aren't available right now.", seasonNumber);
        }
    }

    function setSeasonOptions(details, historyEntry, titleRequestId) {
        seasonSelect.replaceChildren();
        const seasons = details.seasons || [];
        if (!seasons.length) {
            seasonSelect.disabled = true;
            showEpisodesMessage("No seasons are listed for this show.");
            return;
        }
        seasonSelect.disabled = false;
        seasons.forEach((season) => {
            const option = document.createElement("option");
            option.value = String(season.season_number);
            option.textContent = season.season_number === 0 ? "Specials" : `Season ${season.season_number}`;
            seasonSelect.appendChild(option);
        });
        const savedSeason = seasons.some((season) => Number(season.season_number) === Number(historyEntry?.season));
        seasonSelect.value = savedSeason ? String(historyEntry.season) : String(seasons[0].season_number);
        seasonSelect.onchange = () => loadSeason(Number(seasonSelect.value), titleRequestId);
        loadSeason(Number(seasonSelect.value), titleRequestId);
    }

    async function loadDetails(item, itemType, titleRequestId) {
        page.classList.add("is-loading");
        status.hidden = false;
        statusMessage.textContent = "Loading title information...";
        retryButton.hidden = true;
        try {
            const details = await apiGet(`/${itemType}/${item.id}?language=en-US&append_to_response=credits,recommendations`);
            if (titleRequestId !== requestId) return;
            activeTitle.item = { ...activeTitle.item, ...details, media_type: itemType };
            title.textContent = mediaTitle(details);
            fullOverview.textContent = details.overview || "No overview is available for this title.";
            setGenres(details.genres);
            setFacts(details, itemType);
            const date = details.release_date || details.first_air_date;
            const year = getYear(date);
            const rating = Number(details.vote_average) > 0 ? `${Number(details.vote_average).toFixed(1)} / 10` : "";
            const runtime = itemType === "movie" ? details.runtime : null;
            const duration = runtime ? `${runtime} min` : "";
            const seasonCount = itemType === "tv" && details.number_of_seasons
                ? `${details.number_of_seasons} ${details.number_of_seasons === 1 ? "season" : "seasons"}`
                : "";
            metadata.textContent = [/^\d{4}$/.test(year) ? year : "", duration, seasonCount, rating].filter(Boolean).join("  |  ");
            setHeroImage(details);
            renderCrew(details, itemType);
            renderPeople(castContainer, details.credits?.cast, "cast");
            castSection.hidden = !details.credits?.cast?.length;
            recommendationsSection.hidden = true;
            renderRecommendations(details.recommendations?.results, itemType);
            tvSection.hidden = itemType !== "tv";
            if (itemType === "tv") setSeasonOptions(details, activeTitle.historyEntry, titleRequestId);
            else {
                seasonRequestId++;
                seasonSelect.onchange = null;
                seasonSelect.replaceChildren();
                episodesContainer.replaceChildren();
            }
            updateListButton();
            page.classList.remove("is-loading");
            status.hidden = true;
        } catch (error) {
            if (titleRequestId !== requestId) return;
            console.error("Could not load title details:", error);
            page.classList.remove("is-loading");
            status.hidden = false;
            statusMessage.textContent = "Title information couldn't load.";
            retryButton.hidden = false;
        }
    }

    function show(item, type, historyEntry = null) {
        const id = ++requestId;
        seasonRequestId++;
        const itemType = type || item.media_type || (item.first_air_date ? "tv" : "movie");
        activeTitle = { item: { ...item, media_type: itemType }, type: itemType, historyEntry };
        browseContent.hidden = true;
        page.hidden = false;
        page.classList.remove("is-loading");
        genreBar.hidden = true;
        typeLabel.textContent = itemType === "tv" ? "TV SERIES" : "FILM";
        title.textContent = mediaTitle(item);
        fullOverview.textContent = item.overview || "Loading the full overview...";
        metadata.textContent = "";
        setGenres(item.genres || []);
        setFacts(item, itemType);
        setHeroImage(item);
        crewSection.hidden = true;
        castSection.hidden = true;
        recommendationsSection.hidden = true;
        tvSection.hidden = itemType !== "tv";
        status.hidden = true;
        statusMessage.textContent = "";
        retryButton.hidden = true;
        seasonSelect.replaceChildren();
        seasonSelect.disabled = false;
        episodesContainer.replaceChildren();
        episodesContainer.classList.remove("is-loading");
        updateListButton();
        playButton.onclick = () => {
            if (activeTitle) onPlay(activeTitle.item, activeTitle.type, activeTitle.historyEntry);
        };
        listButton.onclick = () => {
            if (!activeTitle) return;
            const saved = toggleMyList(activeTitle.item, activeTitle.type);
            updateListButton();
            onListChange?.(saved);
        };
        loadDetails(item, itemType, id);
    }

    function close() {
        requestId++;
        seasonRequestId++;
        page.hidden = true;
        browseContent.hidden = false;
        genreBar.hidden = false;
        onBack();
    }

    retryButton.addEventListener("click", () => {
        if (!activeTitle) return;
        const id = ++requestId;
        seasonRequestId++;
        loadDetails(activeTitle.item, activeTitle.type, id);
    });
    backButton.addEventListener("click", close);
    return { show, close };
}
