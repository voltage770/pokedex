import { useEffect, useRef, useState } from 'react';

// live twitch status — fetched from the cloudflare worker's /live endpoint
// (same worker that powers the news feed). the worker proxies twitch's helix
// `/streams` API, edge-caches for 60s, and returns:
//
//   { isLive: true,  channel, title, viewers, game, startedAt, thumbnail }
//   { isLive: false, channel }
//
// override the endpoint at build time via `VITE_LIVE_API` for local
// `wrangler dev` testing.
const LIVE_API_URL =
  import.meta.env.VITE_LIVE_API ||
  'https://pokedex-news.voltage770.workers.dev/live';

// how often to re-poll while the page is open. 90s pairs well with the
// worker's 60s edge cache — most polls hit the cache, occasionally we trigger
// a refresh from twitch. tab visibility check pauses polling for backgrounded
// tabs so we don't hammer the worker for a tab the user isn't looking at.
const POLL_INTERVAL_MS = 90 * 1000;

// short timeout — if the worker is slow we'd rather render "offline" than
// block the badge / embed indefinitely.
const FETCH_TIMEOUT_MS = 4000;

// localStorage key for the last-seen channel slug. caching it here means the
// about page can render the twitch link / display text immediately on first
// paint, before the worker fetch resolves. public info — not a privacy
// concern. when the streamer changes their handle, the worker returns the
// new slug and we silently overwrite the cache on the next successful poll.
const CHANNEL_CACHE_KEY = 'twitchChannel';

// fallback channel slug for first-paint when localStorage is empty (e.g. brand
// new visitor) AND the worker fetch hasn't resolved yet. without this, the
// about-page twitch link doesn't render until the worker call returns. must
// match `TWITCH_CHANNEL` in `worker/wrangler.toml` — when the streamer
// changes their handle, update both.
const FALLBACK_CHANNEL = 'shockwavexr';

async function fetchLive(signal) {
  const res = await fetch(LIVE_API_URL, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`worker ${res.status}`);
  const data = await res.json();
  if (typeof data?.isLive !== 'boolean') throw new Error('bad payload');
  return data;
}

export function useTwitchLive() {
  // stream object includes `isLive` plus optional title / viewers / etc when
  // live. consumers can destructure whatever they need; absent fields just
  // come back undefined.
  //
  // initial state pulls the last-known channel from localStorage so the
  // about page's twitch link doesn't flash empty during the first fetch.
  const [stream, setStream] = useState(() => {
    let channel = null;
    try { channel = localStorage.getItem(CHANNEL_CACHE_KEY) || null; } catch {}
    return { isLive: false, channel: channel || FALLBACK_CHANNEL };
  });

  // controllerRef lets us abort an in-flight fetch when the component
  // unmounts or a new poll fires before the previous resolved.
  const controllerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      // visibility gate: skip polling when the tab is hidden so background
      // tabs don't spend network on a badge nobody is looking at. the next
      // visibilitychange handler will pull a fresh status when you come back.
      if (document.visibilityState === 'hidden') return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const data = await fetchLive(controller.signal);
        if (!cancelled) {
          setStream(data);
          // persist channel for fast first-paint on next visit. silently
          // updates whenever the worker reports a new slug — handles the
          // streamer-changed-their-handle case without any frontend edits.
          if (data.channel) {
            try { localStorage.setItem(CHANNEL_CACHE_KEY, data.channel); } catch {}
          }
        }
      } catch {
        // network / timeout / bad payload — treat as offline but keep the
        // last-known channel so the about page's twitch link doesn't break
        // on transient failures. next tick retries.
        if (!cancelled) setStream(s => ({ isLive: false, channel: s.channel }));
      } finally {
        clearTimeout(timeout);
      }
    };

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);

    // re-check the moment the tab becomes visible again so users don't
    // see a stale offline badge after coming back from background.
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      controllerRef.current?.abort();
    };
  }, []);

  return stream;
}
