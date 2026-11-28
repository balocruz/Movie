import { createCatalog } from "./catalog.js";
import { createChat } from "./chat.js";
import { createDetails } from "./details.js";
import { createFeaturedHero } from "./hero.js";
import { createLibrary } from "./library.js";
import { createPlayer } from "./player.js";
import { createSearch } from "./search.js";
import { checkForAppUpdate } from "./updates.js";

const browseContent = document.getElementById("browse-content");
const genreBar = document.getElementById("genre-bar");
const contentContainer = document.getElementById("categories-container");
const detailsPage = document.getElementById("details-page");
const browsePage = document.getElementById("browse-page");
const chatPage = document.getElementById("chat-page");
const searchBox = document.getElementById("search-box");
const clearSearchButton = document.getElementById("clear-search");
const searchExperience = document.getElementById("search-experience");
const searchExperienceContent = document.getElementById("search-experience-content");
const mobileSearchButton = document.getElementById("mobile-search-btn");
const navButtons = document.querySelectorAll(".nav-btn");
const primaryNav = document.querySelector(".primary-nav");
const navExpandToggle = document.getElementById("nav-expand-toggle");
const genreButtons = document.querySelectorAll(".genre-btn");
const searchInput = document.getElementById("search");
const searchButton = document.getElementById("btn");
const loadingScreen = document.getElementById("app-loading");
let currentView = "home";
let isHomeFeed = true;
let isSearchMode = false;
let searchController;
const chat = createChat({
    page: chatPage,
    messages: document.getElementById("chat-messages"),
    welcome: document.getElementById("chat-welcome"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("chat-input"),
    micButton: document.getElementById("chat-mic"),
    voiceStatus: document.getElementById("chat-voice-status"),
    sendButton: document.getElementById("chat-send"),
    onOpen: (item, type) => {
        browsePage.classList.remove("chat-mode");
        chatPage.hidden = true;
        searchBox.hidden = false;
        hero.setVisible(false);
        details.show(item, type);
    },
    onPlay: (item, type) => player.play(item, type)
});

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

let navPointerInside = false;
let navHasFocus = false;
let navPinnedOpen = false;
function syncNavigationExpansion() {
    const expanded = navPointerInside || navHasFocus || navPinnedOpen;
    browsePage.classList.toggle("nav-expanded", expanded);
    navExpandToggle.setAttribute("aria-expanded", String(expanded));
    navExpandToggle.setAttribute("aria-label", expanded ? "Collapse navigation" : "Expand navigation");
    navExpandToggle.title = expanded ? "Collapse navigation" : "Expand navigation";
}

primaryNav.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    navPointerInside = true;
    syncNavigationExpansion();
});
primaryNav.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    navPointerInside = false;
    syncNavigationExpansion();
});
primaryNav.addEventListener("focusin", () => {
    navHasFocus = true;
    syncNavigationExpansion();
});
primaryNav.addEventListener("focusout", (event) => {
    if (primaryNav.contains(event.relatedTarget)) return;
    navHasFocus = false;
    syncNavigationExpansion();
});
navExpandToggle.addEventListener("click", () => {
    navHasFocus = false;
    navPinnedOpen = !navPinnedOpen;
    syncNavigationExpansion();
});

let library;
let hero;
const player = createPlayer({
    onHistoryChange: () => {
        if (currentView === "history") library?.renderRecent();
    },
    onPlayerVisibilityChange: (isOpen) => {
        hero?.setVisible(!isOpen && currentView === "home" && isHomeFeed && !browseContent.hidden);
    }
});

let details;
let catalog;
hero = createFeaturedHero({
    root: document.getElementById("featured-hero"),
    onPlay: (item, type) => player.play(item, type),
    onMoreInfo: (item, type) => {
        hero.setVisible(false);
        details.show(item, type);
    },
    onRetry: () => catalog?.loadHome()
});

catalog = createCatalog({
    container: contentContainer,
    onOpen: (item, type, historyEntry) => {
        hero.setVisible(false);
        details.show(item, type, historyEntry);
    },
    isPlaying: player.isPlaying,
    minimizePlayer: player.minimize,
    onFeatured: (items) => hero.setMovies(items),
    onFeaturedError: () => hero.showError(),
    onHomeReady: dismissLoading,
    onHomeStart: () => {
        isHomeFeed = true;
        hero.startLoading();
        hero.setVisible(currentView === "home");
    },
    onExpanded: () => {
        isHomeFeed = false;
        hero.setVisible(false);
    }
});

library = createLibrary({
    container: contentContainer,
    onOpen: (item, type, historyEntry) => details.show(item, type, historyEntry)
});

function restoreCurrentView() {
    browsePage.classList.toggle("chat-mode", currentView === "chat");
    detailsPage.hidden = true;
    chatPage.hidden = currentView !== "chat";
    searchBox.hidden = currentView !== "home";
    browseContent.hidden = currentView === "chat";
    searchExperience.hidden = currentView !== "home" || !isSearchMode;
    contentContainer.hidden = isSearchMode && currentView === "home";
    genreBar.hidden = currentView !== "home" || isSearchMode;
    hero.setVisible(currentView === "home" && isHomeFeed && !isSearchMode);
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
    searchController?.close();
    isSearchMode = false;
    setNavigation(view);
    isHomeFeed = view === "home";
    hero.setVisible(isHomeFeed);
    browsePage.classList.toggle("chat-mode", view === "chat");
    detailsPage.hidden = true;
    chatPage.hidden = view !== "chat";
    searchBox.hidden = view !== "home";
    browseContent.hidden = view === "chat";
    searchExperience.hidden = true;
    contentContainer.hidden = false;
    genreBar.hidden = view !== "home";
    if (view === "home") catalog.loadHome();
    else if (view === "history") library.renderRecent();
    else if (view === "my-list") library.renderMyList();
    else if (view === "chat") chat.focus();
}

navButtons.forEach((button) => {
    button.addEventListener("click", () => {
        navHasFocus = false;
        navPinnedOpen = false;
        syncNavigationExpansion();
        if (button.dataset.view === "home") searchInput.value = "";
        showView(button.dataset.view);
    });
});

genreButtons.forEach((button) => {
    button.addEventListener("click", () => {
        searchController?.close();
        isSearchMode = false;
        setNavigation("home");
        isHomeFeed = button.dataset.genre === "all";
        hero.setVisible(isHomeFeed);
        detailsPage.hidden = true;
        browseContent.hidden = false;
        genreBar.hidden = false;
        searchInput.value = "";
        genreButtons.forEach((genre) => {
            const selected = genre === button;
            genre.classList.toggle("active", selected);
            genre.setAttribute("aria-pressed", String(selected));
        });
        if (player.isPlaying()) player.minimize();
        if (button.dataset.genre === "all") catalog.loadHome();
        else catalog.loadGenre(button.dataset.movieGenre, button.dataset.tvGenre, button.textContent.trim());
    });
});

searchController = createSearch({
    input: searchInput,
    button: searchButton,
    clearButton: clearSearchButton,
    experience: searchExperience,
    content: searchExperienceContent,
    genres: Array.from(genreButtons)
        .filter((button) => button.dataset.movieGenre || button.dataset.tvGenre)
        .map((button) => ({
            label: button.textContent.trim(),
            movieId: button.dataset.movieGenre || "",
            tvId: button.dataset.tvGenre || ""
        })),
    onModeChange: (open) => {
        isSearchMode = open;
        searchExperience.hidden = !open;
        contentContainer.hidden = open;
        browsePage.classList.toggle("search-mode", open);
        mobileSearchButton.setAttribute("aria-pressed", String(open));
        if (open) {
            setNavigation("home");
            currentView = "home";
            searchBox.hidden = false;
            browsePage.classList.remove("chat-mode");
            hero.setVisible(false);
            detailsPage.hidden = true;
            chatPage.hidden = true;
            browseContent.hidden = false;
            genreBar.hidden = true;
        } else {
            genreBar.hidden = currentView !== "home";
            hero.setVisible(currentView === "home" && isHomeFeed);
        }
    },
    onGenre: (selectedGenre) => {
        const genreButton = Array.from(genreButtons).find((button) =>
            button.textContent.trim() === selectedGenre.label
            && (button.dataset.movieGenre || "") === selectedGenre.movieId
            && (button.dataset.tvGenre || "") === selectedGenre.tvId
        );
        genreButton?.click();
    },
    onOpen: (item, type) => details.show(item, type)
});

mobileSearchButton.addEventListener("click", () => searchController.openDiscovery());

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detailsPage.hidden && !player.isPlaying()) details.close();
});

window.setTimeout(dismissLoading, 10000);
catalog.loadHome().finally(dismissLoading);
window.setTimeout(() => void checkForAppUpdate(), 1400);
