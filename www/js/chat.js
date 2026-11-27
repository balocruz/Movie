import { GEMINI_FUNCTION_URL, GEMINI_NATIVE_FUNCTION_URL } from "./config.js";
import { apiGet, imageUrl, mediaTitle } from "./api.js";

function getGeminiFunctionUrl() {
    const isNativeOrigin = window.location.protocol === "capacitor:"
        || (window.location.protocol === "https:" && window.location.hostname === "localhost");
    return isNativeOrigin ? GEMINI_NATIVE_FUNCTION_URL : GEMINI_FUNCTION_URL;
}

export function createChat({ page, messages, welcome, form, input, sendButton, onOpen }) {
    const history = [];

    function appendInlineText(container, text) {
        const formatting = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
        let lastIndex = 0;
        let match;
        while ((match = formatting.exec(text))) {
            container.append(document.createTextNode(text.slice(lastIndex, match.index)));
            const token = match[0];
            const element = token.startsWith("**") ? document.createElement("strong")
                : token.startsWith("*") ? document.createElement("em")
                    : document.createElement("code");
            element.textContent = token.slice(token.startsWith("**") ? 2 : 1, token.startsWith("**") ? -2 : -1);
            container.append(element);
            lastIndex = formatting.lastIndex;
        }
        container.append(document.createTextNode(text.slice(lastIndex)));
    }

    function appendFormattedText(container, text) {
        const blocks = text.trim().split(/\n\s*\n/).filter(Boolean);
        blocks.forEach((block) => {
            const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
            const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line));
            if (isList) {
                const list = document.createElement(lines.some((line) => /^\d+[.)]\s+/.test(line)) ? "ol" : "ul");
                lines.forEach((line) => {
                    const item = document.createElement("li");
                    appendInlineText(item, line.replace(/^([-*]|\d+[.)])\s+/, ""));
                    list.append(item);
                });
                container.append(list);
                return;
            }

            const heading = lines.length === 1 && /^#{1,3}\s+/.test(lines[0]);
            const paragraph = document.createElement(heading ? "h3" : "p");
            appendInlineText(paragraph, lines.join(" ").replace(/^#{1,3}\s+/, ""));
            container.append(paragraph);
        });
    }

    async function findMovie(recommendation) {
        const query = `/search/multi?query=${encodeURIComponent(recommendation.title)}&language=en-US&page=1&include_adult=false`;
        const result = await apiGet(query);
        const titleKey = recommendation.title.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
        const matches = (result.results || []).filter((item) => item.media_type === "movie" || item.media_type === "tv");
        return matches.find((item) => {
            const candidateTitle = mediaTitle(item).toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
            const candidateDate = item.release_date || item.first_air_date || "";
            return candidateTitle === titleKey && (!recommendation.year || candidateDate.startsWith(String(recommendation.year)));
        }) || matches.find((item) => mediaTitle(item).toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === titleKey) || null;
    }

    function appendRecommendations(container, recommendations) {
        if (!Array.isArray(recommendations) || recommendations.length === 0) return;
        const list = document.createElement("div");
        list.className = "chat-recommendations";
        container.append(list);

        recommendations.slice(0, 10).forEach((recommendation) => {
            if (!recommendation || typeof recommendation.title !== "string" || !recommendation.title.trim()) return;
            const card = document.createElement("article");
            card.className = "chat-movie-card";
            const poster = document.createElement("div");
            poster.className = "chat-movie-poster";
            const details = document.createElement("div");
            details.className = "chat-movie-details";
            const title = document.createElement("h4");
            title.textContent = recommendation.title;
            details.append(title);
            if (recommendation.year) {
                const year = document.createElement("span");
                year.className = "chat-movie-year";
                year.textContent = String(recommendation.year);
                details.append(year);
            }
            if (typeof recommendation.reason === "string" && recommendation.reason.trim()) {
                const reason = document.createElement("p");
                reason.textContent = recommendation.reason;
                details.append(reason);
            }
            card.append(poster, details);
            list.append(card);

            findMovie(recommendation).then((item) => {
                if (!item) {
                    poster.classList.add("chat-movie-poster-missing");
                    poster.setAttribute("aria-label", "Poster unavailable");
                    return;
                }
                if (item.poster_path) {
                    const image = document.createElement("img");
                    image.src = imageUrl(item.poster_path, "w342");
                    image.alt = `Poster for ${mediaTitle(item)}`;
                    image.loading = "lazy";
                    poster.replaceChildren(image);
                } else {
                    poster.classList.add("chat-movie-poster-missing");
                    poster.setAttribute("aria-label", "Poster unavailable");
                }
                const open = document.createElement("button");
                open.type = "button";
                open.className = "chat-movie-open";
                open.setAttribute("aria-label", `View details for ${mediaTitle(item)}`);
                open.append(poster, details);
                open.addEventListener("click", () => onOpen?.(item, item.media_type));
                card.replaceWith(open);
            }).catch((error) => {
                console.error("Could not load a recommendation poster:", error);
                poster.classList.add("chat-movie-poster-missing");
                poster.setAttribute("aria-label", "Poster unavailable");
            });
        });
    }

    function appendMessage(text, role, recommendations = [], extraClass = "") {
        const message = document.createElement("div");
        message.className = `chat-message chat-message-${role}${extraClass ? ` ${extraClass}` : ""}`;
        if (role === "assistant") {
            const content = document.createElement("div");
            content.className = "chat-message-content";
            appendFormattedText(content, text);
            message.append(content);
            appendRecommendations(message, recommendations);
        } else {
            message.textContent = text;
        }
        welcome.hidden = true;
        messages.append(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    function setBusy(busy) {
        sendButton.disabled = busy;
        input.disabled = busy;
    }

    function thinkingMessage(userMessage) {
        const message = userMessage.toLocaleLowerCase();
        if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!. ]*$/.test(message)) {
            return "Thinking of a friendly reply";
        }
        if (/\b(explain|ending|scene|meaning|plot|review|confused|understand|what happened|why did)\b/.test(message)) {
            return "Thinking it through";
        }
        if (/\b(recommend|suggest|what to watch|movie|movies|film|films|show|series)\b/.test(message)) {
            return "Finding your next watch";
        }
        return "Putting my thoughts together";
    }

    function appendThinking(text) {
        const message = document.createElement("div");
        message.className = "chat-message chat-message-assistant chat-message-thinking";
        message.setAttribute("role", "status");

        const label = document.createElement("span");
        label.textContent = text;
        const dots = document.createElement("span");
        dots.className = "chat-thinking-dots";
        dots.setAttribute("aria-hidden", "true");
        for (let index = 0; index < 3; index++) dots.append(document.createElement("i"));
        message.append(label, dots);

        welcome.hidden = true;
        messages.append(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    async function sendMessage(text) {
        const message = text.trim();
        if (!message || sendButton.disabled) return;

        input.value = "";
        input.style.height = "";
        input.blur();
        history.push({ role: "user", text: message });
        appendMessage(message, "user");
        const pending = appendThinking(thinkingMessage(message));
        setBusy(true);

        try {
            const response = await fetch(getGeminiFunctionUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: history.slice(-20) })
            });
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error("The assistant returned an unreadable response. Please try again.");
            }
            if (!response.ok) {
                throw new Error(result.error || "The assistant could not answer right now.");
            }
            if (typeof result.reply !== "string" || !result.reply.trim()) {
                throw new Error("The assistant returned an empty response. Please try again.");
            }

            pending.remove();
            history.push({ role: "assistant", text: result.reply });
            if (history.length > 20) history.splice(0, history.length - 20);
            appendMessage(result.reply, "assistant", result.recommendations);
        } catch (error) {
            pending.remove();
            history.pop();
            console.error("MoviesHub AI request failed:", error);
            appendMessage(error.message || "Couldn't connect to the assistant. Please try again.", "assistant", [], "chat-message-error");
        } finally {
            setBusy(false);
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void sendMessage(input.value);
    });

    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    return {
        focus() {
            if (!page.hidden) input.focus();
        }
    };
}
