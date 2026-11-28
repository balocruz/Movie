import { getYear, imageUrl, mediaTitle } from "./api.js";

export function createMovieCard(item, { type, historyEntry, onOpen, saved = false } = {}) {
    const mediaType = item.media_type || type || (item.first_air_date ? "tv" : "movie");
    const titleText = mediaTitle(item);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "movie-card";
    card.setAttribute("aria-label", `View details for ${titleText}`);

    const imageCover = document.createElement("span");
    imageCover.className = "image-cover";
    const image = document.createElement("img");
    image.src = imageUrl(item.poster_path || item.backdrop_path) || "https://via.placeholder.com/500x750?text=No+Image";
    image.alt = titleText;
    image.loading = "lazy";
    imageCover.appendChild(image);

    const info = document.createElement("span");
    info.className = "card-info";
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = titleText;
    info.appendChild(title);

    const metadata = document.createElement("span");
    metadata.className = "card-metadata";
    const rating = Number(item.vote_average);
    if (Number.isFinite(rating) && rating > 0) {
        const ratingLabel = document.createElement("span");
        ratingLabel.className = "rating-label";
        ratingLabel.setAttribute("aria-label", `Rated ${rating.toFixed(1)} out of 10`);
        ratingLabel.textContent = `★ ${rating.toFixed(1)}`;
        metadata.appendChild(ratingLabel);
    }

    const year = getYear(item.release_date || item.first_air_date);
    if (/^\d{4}$/.test(year)) {
        const yearLabel = document.createElement("span");
        yearLabel.className = "year-label";
        yearLabel.textContent = year;
        metadata.appendChild(yearLabel);
    }

    const typeLabel = document.createElement("span");
    typeLabel.className = "lang-badge";
    typeLabel.textContent = mediaType === "tv" ? "TV" : "FILM";
    metadata.appendChild(typeLabel);
    info.appendChild(metadata);

    if (historyEntry && mediaType === "tv") {
        const resumeLabel = document.createElement("span");
        resumeLabel.className = "resume-label";
        resumeLabel.textContent = `Resume S${historyEntry.season} · E${historyEntry.episode}`;
        info.appendChild(resumeLabel);
    }

    if (saved) {
        const savedMark = document.createElement("span");
        savedMark.className = "saved-mark";
        savedMark.setAttribute("aria-label", "In My List");
        savedMark.textContent = "IN MY LIST";
        info.appendChild(savedMark);
    }

    card.append(imageCover, info);
    card.addEventListener("click", () => onOpen?.(item, mediaType, historyEntry));
    return card;
}
