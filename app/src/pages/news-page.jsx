// ─── NewsPage ────────────────────────────────────────────────────────────────
//
// two-tier data flow:
//
//   1. on mount we render the BUNDLED news.json immediately — whatever was
//      committed into the repo the last time `scripts/news/fetch-news.js`
//      was run. this is the fallback; it's always available with no network.
//
//   2. in parallel we fire a `fetch()` at the cloudflare worker's /news.json
//      endpoint to get LIVE data. if it resolves cleanly we swap the bundled
//      copy out for the live copy. if it fails we keep showing the bundled
//      copy and surface a small "using cached copy" pill.
//
// this gives instant rendering (no loading spinner) AND fresh data (as soon
// as the worker responds) AND resilience (page still works if the worker is
// down, cors-blocked, or the user is offline).

import { useEffect, useState } from 'react';
import bundledNews from '../data/news.json';

// the live news endpoint served by the cloudflare worker. the worker's
// source lives at worker/src/index.js in this repo; `wrangler deploy`
// from the worker/ directory prints the real url when it finishes. paste
// it in here after the first deploy.
//
// you can override this at build time by setting VITE_NEWS_API in
// app/.env.local, which is handy when testing a local `wrangler dev`:
//
//   VITE_NEWS_API=http://localhost:8787/news.json
//
// if both the constant and the env var are wrong/unreachable, the bundled
// news.json takes over transparently.
const NEWS_API_URL =
  import.meta.env.VITE_NEWS_API ||
  'https://pokedex-news.voltage770.workers.dev/news.json';

// how long we'll wait for the worker before giving up and showing the
// bundled fallback. the worker's cold-start + upstream fetch on a cache
// miss takes ~2–4 sec worst case, so 6 sec leaves headroom without making
// the page feel stuck on a slow network.
const FETCH_TIMEOUT_MS = 6000;

// "apr 13, 2026" — lowercased to match the rest of the interface. the browser's
// Intl.DateTimeFormat gives us "Apr 13, 2026" with a titlecased month abbrev,
// so we .toLowerCase() the result on the way out.
function formatDate(iso) {
  if (!iso) return 'undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'undated';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).toLowerCase();
}

function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day  = 86400000;
  if (diff < 60000)      return 'just now';
  if (diff < 3600000)    return `${Math.floor(diff / 60000)}m ago`;
  if (diff < day)        return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * day)    return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day)   return `${Math.floor(diff / (7 * day))}w ago`;
  return null;
}

function NewsMedia({ entry }) {
  if (entry.youtube_id) {
    return (
      <div className="news-media news-media--youtube">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${entry.youtube_id}`}
          title={entry.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (entry.image) {
    return (
      <div className="news-media news-media--image">
        <a href={entry.url || '#'} target="_blank" rel="noopener noreferrer">
          <img
            src={entry.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
      </div>
    );
  }
  return null;
}

function NewsEntry({ entry }) {
  const rel = formatRelative(entry.published);
  return (
    <article className="news-entry">
      <div className="news-entry__head">
        <span className="news-entry__label">{entry.label}</span>
        <span className="news-entry__dot" aria-hidden="true">•</span>
        <span className="news-entry__source">{entry.source_name}</span>
        <span className="news-entry__spacer" />
        <time className="news-entry__date" dateTime={entry.published || undefined}>
          {formatDate(entry.published)}
          {rel && <span className="news-entry__rel"> ({rel})</span>}
        </time>
      </div>

      <h2 className="news-entry__title">
        <a href={entry.url || '#'} target="_blank" rel="noopener noreferrer">
          {entry.title}
        </a>
      </h2>

      <NewsMedia entry={entry} />

      {entry.excerpt && <p className="news-entry__excerpt">{entry.excerpt}</p>}

      <div className="news-entry__foot">
        <a
          className="news-entry__read"
          href={entry.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
        >
          read on {entry.source_name} →
        </a>
      </div>
    </article>
  );
}

function AboutPanel() {
  return (
    <aside className="news-about">
      <h2>about</h2>
      <p>
        a handmade pokédex built as a personal project — static react, no backend,
        data sourced from pokeapi and curated by hand.
      </p>
      <ul className="news-about__links">
        <li>
          <a href="https://github.com/voltage770" target="_blank" rel="noopener noreferrer">
            github / voltage770
          </a>
        </li>
        <li>
          <a href="https://www.twitch.tv/xgamesjc" target="_blank" rel="noopener noreferrer">
            twitch / xgamesjc
          </a>
        </li>
      </ul>
      <p className="news-about__note">
        more projects &amp; write-ups coming soon.
      </p>
    </aside>
  );
}

// fetches the live feed from the cloudflare worker with a short timeout. on
// any failure (network error, non-ok response, bad json, empty entries) the
// caller falls back to the bundled copy — the page always renders something.
async function fetchLiveNews(signal) {
  const res = await fetch(NEWS_API_URL, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`worker ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.entries)) throw new Error('bad payload');
  return data;
}

export default function NewsPage() {
  // initial state = bundled news. react renders this on the very first
  // paint — no empty state, no loading spinner. when the worker fetch
  // resolves, we replace it with the live data.
  const [data, setData]     = useState(bundledNews);
  // status is just for the tiny pill in the header meta row:
  //   'loading'  → spinner-like "refreshing…" pill
  //   'live'     → no pill, we got live data
  //   'fallback' → "using cached copy" pill (worker unreachable)
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    // AbortController is the web-platform way to cancel an in-flight fetch.
    // we use it twice: once from a setTimeout for the 6-second timeout, and
    // once from the useEffect cleanup function if the user navigates away
    // before the fetch finishes. without this, a slow fetch would try to
    // call setState on an unmounted component (which react warns about and
    // leaks memory).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    fetchLiveNews(controller.signal)
      .then(live => {
        setData(live);
        setStatus('live');
      })
      .catch(() => {
        // any failure — network error, 5xx, timeout, bad json — lands here.
        // we leave `data` as the bundled copy and flip status to 'fallback'.
        setStatus('fallback');
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    // useEffect cleanup: react calls this when the component unmounts.
    // we cancel both the timeout and the fetch so nothing tries to call
    // setData after we're gone.
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []); // empty deps array → run once on mount, never again.

  const { entries = [], updated, sources = [] } = data || {};
  const updatedText = updated
    ? new Date(updated).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).toLowerCase()
    : null;

  return (
    <div className="news-page">
      <header className="news-page__header">
        <h1>news</h1>
        <p className="news-page__meta">
          {entries.length} recent entries
          {updatedText && <> · updated {updatedText}</>}
          {sources.length > 0 && (
            <> · sources: {sources.map(s => s.name).join(', ')}</>
          )}
          {status === 'loading'  && <> · <span className="news-page__tag">refreshing…</span></>}
          {status === 'fallback' && <> · <span className="news-page__tag news-page__tag--warn">using cached copy</span></>}
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="news-page__empty">
          no entries yet — run <code>node news/fetch-news.js</code> from <code>scripts/</code>.
        </p>
      ) : (
        <div className="news-list">
          {entries.map((e, i) => (
            <div key={e.id} className="news-list__item">
              {i > 0 && <hr className="news-divider" />}
              <NewsEntry entry={e} />
            </div>
          ))}
        </div>
      )}

      <AboutPanel />
    </div>
  );
}
