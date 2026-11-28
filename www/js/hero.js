import { getYear, imageUrl, mediaTitle } from "./api.js";

const AUTOPLAY_DELAY = 8000;
const GENRES = new Map([
    [28, "Action"], [12, "Adventure"], [16, "Animation"], [35, "Comedy"],
    [80, "Crime"], [99, "Documentary"], [18, "Drama"], [10751, "Family"],
    [14, "Fantasy"], [36, "History"], [27, "Horror"], [10402, "Music"],
    [9648, "Mystery"], [10749, "Romance"], [878, "Sci-Fi"], [10770, "TV Movie"],
    [53, "Thriller"], [10752, "War"], [37, "Western"]
]);

export function createFeaturedHero({ root, onPlay, onMoreInfo, onRetry }) {
    const slidesRoot = root.querySelector("[data-hero-slides]");
    const status = root.querySelector("[data-hero-status]");
    const statusMessage = root.querySelector("[data-hero-status-message]");
    const retryButton = root.querySelector("[data-hero-retry]");
    const copy = root.querySelector("[data-hero-copy]");
    const title = root.querySelector("[data-hero-title]");
    const meta = root.querySelector("[data-hero-meta]");
    const genres = root.querySelector("[data-hero-genres]");
    const overview = root.querySelector("[data-hero-overview]");
    const dots = root.querySelector("[data-hero-dots]");
    const previous = root.querySelector("[data-hero-previous]");
    const next = root.querySelector("[data-hero-next]");
    const play = root.querySelector("[data-hero-play]");
    const moreInfo = root.querySelector("[data-hero-info]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let movies = [];
    let activeIndex = 0;
    let timer = 0;
    let isVisible = true;
    let isPaused = false;
    let isHovering = false;
    let hasFocus = false;
    let isTouching = false;
    let destroyed = false;
    let touchStart = null;

    function clearTimer() {
        if (timer) window.clearTimeout(timer);
        timer = 0;
    }

    function scheduleNext() {
        clearTimer();
        if (destroyed || reducedMotion.matches || document.hidden || !isVisible || isPaused || movies.length < 2) return;
        timer = window.setTimeout(() => {
            timer = 0;
            activate(activeIndex + 1);
        }, AUTOPLAY_DELAY);
    }

    function refreshPaused() {
        isPaused = isHovering || hasFocus || isTouching;
        if (isPaused) clearTimer();
        else scheduleNext();
    }

    function slideSource(movie) {
        return imageUrl(movie.backdrop_path || movie.poster_path, "w1280");
    }

    function activate(index, { restartTimer = true } = {}) {
        if (!movies.length) return;
        activeIndex = (index + movies.length) % movies.length;
        const movie = movies[activeIndex];
        const layers = slidesRoot.querySelectorAll(".featured-slide");
        layers.forEach((layer, layerIndex) => {
            const active = layerIndex === activeIndex;
            layer.classList.toggle("is-active", active);
            layer.setAttribute("aria-hidden", String(!active));
            const image = layer.querySelector("img");
            if (active || layerIndex === (activeIndex + 1) % movies.length) {
                if (!image.getAttribute("src")) image.src = slideSource(movies[layerIndex]);
                image.loading = active ? "eager" : "lazy";
                image.fetchPriority = active ? "high" : "auto";
            }
        });

        title.textContent = mediaTitle(movie);
        meta.replaceChildren();
        const year = getYear(movie.release_date || movie.first_air_date);
        if (year !== "N/A") meta.append(document.createTextNode(year));
        if (Number.isFinite(Number(movie.vote_average)) && Number(movie.vote_average) > 0) {
            if (meta.childNodes.length) meta.append(document.createTextNode(" | "));
            const rating = document.createElement("span");
            rating.className = "featured-rating";
            rating.setAttribute("aria-label", `Rated ${Number(movie.vote_average).toFixed(1)} out of 10`);
            rating.textContent = "Rating " + Number(movie.vote_average).toFixed(1) + "/10";
            meta.append(rating);
        }
        genres.replaceChildren();
        (movie.genre_ids || []).slice(0, 3).forEach((id) => {
            const name = GENRES.get(Number(id));
            if (!name) return;
            const chip = document.createElement("span");
            chip.className = "featured-genre";
            chip.textContent = name;
            genres.appendChild(chip);
        });
        overview.textContent = movie.overview || "More details are available on the title page.";
        moreInfo.setAttribute("aria-label", `More info about ${mediaTitle(movie)}`);
        play.setAttribute("aria-label", `Play ${mediaTitle(movie)}`);
        [...dots.children].forEach((dot, dotIndex) => {
            const active = dotIndex === activeIndex;
            dot.classList.toggle("is-active", active);
            dot.setAttribute("aria-pressed", String(active));
            dot.setAttribute("aria-label", `Show featured title ${dotIndex + 1}: ${mediaTitle(movies[dotIndex])}`);
        });
        if (restartTimer) scheduleNext();
    }

    function setMovies(items) {
        movies = (items || [])
            .filter((movie) => movie && movie.id && movie.media_type !== "person" && (movie.backdrop_path || movie.poster_path))
            .slice(0, 5)
            .map((movie) => ({ ...movie, media_type: movie.media_type || "movie" }));
        activeIndex = 0;
        clearTimer();
        slidesRoot.replaceChildren();
        dots.replaceChildren();
        if (!movies.length) {
            root.hidden = true;
            root.classList.remove("is-loading");
            return;
        }

        movies.forEach((movie, index) => {
            const layer = document.createElement("div");
            layer.className = `featured-slide${index === 0 ? " is-active" : ""}`;
            layer.setAttribute("aria-hidden", String(index !== 0));
            const image = document.createElement("img");
            image.alt = "";
            image.decoding = "async";
            image.loading = index === 0 ? "eager" : "lazy";
            image.fetchPriority = index === 0 ? "high" : "auto";
            image.addEventListener("error", () => {
                if (movie.poster_path && !image.dataset.fallbackUsed) {
                    image.dataset.fallbackUsed = "true";
                    image.src = imageUrl(movie.poster_path, "w780");
                } else {
                    layer.classList.add("no-artwork");
                }
            });
            if (index === 0) image.src = slideSource(movie);
            layer.appendChild(image);
            slidesRoot.appendChild(layer);

            const dot = document.createElement("button");
            dot.className = "featured-dot";
            dot.type = "button";
            dot.addEventListener("click", () => activate(index));
            dots.appendChild(dot);
        });

        root.hidden = !isVisible;
        root.classList.remove("is-loading");
        root.classList.remove("has-error");
        status.hidden = true;
        copy.hidden = false;
        previous.disabled = movies.length < 2;
        next.disabled = movies.length < 2;
        activate(0, { restartTimer: false });
        scheduleNext();
    }

    function showError() {
        clearTimer();
        if (movies.length) return;
        root.hidden = !isVisible;
        root.classList.remove("is-loading");
        root.classList.add("has-error");
        slidesRoot.replaceChildren();
        copy.hidden = true;
        status.hidden = false;
        statusMessage.textContent = "Featured titles couldn't load.";
        retryButton.hidden = false;
    }

    function moveBy(amount) {
        if (movies.length > 1) activate(activeIndex + amount);
    }

    function startLoading() {
        if (movies.length) return;
        root.classList.remove("has-error");
        root.classList.add("is-loading");
        status.hidden = false;
        statusMessage.textContent = "Loading this week's featured titles...";
        retryButton.hidden = true;
        copy.hidden = true;
        root.hidden = !isVisible;
    }

    function onVisibilityChange() {
        if (document.hidden) clearTimer();
        else scheduleNext();
    }

    previous.addEventListener("click", () => moveBy(-1));
    next.addEventListener("click", () => moveBy(1));
    play.addEventListener("click", () => {
        const movie = movies[activeIndex];
        if (movie) onPlay(movie, movie.media_type);
    });
    moreInfo.addEventListener("click", () => {
        const movie = movies[activeIndex];
        if (movie) onMoreInfo(movie, movie.media_type);
    });
    retryButton.addEventListener("click", onRetry);
    root.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse") { isHovering = true; refreshPaused(); }
    });
    root.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "mouse") { isHovering = false; refreshPaused(); }
    });
    root.addEventListener("focusin", () => { hasFocus = true; refreshPaused(); });
    root.addEventListener("focusout", (event) => {
        if (!root.contains(event.relatedTarget)) { hasFocus = false; refreshPaused(); }
    });
    root.addEventListener("touchstart", (event) => {
        if (event.target.closest("button")) return;
        const touch = event.changedTouches[0];
        touchStart = { x: touch.clientX, y: touch.clientY };
        isTouching = true;
        refreshPaused();
    }, { passive: true });
    root.addEventListener("touchend", (event) => {
        if (!touchStart) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStart.x;
        const dy = touch.clientY - touchStart.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) moveBy(dx < 0 ? 1 : -1);
        touchStart = null;
        window.setTimeout(() => {
            isTouching = false;
            refreshPaused();
        }, 450);
    }, { passive: true });
    root.addEventListener("touchcancel", () => {
        if (!touchStart) return;
        touchStart = null;
        isTouching = false;
        refreshPaused();
    }, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onMotionChange = () => scheduleNext();
    reducedMotion.addEventListener?.("change", onMotionChange);

    return {
        setMovies,
        showError,
        startLoading,
        setVisible(visible) {
            isVisible = visible;
            root.hidden = !visible || (!movies.length && !root.classList.contains("is-loading") && !root.classList.contains("has-error"));
            if (!visible) clearTimer();
            else scheduleNext();
        },
        destroy() {
            destroyed = true;
            clearTimer();
            document.removeEventListener("visibilitychange", onVisibilityChange);
            reducedMotion.removeEventListener?.("change", onMotionChange);
        }
    };
}
