const DEFAULT_COLYSEUS_PORT = "2567";

export function getColyseusServerUrl(configuredUrl: unknown) {
    if (typeof configuredUrl === "string" && configuredUrl.trim()) {
        return configuredUrl;
    }

    if (typeof window === "undefined") {
        return `ws://localhost:${DEFAULT_COLYSEUS_PORT}`;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const hostname = window.location.hostname || "localhost";

    return `${protocol}://${hostname}:${DEFAULT_COLYSEUS_PORT}`;
}
