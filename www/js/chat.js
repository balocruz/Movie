import { GEMINI_FUNCTION_URL, GEMINI_NATIVE_FUNCTION_URL } from "./config.js";
import { imageUrl, mediaTitle } from "./api.js";
import { getMayaLibraryContext, isInMyList, toggleMyList } from "./storage.js";

function getGeminiFunctionUrl() {
    const isNativeOrigin = window.location.protocol === "capacitor:"
        || (window.location.protocol === "https:" && window.location.hostname === "localhost");
    return isNativeOrigin ? GEMINI_NATIVE_FUNCTION_URL : GEMINI_FUNCTION_URL;
}

export function createChat({ page, messages, welcome, form, input, micButton, voiceStatus, sendButton, onOpen, onPlay }) {
    const history = [];
    const RECENT_MESSAGE_COUNT = 6;
    const MAX_SUMMARY_LENGTH = 1800;
    const MAX_HISTORY_MESSAGES = 80;
    let recognition = null;
    let isRecording = false;
    let isVoiceStarting = false;
    let isBusy = false;
    let activeSpeechButton = null;
    let activeSpeechMode = null;
    let speechGeneration = 0;

    function appendInlineText(container, text) {
        const formatting = /(\[[^\]\n]+\]\(https:\/\/[^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
        let lastIndex = 0;
        let match;
        while ((match = formatting.exec(text))) {
            container.append(document.createTextNode(text.slice(lastIndex, match.index)));
            const token = match[0];
            if (token.startsWith("[")) {
                const linkMatch = token.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/);
                if (linkMatch) {
                    const link = document.createElement("a");
                    link.href = linkMatch[2];
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent = linkMatch[1];
                    container.append(link);
                    lastIndex = formatting.lastIndex;
                    continue;
                }
            }
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
            const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
            const tableRows = tableLines.map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
            const isComparisonTable = tableRows.length >= 2
                && tableRows[1].length === tableRows[0].length
                && tableRows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
            if (isComparisonTable) {
                const wrapper = document.createElement("div");
                wrapper.className = "chat-comparison-wrap";
                wrapper.setAttribute("role", "region");
                wrapper.setAttribute("aria-label", "Comparison details; swipe horizontally to see all columns");
                wrapper.tabIndex = 0;
                const table = document.createElement("table");
                table.className = "chat-comparison-table";
                const head = document.createElement("thead");
                const headerRow = document.createElement("tr");
                tableRows[0].slice(0, 5).forEach((cellText) => {
                    const cell = document.createElement("th");
                    cell.scope = "col";
                    appendInlineText(cell, cellText);
                    headerRow.append(cell);
                });
                head.append(headerRow);
                table.append(head);
                const body = document.createElement("tbody");
                tableRows.slice(2, 10).forEach((row) => {
                    const tableRow = document.createElement("tr");
                    row.slice(0, 5).forEach((cellText, index) => {
                        const cell = document.createElement(index === 0 ? "th" : "td");
                        if (index === 0) cell.scope = "row";
                        appendInlineText(cell, cellText);
                        tableRow.append(cell);
                    });
                    body.append(tableRow);
                });
                table.append(body);
                wrapper.append(table);
                container.append(wrapper);
                return;
            }
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

    function appendRecommendations(container, recommendations) {
        if (!Array.isArray(recommendations) || recommendations.length === 0) return;
        const list = document.createElement("div");
        list.className = "chat-recommendations";
        container.append(list);

        recommendations.slice(0, 10).forEach((recommendation) => {
            if (!recommendation || !Number.isInteger(Number(recommendation.id))
                || !["movie", "tv"].includes(recommendation.media_type)) return;
            const card = document.createElement("article");
            card.className = "chat-movie-card";
            const poster = document.createElement("div");
            poster.className = "chat-movie-poster";
            const details = document.createElement("div");
            details.className = "chat-movie-details";
            const title = document.createElement("h4");
            title.textContent = mediaTitle(recommendation);
            details.append(title);

            const metadata = document.createElement("div");
            metadata.className = "chat-movie-meta";
            const type = document.createElement("span");
            type.textContent = recommendation.media_type === "tv" ? "TV series" : "Movie";
            metadata.append(type);
            const date = recommendation.release_date || recommendation.first_air_date || "";
            if (date) {
                const year = document.createElement("span");
                year.className = "chat-movie-year";
                year.textContent = date.slice(0, 4);
                metadata.append(year);
            }
            if (Number(recommendation.vote_count) > 0 && Number(recommendation.vote_average) > 0) {
                const rating = document.createElement("span");
                rating.className = "chat-movie-rating";
                rating.textContent = `TMDB ${Number(recommendation.vote_average).toFixed(1)}`;
                metadata.append(rating);
            }
            details.append(metadata);
            if (typeof recommendation.overview === "string" && recommendation.overview.trim()) {
                const overview = document.createElement("p");
                overview.className = "chat-movie-overview";
                overview.textContent = recommendation.overview;
                details.append(overview);
            }
            if (typeof recommendation.reason === "string" && recommendation.reason.trim()) {
                const reason = document.createElement("p");
                reason.className = "chat-movie-reason";
                reason.textContent = recommendation.reason;
                details.append(reason);
            }
            const content = document.createElement("button");
            content.type = "button";
            content.className = "chat-movie-open";
            content.setAttribute("aria-label", `View details for ${mediaTitle(recommendation)}`);
            content.append(poster, details);
            content.addEventListener("click", () => onOpen?.(recommendation, recommendation.media_type));
            card.append(content);

            const actions = document.createElement("div");
            actions.className = "chat-movie-actions";
            const listButton = document.createElement("button");
            listButton.type = "button";
            const syncListButton = () => {
                const saved = isInMyList(recommendation, recommendation.media_type);
                listButton.textContent = saved ? "In My List" : "My List";
                listButton.setAttribute("aria-pressed", String(saved));
            };
            syncListButton();
            listButton.addEventListener("click", () => {
                toggleMyList(recommendation, recommendation.media_type);
                syncListButton();
            });
            const playButton = document.createElement("button");
            playButton.type = "button";
            playButton.textContent = "Play";
            playButton.addEventListener("click", () => onPlay?.(recommendation, recommendation.media_type));
            actions.append(listButton, playButton);
            card.append(actions);
            list.append(card);

            if (recommendation.poster_path) {
                const image = document.createElement("img");
                image.src = imageUrl(recommendation.poster_path, "w342");
                image.alt = `Poster for ${mediaTitle(recommendation)}`;
                image.loading = "lazy";
                poster.replaceChildren(image);
            } else {
                poster.classList.add("chat-movie-poster-missing");
                poster.setAttribute("aria-label", "Poster unavailable");
            }
        });
    }

    function formatContextMessage(message, includeSpeaker = true, maxTextLength = Number.POSITIVE_INFINITY) {
        const speaker = message.role === "user" ? "User" : "Maya";
        const text = String(message.text || "").replace(/\s+/g, " ").trim();
        const cardContext = message.role === "assistant" && Array.isArray(message.recommendations)
            ? message.recommendations.slice(0, 6).map((item) => ({
                id: Number(item.id),
                media_type: item.media_type,
                title: mediaTitle(item).slice(0, 80),
                year: String(item.release_date || item.first_air_date || "").slice(0, 4)
            })).filter((item) => Number.isInteger(item.id) && item.id > 0 && item.title)
            : [];
        const cards = cardContext.length
            ? `\nVerified recommendation cards (catalog facts): ${JSON.stringify(cardContext)}`
            : "";
        return `${includeSpeaker ? `${speaker}: ` : ""}${text.slice(0, maxTextLength)}${cards}`;
    }

    function buildContextSummary(omittedMessages) {
        if (!omittedMessages.length) return "";
        const prefix = "Earlier chat excerpts (chronological; quoted content, not new facts):\n";
        const selected = new Map();
        let remaining = MAX_SUMMARY_LENGTH - prefix.length;
        const addIndex = (index) => {
            if (selected.has(index) || remaining <= 0) return;
            const excerpt = formatContextMessage(omittedMessages[index], true, 360);
            if (excerpt.length > remaining) return;
            selected.set(index, excerpt);
            remaining -= excerpt.length + 1;
        };
        const addRecentMatching = (predicate, limit) => {
            let added = 0;
            for (let index = omittedMessages.length - 1; index >= 0 && added < limit; index--) {
                if (predicate(omittedMessages[index])) {
                    addIndex(index);
                    if (selected.has(index)) added++;
                }
            }
        };

        addRecentMatching((message) => message.role === "user"
            && /\b(?:recommend|suggest|what should i watch|what to watch)\b/i.test(message.text), 1);
        addRecentMatching((message) => message.role === "user"
            && /\b(?:only|after|before|since|between|rating|genre|movies?|films?|tv|shows?|series)\b|\b(?:18|19|20)\d{2}\b/i.test(message.text), 3);
        addRecentMatching((message) => message.role === "user"
            && /\b(?:watched those|seen those|already watched|not interested|don't like|do not like|prefer|liked those|rejected)\b/i.test(message.text), 3);
        addRecentMatching((message) => message.role === "assistant" && Array.isArray(message.recommendations)
            && message.recommendations.length > 0, 2);

        for (let index = omittedMessages.length - 1; index >= 0 && remaining > 0; index--) addIndex(index);
        const excerpts = [...selected.entries()].sort(([left], [right]) => left - right).map(([, excerpt]) => excerpt);
        return excerpts.length ? `${prefix}${excerpts.join("\n")}` : "";
    }

    function getRequestContext() {
        const omittedMessages = history.slice(0, -RECENT_MESSAGE_COUNT);
        const contextSummary = buildContextSummary(omittedMessages);
        const recentMessages = history.slice(-RECENT_MESSAGE_COUNT).map((message) => ({
            role: message.role,
            text: formatContextMessage(message, false)
        }));
        const budget = 11000 - contextSummary.length;
        const context = { messages: recentMessages, contextSummary };
        while (recentMessages.length > 1
            && (recentMessages.reduce((total, message) => total + message.text.length, 0) > budget
                || new TextEncoder().encode(JSON.stringify(context)).length > 14000)) {
            recentMessages.shift();
            if (recentMessages[0]?.role === "assistant") recentMessages.shift();
        }
        return context;
    }

    function setVoiceStatus(message, state = "") {
        if (!voiceStatus) return;
        voiceStatus.textContent = message;
        voiceStatus.hidden = !message;
        voiceStatus.dataset.state = state;
    }

    function setRecordingState(recording) {
        isRecording = recording;
        if (micButton) {
            const label = recording ? "Stop voice input" : "Start voice input";
            micButton.classList.toggle("is-recording", recording);
            micButton.setAttribute("aria-label", label);
            micButton.setAttribute("aria-pressed", String(recording));
            micButton.title = recording ? "Stop listening" : "Speak a question";
            const hiddenLabel = micButton.querySelector(".visually-hidden");
            if (hiddenLabel) hiddenLabel.textContent = label;
            micButton.disabled = isBusy || isVoiceStarting;
        }
        if (sendButton) sendButton.disabled = isBusy || recording || isVoiceStarting;
    }

    function appendVoiceTranscript(transcript) {
        const spokenText = String(transcript || "").trim();
        if (!spokenText) return false;
        const existing = input.value.trim();
        input.value = existing ? `${existing} ${spokenText}` : spokenText;
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
        setVoiceStatus("Transcript added. Review it, then send your question.", "complete");
        input.focus();
        return true;
    }

    function speechErrorMessage(errorCode) {
        const code = String(errorCode?.error || errorCode?.code || errorCode?.message || errorCode || "").toLowerCase();
        if (code.includes("not-allowed") || code.includes("permission") || code.includes("denied")) {
            return "Microphone access is off. Allow it in your device or browser settings, then try again.";
        }
        if (code.includes("no-speech")) return "I didn't catch anything. Try speaking a little closer to the microphone.";
        if (code.includes("audio-capture")) return "No microphone is available. Check your device settings and try again.";
        if (code.includes("network")) return "Voice recognition couldn't connect. Check your connection or type your question.";
        return "Voice input isn't available right now. You can still type to Maya.";
    }

    function getNativeSpeechBridge() {
        const capacitor = window.Capacitor;
        if (!capacitor?.isNativePlatform?.()) return null;
        const plugin = capacitor.Plugins?.SpeechRecognition;
        if (plugin) return { call: (method, options = {}) => plugin[method](options) };
        if (typeof capacitor.nativePromise === "function") {
            return { call: (method, options = {}) => capacitor.nativePromise("SpeechRecognition", method, options) };
        }
        return null;
    }

    function getNativeTextToSpeechBridge() {
        const capacitor = window.Capacitor;
        if (!capacitor?.isNativePlatform?.()) return null;
        const plugin = capacitor.Plugins?.TextToSpeech;
        if (plugin) return { call: (method, options = {}) => plugin[method](options) };
        if (typeof capacitor.nativePromise === "function") {
            return { call: (method, options = {}) => capacitor.nativePromise("TextToSpeech", method, options) };
        }
        return null;
    }

    async function startNativeVoiceInput(bridge) {
        const availability = await bridge.call("available");
        if (!availability?.available) throw new Error("unavailable");

        let permission = await bridge.call("checkPermissions");
        if (permission?.speechRecognition !== "granted") {
            permission = await bridge.call("requestPermissions");
        }
        if (permission?.speechRecognition !== "granted") throw new Error("permission-denied");

        isVoiceStarting = false;
        setRecordingState(true);
        setVoiceStatus("Listening… speak your question.", "recording");
        const result = await bridge.call("start", {
            language: navigator.language || "en-US",
            maxResults: 1,
            partialResults: false,
            popup: false
        });
        setRecordingState(false);
        const transcript = Array.isArray(result?.matches) ? result.matches[0] : "";
        if (!appendVoiceTranscript(transcript)) setVoiceStatus("No speech was detected. Try again or type your question.", "error");
    }

    function startBrowserVoiceInput() {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) throw new Error("unavailable");
        const instance = new Recognition();
        const startingText = input.value.trim();
        recognition = instance;
        instance.lang = navigator.language || "en-US";
        instance.continuous = false;
        instance.interimResults = true;
        instance.maxAlternatives = 1;
        instance.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map((result) => result[0]?.transcript || "")
                .join(" ").trim();
            if (!transcript) return;
            input.value = startingText ? `${startingText} ${transcript}` : transcript;
            input.style.height = "auto";
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
            setVoiceStatus("Listening…", "recording");
        };
        instance.onerror = (event) => {
            setRecordingState(false);
            setVoiceStatus(speechErrorMessage(event), "error");
        };
        instance.onend = () => {
            recognition = null;
            setRecordingState(false);
            if (!voiceStatus?.dataset.state || voiceStatus.dataset.state === "recording" || voiceStatus.dataset.state === "processing") {
                setVoiceStatus(input.value.trim() !== startingText
                    ? "Transcript added. Review it, then send your question."
                    : "No speech was detected. Try again or type your question.", input.value.trim() !== startingText ? "complete" : "error");
            }
        };
        setRecordingState(true);
        setVoiceStatus("Listening… speak your question.", "recording");
        instance.start();
    }

    async function startVoiceInput() {
        if (isBusy) return;
        stopSpokenReply();
        try {
            const nativeBridge = getNativeSpeechBridge();
            if (nativeBridge) {
                isVoiceStarting = true;
                if (micButton) micButton.disabled = true;
                if (sendButton) sendButton.disabled = true;
                setVoiceStatus("Checking microphone access…", "processing");
                try {
                    await startNativeVoiceInput(nativeBridge);
                } finally {
                    isVoiceStarting = false;
                    if (micButton) micButton.disabled = isBusy;
                    if (sendButton) sendButton.disabled = isBusy || isRecording;
                }
                return;
            }
            startBrowserVoiceInput();
        } catch (error) {
            isVoiceStarting = false;
            setRecordingState(false);
            setVoiceStatus(speechErrorMessage(error), "error");
        }
    }

    async function stopVoiceInput() {
        if (!isRecording) return;
        setVoiceStatus("Finishing voice input…", "processing");
        if (recognition) {
            recognition.stop();
            return;
        }
        try {
            const bridge = getNativeSpeechBridge();
            if (bridge) await bridge.call("stop");
        } catch {
            setRecordingState(false);
            setVoiceStatus("Voice input stopped. You can type your question instead.", "error");
        }
    }

    function findMayaVoice(voices, preferredLanguage) {
        const feminineName = /(?:female(?:$|[^a-z])|woman(?:$|[^a-z])|aria|ava|samantha|jenny|zira|karen|moira|tessa|victoria|susan|serena|fiona|salli|joanna|kendra|kimberly|ivy|michelle|ana|sophia|claire|google us english)/i;
        const masculineName = /(?:male(?:$|[^a-z])|man(?:$|[^a-z])|david|daniel|alex|fred|james|thomas|guy|mark|richard|oliver|google uk english male)/i;
        const locale = String(preferredLanguage || "en-US").toLowerCase();
        const language = locale.split("-")[0];
        const isFeminine = (voice) => String(voice.gender || "").toLowerCase() === "female"
            || feminineName.test(voice.name || "")
            || /(?:^|[-_])f(?:[-_#]|$)/i.test(voice.name || "");
        const score = (voice) => {
            const voiceLanguage = String(voice.lang || "").toLowerCase();
            return (isFeminine(voice) ? 100 : 0)
                + (voiceLanguage === locale ? 30 : voiceLanguage.startsWith(`${language}-`) ? 20 : 0)
                + (voice.default ? 1 : 0)
                - (masculineName.test(voice.name || "") ? 150 : 0);
        };
        return voices.filter((voice) => isFeminine(voice)).sort((left, right) => score(right) - score(left))[0]
            || voices.filter((voice) => !masculineName.test(voice.name || ""))
                .sort((left, right) => score(right) - score(left))[0]
            || null;
    }

    function getMayaVoiceForSpeech() {
        const synthesis = window.speechSynthesis;
        const readVoices = () => {
            try { return synthesis.getVoices?.() || []; } catch { return []; }
        };
        const available = readVoices();
        if (available.length || typeof synthesis.addEventListener !== "function") {
            return Promise.resolve(findMayaVoice(available, navigator.language));
        }
        return new Promise((resolve) => {
            let timeoutId;
            const finish = () => {
                synthesis.removeEventListener?.("voiceschanged", finish);
                clearTimeout(timeoutId);
                resolve(findMayaVoice(readVoices(), navigator.language));
            };
            synthesis.addEventListener("voiceschanged", finish, { once: true });
            timeoutId = setTimeout(finish, 500);
        });
    }

    function setSpeechButtonState(button, speaking) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.8");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        if (speaking) {
            const stop = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            stop.setAttribute("x", "6");
            stop.setAttribute("y", "6");
            stop.setAttribute("width", "12");
            stop.setAttribute("height", "12");
            stop.setAttribute("rx", "2");
            svg.append(stop);
        } else {
            const speaker = document.createElementNS("http://www.w3.org/2000/svg", "path");
            speaker.setAttribute("d", "M11 5 6 9H3v6h3l5 4V5Z");
            const waves = document.createElementNS("http://www.w3.org/2000/svg", "path");
            waves.setAttribute("d", "M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14");
            svg.append(speaker, waves);
        }
        button.replaceChildren(svg);
        button.classList.toggle("is-speaking", speaking);
        button.setAttribute("aria-pressed", String(speaking));
        button.setAttribute("aria-label", speaking ? "Stop Maya's voice" : "Read Maya's response aloud");
        button.title = speaking ? "Stop Maya's voice" : "Read Maya's response aloud";
    }

    function stopSpokenReply() {
        if (activeSpeechButton) {
            speechGeneration++;
            window.speechSynthesis?.cancel();
            if (activeSpeechMode === "native") {
                void getNativeTextToSpeechBridge()?.call("stop").catch(() => {});
            }
            setSpeechButtonState(activeSpeechButton, false);
            activeSpeechButton = null;
            activeSpeechMode = null;
        }
        if (voiceStatus?.dataset.state === "speaking") setVoiceStatus("");
    }

    function createSpeechButton(text) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-speak-button";
        setSpeechButtonState(button, false);
        const hasBrowserSpeech = window.speechSynthesis && typeof window.speechSynthesis.speak === "function"
            && typeof SpeechSynthesisUtterance !== "undefined";
        if (!getNativeTextToSpeechBridge() && !hasBrowserSpeech) {
            button.disabled = true;
            button.setAttribute("aria-label", "Speech playback unavailable");
            button.title = "Speech playback isn't supported in this browser.";
            return button;
        }
        button.addEventListener("click", async () => {
            if (activeSpeechButton === button) {
                stopSpokenReply();
                setVoiceStatus("Speech stopped.", "complete");
                return;
            }
            stopSpokenReply();
            const plainText = String(text)
                .replace(/\[([^\]]+)\]\(https:\/\/[^)]+\)/g, "$1")
                .replace(/^\s*#{1,3}\s*/gm, "")
                .replace(/^\s*[-*]\s+/gm, "")
                .replace(/[*_`]/g, "")
                .trim();
            const currentGeneration = speechGeneration;
            activeSpeechButton = button;
            setSpeechButtonState(button, true);
            setVoiceStatus("Preparing Maya's voice…", "processing");
            let failed = false;
            try {
                const nativeTts = getNativeTextToSpeechBridge();
                if (nativeTts) {
                    activeSpeechMode = "native";
                    try {
                        const supported = await nativeTts.call("getSupportedVoices");
                        if (speechGeneration !== currentGeneration) return;
                        const voices = Array.isArray(supported?.voices) ? supported.voices : [];
                        const voiceIndex = findNativeMayaVoiceIndex(voices, navigator.language || "en-US");
                        const voice = voiceIndex >= 0 ? voices[voiceIndex] : null;
                        const options = {
                            text: plainText,
                            lang: voice?.lang || navigator.language || "en-US",
                            rate: 1.03,
                            pitch: 1.12,
                            volume: 1
                        };
                        if (voiceIndex >= 0) options.voice = voiceIndex;
                        setVoiceStatus("Maya is speaking. Tap the speaker to stop.", "speaking");
                        await nativeTts.call("speak", options);
                    } catch (nativeError) {
                        if (speechGeneration !== currentGeneration) return;
                        if (!hasBrowserSpeech) throw nativeError;
                        activeSpeechMode = "browser";
                        await speakWithBrowser(plainText, currentGeneration);
                    }
                } else {
                    activeSpeechMode = "browser";
                    await speakWithBrowser(plainText, currentGeneration);
                }
            } catch {
                failed = true;
                setVoiceStatus("Speech playback couldn't start. You can still read the response.", "error");
            } finally {
                if (speechGeneration === currentGeneration) {
                    activeSpeechButton = null;
                    activeSpeechMode = null;
                    setSpeechButtonState(button, false);
                    if (!failed) setVoiceStatus("");
                }
            }
        });
        return button;
    }

    function findNativeMayaVoiceIndex(voices, preferredLanguage) {
        if (!Array.isArray(voices) || !voices.length) return -1;
        const locale = String(preferredLanguage || "en-US").toLowerCase();
        const language = locale.split("-")[0];
        const feminine = /female|woman|aria|ava|samantha|jenny|zira|karen|moira|tessa|victoria|susan|serena|fiona|salli|joanna|kendra|kimberly|ivy|michelle|ana|sophia|claire/i;
        const masculine = /(?:^|[^a-z])(?:male|man)(?:$|[^a-z])|david|daniel|alex|fred|james|thomas|guy|mark|richard|oliver/i;
        const score = (voice) => {
            const voiceLanguage = String(voice?.lang || "").toLowerCase();
            const name = `${voice?.name || ""} ${voice?.voiceURI || ""}`;
            return (feminine.test(name) ? 100 : 0)
                + (voiceLanguage === locale ? 30 : voiceLanguage.startsWith(`${language}-`) ? 20 : 0)
                + (voice?.default ? 1 : 0)
                - (masculine.test(name) ? 150 : 0);
        };
        const preferred = voices.map((voice, index) => ({ voice, index }))
            .filter(({ voice }) => feminine.test(`${voice?.name || ""} ${voice?.voiceURI || ""}`))
            .sort((left, right) => score(right.voice) - score(left.voice))[0];
        if (preferred) return preferred.index;
        return voices.map((voice, index) => ({ voice, index }))
            .filter(({ voice }) => !masculine.test(`${voice?.name || ""} ${voice?.voiceURI || ""}`))
            .sort((left, right) => score(right.voice) - score(left.voice))[0]?.index ?? 0;
    }

    async function speakWithBrowser(text, generation) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = navigator.language || "en-US";
        utterance.pitch = 1.08;
        utterance.rate = 1.02;
        utterance.volume = 1;
        const mayaVoice = await getMayaVoiceForSpeech();
        if (generation !== speechGeneration) return;
        if (mayaVoice) {
            utterance.voice = mayaVoice;
            utterance.lang = mayaVoice.lang;
        }
        setVoiceStatus("Maya is speaking. Tap the speaker to stop.", "speaking");
        await new Promise((resolve, reject) => {
            utterance.onend = resolve;
            utterance.onerror = reject;
            window.speechSynthesis.speak(utterance);
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
            if (!extraClass.includes("error")) message.append(createSpeechButton(text));
        } else {
            message.textContent = text;
        }
        welcome.hidden = true;
        messages.append(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    function setBusy(busy) {
        isBusy = busy;
        sendButton.disabled = busy || isRecording || isVoiceStarting;
        input.disabled = busy;
        if (micButton) micButton.disabled = busy || isVoiceStarting;
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
        const userBubble = appendMessage(message, "user");
        const pending = appendThinking(thinkingMessage(message));
        setBusy(true);

        try {
            const requestContext = getRequestContext();
            const libraryContext = getMayaLibraryContext(message);
            if (libraryContext) requestContext.libraryContext = libraryContext;
            const response = await fetch(getGeminiFunctionUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestContext)
            });
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error("The assistant returned an unreadable response. Please try again.");
            }
            if (!response.ok) {
                const requestError = response.status === 503
                    ? "Maya is busy right now. Please try again shortly."
                    : response.status === 429
                        ? "Maya can't take more requests right now. Please wait a little and try again."
                        : result.error || "Maya couldn't answer that just now. Please try again.";
                const error = new Error(requestError);
                error.retryable = response.status === 502 || response.status === 503;
                throw error;
            }
            if (typeof result.reply !== "string" || !result.reply.trim()) {
                throw new Error("The assistant returned an empty response. Please try again.");
            }

            pending.remove();
            history.push({ role: "assistant", text: result.reply, recommendations: result.recommendations });
            if (history.length > MAX_HISTORY_MESSAGES) history.splice(0, history.length - MAX_HISTORY_MESSAGES);
            appendMessage(result.reply, "assistant", result.recommendations);
        } catch (error) {
            pending.remove();
            history.pop();
            const connectionError = error.name === "TypeError"
                ? "Maya couldn't connect. Check your connection and try again."
                : error.message || "Maya couldn't answer that just now. Please try again.";
            console.error("Maya request failed:", error.message);
            const errorBubble = appendMessage(connectionError, "assistant", [], "chat-message-error");
            if (error.retryable || error.name === "TypeError") {
                const retryButton = document.createElement("button");
                retryButton.type = "button";
                retryButton.className = "chat-retry-button";
                retryButton.textContent = "Try again";
                retryButton.addEventListener("click", () => {
                    errorBubble.remove();
                    userBubble.remove();
                    void sendMessage(message);
                });
                errorBubble.append(retryButton);
            }
        } finally {
            setBusy(false);
        }
    }

    micButton?.addEventListener("click", () => {
        if (isRecording) void stopVoiceInput();
        else void startVoiceInput();
    });

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
