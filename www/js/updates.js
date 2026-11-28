const RELEASES_URL = "https://allan-download-apk.netlify.app/.netlify/functions/github-releases?source=android-app";
const UPDATE_DOWNLOAD_URL = "https://allan-download-apk.netlify.app/?download=latest";
let updateCheckInProgress = false;
let lastUpdateCheckAt = 0;

function compareVersions(left, right) {
    const parse = (version) => String(version || "").match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
    const leftParts = parse(left);
    const rightParts = parse(right);
    if (!leftParts || !rightParts) return 0;
    for (let index = 0; index < 3; index++) {
        if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
    }
    return 0;
}

function releaseApk(release) {
    return (Array.isArray(release?.assets) ? release.assets : [])
        .find((asset) => /^movieshub\.apk$/i.test(asset?.name || "") || /\.apk$/i.test(asset?.name || ""));
}

function appendReleaseNotes(container, body) {
    const sections = [];
    let current = { title: "What's new", items: [] };
    sections.push(current);

    String(body || "").split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (heading) {
            const title = heading[1].replace(/[*_`]/g, "").trim();
            current = { title, items: [] };
            sections.push(current);
            return;
        }
        const item = line.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
        if (item) current.items.push(item);
    });

    const usefulSections = sections.filter((section) => section.items.length);
    if (!usefulSections.length) {
        current = { title: "What's new", items: ["A newer version of MoviesHub is ready to install."] };
        usefulSections.push(current);
    }

    usefulSections.forEach((section) => {
        const sectionElement = document.createElement("section");
        sectionElement.className = "app-update-notes-section";
        const heading = document.createElement("h3");
        heading.textContent = section.title;
        const list = document.createElement("ul");
        section.items.forEach((text) => {
            const item = document.createElement("li");
            item.textContent = text;
            list.append(item);
        });
        sectionElement.append(heading, list);
        container.append(sectionElement);
    });
}

function configureUpdateDownload() {
    const downloadLink = document.getElementById("app-update-download");
    if (!downloadLink) return;

    downloadLink.addEventListener("click", async (event) => {
        const capacitor = window.Capacitor;
        if (capacitor?.getPlatform?.() !== "android") return;

        event.preventDefault();
        const url = downloadLink.href;
        const launcher = capacitor.Plugins?.AppLauncher;
        try {
            const result = launcher?.openUrl
                ? await launcher.openUrl({ url })
                : typeof capacitor.nativePromise === "function"
                    ? await capacitor.nativePromise("AppLauncher", "openUrl", { url })
                    : null;
            if (result?.completed) {
                document.getElementById("app-update-dialog")?.close();
                return;
            }
        } catch (error) {
            console.warn("Could not open the APK download in the device browser.", error);
        }

        // Keep a direct fallback for devices where the native launcher is unavailable.
        window.location.assign(url);
    });
}

configureUpdateDownload();

export async function checkForAppUpdate() {
    const capacitor = window.Capacitor;
    if (capacitor?.getPlatform?.() !== "android") return;

    const dialog = document.getElementById("app-update-dialog");
    if (dialog?.open || updateCheckInProgress || Date.now() - lastUpdateCheckAt < 60_000) return;
    const appPlugin = capacitor.Plugins?.App;
    if (!dialog || (!appPlugin?.getInfo && typeof capacitor.nativePromise !== "function")) return;

    updateCheckInProgress = true;
    lastUpdateCheckAt = Date.now();
    try {
        const installed = appPlugin?.getInfo
            ? await appPlugin.getInfo()
            : await capacitor.nativePromise("App", "getInfo");
        if (!installed?.version) return;

        const response = await fetch(RELEASES_URL, {
            headers: { Accept: "application/json" },
            cache: "no-store"
        });
        if (!response.ok) return;
        const releases = await response.json();
        if (!Array.isArray(releases)) return;

        const release = releases.find((item) => !item?.draft && !item?.prerelease
            && /^v?\d+\.\d+\.\d+$/.test(item?.tag_name || "")
            && compareVersions(item.tag_name.replace(/^v/i, ""), installed.version) > 0
            && releaseApk(item));
        if (!release) return;

        const version = release.tag_name.replace(/^v/i, "");
        document.getElementById("app-update-version").textContent = `Version ${version}`;
        document.getElementById("app-update-download").href = UPDATE_DOWNLOAD_URL;
        document.getElementById("app-update-notes").replaceChildren();
        appendReleaseNotes(document.getElementById("app-update-notes"), release.body);

        const closeButton = document.getElementById("app-update-later");
        closeButton.onclick = () => dialog.close();
        document.getElementById("app-update-close").onclick = () => dialog.close();
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
    } catch {
        // Release checks run in the background and must never block app startup.
    } finally {
        updateCheckInProgress = false;
    }
}

const appPlugin = window.Capacitor?.Plugins?.App;
if (typeof appPlugin?.addListener === "function") {
    void appPlugin.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void checkForAppUpdate();
    });
}
