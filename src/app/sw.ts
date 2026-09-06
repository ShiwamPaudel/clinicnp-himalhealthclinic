/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The counter has to open with no connection at all — that is the whole point
 * of the outbox behind it. Everything else can want the network.
 *
 * Two rules matter here and both are about not lying to the person using it:
 *
 *  1. Nothing that writes is ever served from a cache. A queued bill or
 *     registration must reach the real server or stay in its queue; a cached
 *     "OK" would silently swallow a day's work.
 *
 *  2. A patient's file is never cached. The bytes are served through an
 *     authenticated route and must not sit in a browser cache on a shared
 *     counter machine after the person has signed out (Rules §1.13).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Anything that changes something on the server, and the file route.
      matcher: ({ request, url }) =>
        request.method !== "GET" ||
        url.pathname.startsWith("/api/files/") ||
        url.pathname.startsWith("/api/backup/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // With no connection and no cached copy of the page asked for, this
        // is where a navigation lands. It has to be a static page so it can
        // come out of the precache with nothing else available — the counter
        // itself is server-rendered and only works offline once visited.
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();
