import { GEMINI_FUNCTION_URL } from "./config.js";

export function createChat({ page, messages, form, input, sendButton }) {
    const history = [];
    const suggestions = page.querySelectorAll(".chat-suggestion");

    function appendMessage(text, role, extraClass = "") {
        const message = document.createElement("div");
        message.className = `chat-message chat-message-${role}${extraClass ? ` ${extraClass}` : ""}`;
        message.textContent = text;
        messages.append(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    function setBusy(busy) {
        sendButton.disabled = busy;
        suggestions.forEach((suggestion) => {
            suggestion.disabled = busy;
        });
    }

    async function sendMessage(text) {
        const message = text.trim();
        if (!message || sendButton.disabled) return;

        input.value = "";
        history.push({ role: "user", text: message });
        appendMessage(message, "user");
        const pending = appendMessage("Thinking...", "assistant");
        setBusy(true);

        try {
            const response = await fetch(GEMINI_FUNCTION_URL, {
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
            appendMessage(result.reply, "assistant");
        } catch (error) {
            pending.remove();
            appendMessage(error.message || "Couldn't connect to the assistant. Please try again.", "assistant", "chat-message-error");
        } finally {
            setBusy(false);
            input.focus();
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void sendMessage(input.value);
    });

    suggestions.forEach((suggestion) => {
        suggestion.addEventListener("click", () => {
            void sendMessage(suggestion.dataset.prompt || "");
        });
    });

    appendMessage("Hi! Tell me what you enjoy, or ask me for a spoiler-free review of a movie.", "assistant");

    return {
        focus() {
            if (!page.hidden) input.focus();
        }
    };
}
