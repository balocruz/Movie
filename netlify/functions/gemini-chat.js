const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
const MAX_BODY_BYTES = 16000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 12000;
const MAX_RECOMMENDATIONS = 10;

function getAllowedOrigins() {
    const configuredOrigins = (process.env.GEMINI_ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    return new Set([
        ...configuredOrigins,
        process.env.URL,
        process.env.DEPLOY_PRIME_URL,
        "https://localhost",
        "capacitor://localhost"
    ].filter(Boolean));
}

function getCorsHeaders(origin) {
    if (!origin) return {};
    const allowedOrigins = getAllowedOrigins();
    if (!allowedOrigins.has(origin)) return null;
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
    };
}

function respond(statusCode, body, corsHeaders = {}) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders
        },
        body: JSON.stringify(body)
    };
}

function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        return null;
    }

    let totalLength = 0;
    const validMessages = [];
    for (const message of messages) {
        if (
            !message ||
            !["user", "assistant"].includes(message.role) ||
            typeof message.text !== "string"
        ) {
            return null;
        }
        const text = message.text.trim();
        if (!text || text.length > MAX_MESSAGE_LENGTH) return null;
        totalLength += text.length;
        if (totalLength > MAX_TOTAL_LENGTH) return null;
        validMessages.push({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text }]
        });
    }

    if (validMessages[validMessages.length - 1].role !== "user") return null;
    return validMessages;
}

exports.handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin || "";
    const corsHeaders = getCorsHeaders(origin);
    if (corsHeaders === null) return respond(403, { error: "This app origin is not allowed." });

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: corsHeaders || {}, body: "" };
    }
    if (event.httpMethod !== "POST") {
        return respond(405, { error: "Use POST to send a chat message." }, corsHeaders || {});
    }
    if (!event.body || Buffer.byteLength(event.body, "utf8") > MAX_BODY_BYTES) {
        return respond(413, { error: "The chat request is too large." }, corsHeaders || {});
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch {
        return respond(400, { error: "The chat request must contain valid JSON." }, corsHeaders || {});
    }

    const contents = validateMessages(requestBody?.messages);
    if (!contents) {
        return respond(400, { error: "Send up to 20 non-empty user and assistant messages." }, corsHeaders || {});
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        console.error("GEMINI_API_KEY is not configured for the chat function.");
        return respond(503, { error: "The AI assistant is not configured yet." }, corsHeaders || {});
    }

    let geminiResponse;
    try {
        geminiResponse = await fetch(GEMINI_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{
                        text: "You are MoviesHub's movie and TV recommendation assistant. Return a concise, friendly answer as structured JSON. Help users find something to watch, discuss movies, and give thoughtful reviews. For a recommendation request, include at least three distinct, real titles. If the user asks for a number, provide that many when it is between three and ten; never provide fewer than three or more than ten titles. Keep each reason to one sentence. Keep reviews spoiler-free by default, but if the user says they have watched a movie or asks you to explain a scene, plot point, or ending, explain it directly and allow spoilers for that title; do not refuse just because it contains spoilers. When the user asks about a specific movie or show, include that title as one item so the app can show its poster. For greetings and unrelated questions, reply naturally and use an empty recommendations array. Be clear when uncertain and never claim current streaming availability. Do not write markdown in the reply field."
                    }]
                },
                contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            reply: { type: "STRING" },
                            recommendations: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        title: { type: "STRING" },
                                        year: { type: "STRING" },
                                        reason: { type: "STRING" }
                                    },
                                    required: ["title", "year", "reason"]
                                }
                            }
                        },
                        required: ["reply", "recommendations"]
                    }
                }
            })
        });
    } catch (error) {
        console.error("Gemini request could not be completed.", error.message);
        return respond(502, { error: "Couldn't reach the AI service. Please try again." }, corsHeaders || {});
    }

    if (!geminiResponse.ok) {
        let providerMessage = "";
        try {
            const errorBody = await geminiResponse.json();
            if (typeof errorBody.error?.message === "string") {
                providerMessage = errorBody.error.message
                    .replace(apiKey, "[redacted]")
                    .slice(0, 400);
            }
        } catch {
            providerMessage = "";
        }
        console.error(
            `Gemini request failed with status ${geminiResponse.status}.`,
            providerMessage
        );

        if (geminiResponse.status === 401 || geminiResponse.status === 403) {
            return respond(502, {
                error: "Gemini rejected the API key. Check GEMINI_API_KEY and confirm Gemini API access is enabled for that key."
            }, corsHeaders || {});
        }
        if (geminiResponse.status === 429) {
            return respond(502, {
                error: "Gemini rate limit or quota reached. Check the quota for the Google project that owns this API key."
            }, corsHeaders || {});
        }
        return respond(502, {
            error: `Gemini returned HTTP ${geminiResponse.status}. Check the Netlify Dev terminal for details.`
        }, corsHeaders || {});
    }

    let geminiResult;
    try {
        geminiResult = await geminiResponse.json();
    } catch {
        console.error("Gemini returned a response that was not valid JSON.");
        return respond(502, { error: "The AI service returned an unreadable response." }, corsHeaders || {});
    }

    const generatedText = geminiResult.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();
    if (!generatedText) {
        console.error("Gemini returned no text for the chat request.");
        return respond(502, { error: "The AI service returned an empty response." }, corsHeaders || {});
    }

    let generatedContent;
    try {
        generatedContent = JSON.parse(generatedText);
    } catch {
        console.error("Gemini returned structured content that was not valid JSON.");
        return respond(502, { error: "The AI service returned an unreadable response. Please try again." }, corsHeaders || {});
    }
    if (typeof generatedContent.reply !== "string" || !generatedContent.reply.trim()) {
        console.error("Gemini returned structured content without an answer.");
        return respond(502, { error: "The AI service returned an empty response." }, corsHeaders || {});
    }

    const recommendations = Array.isArray(generatedContent.recommendations)
        ? generatedContent.recommendations
            .filter((item) => item && typeof item.title === "string" && item.title.trim())
            .slice(0, MAX_RECOMMENDATIONS)
            .map((item) => ({
                title: item.title.trim().slice(0, 120),
                year: typeof item.year === "string" ? item.year.trim().slice(0, 4) : "",
                reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 300) : ""
            }))
        : [];
    return respond(200, { reply: generatedContent.reply.trim(), recommendations }, corsHeaders || {});
};
