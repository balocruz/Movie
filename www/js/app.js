import { createCatalog } from "./catalog.js";
import { createDetails } from "./details.js";
import { createLibrary } from "./library.js";
import { createPlayer } from "./player.js";
import { createSearch } from "./search.js";

const browseContent = document.getElementById("browse-content");
const genreBar = document.getElementById("genre-bar");
const contentContainer = document.getElementById("categories-container");
const detailsPage = document.getElementById("details-page");
const navButtons = document.querySelectorAll(".nav-btn");
const genreButtons = document.querySelectorAll(".genre-btn");
const searchInput = document.getElementById("search");
const searchButton = document.getElementById("btn");
const searchSuggestions = document.getElementById("search-suggestions");
const loadingScreen = document.getElementById("app-loading");
let currentView = "home";

function dismissLoading() {
    if (!loadingScreen) return;
    loadingScreen.classList.add("is-dismissed");
    window.setTimeout(() => loadingScreen.remove(), 350);
}

function setNavigation(view) {
    currentView = view;
    navButtons.forEach((button) => {
        const current = button.dataset.view === view;
        button.classList.toggle("active", current);
        if (current) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
}

let library;
const player = createPlayer({
    onHistoryChange: () => {
        if (currentView === "history") library?.renderRecent();
    }
});

let details;
const catalog = createCatalog({
    container: contentContainer,
    onOpen: (item, type, historyEntry) => details.show(item, type, historyEntry),
    isPlaying: player.isPlaying,
    minimizePlayer: player.minimize
});

library = createLibrary({
    container: contentContainer,
    onOpen: (item, type, historyEntry) => details.show(item, type, historyEntry)
});

function restoreCurrentView() {
    detailsPage.hidden = true;
    browseContent.hidden = false;
    genreBar.hidden = currentView !== "home";
    if (currentView === "history") library.renderRecent();
    if (currentView === "my-list") library.renderMyList();
}

details = createDetails({
    page: detailsPage,
    browseContent,
    genreBar,
    onBack: restoreCurrentView,
    onPlay: (item, type, historyEntry) => player.play(item, type, historyEntry),
    onListChange: () => {
        if (currentView === "my-list") library.renderMyList();
    }
});

function showView(view) {
    setNavigation(view);
    detailsPage.hidden = true;
    browseContent.hidden = false;
    genreBar.hidden = view !== "home";
    if (view === "home") catalog.loadHome();
    else if (view === "history") library.renderRecent();
    else if (view === "my-list") library.renderMyList();
}

navButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.view === "home") searchInput.value = "";
        showView(button.dataset.view);
    });
});

genreButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setNavigation("home");
        detailsPage.hidden = true;
        browseContent.hidden = false;
        genreBar.hidden = false;
        searchInput.value = "";
        genreButtons.forEach((genre) => genre.classList.toggle("active", genre === button));
        if (player.isPlaying()) player.minimize();
        if (button.dataset.genre === "all") catalog.loadHome();
        else catalog.loadGenre(button.dataset.movieGenre, button.dataset.tvGenre, button.textContent.trim());
    });
});

createSearch({
    input: searchInput,
    button: searchButton,
    suggestions: searchSuggestions,
    onSearch: (query, items) => {
        setNavigation("home");
        detailsPage.hidden = true;
        browseContent.hidden = false;
        genreBar.hidden = true;
        catalog.showResults(`Results for “${query}”`, items, `No results for “${query}”. Try another title.`);
    },
    onSearchState: (message, loading) => {
        if (loading) {
            setNavigation("home");
            detailsPage.hidden = true;
            browseContent.hidden = false;
            genreBar.hidden = true;
        }
        catalog.showMessage(message, loading);
    },
    onOpen: (item, type) => details.show(item, type)
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detailsPage.hidden && !player.isPlaying()) details.close();
});

window.setTimeout(dismissLoading, 10000);
catalog.loadHome().finally(dismissLoading);