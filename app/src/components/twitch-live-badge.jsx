import { Link } from 'react-router-dom';
import TwitchGlitch from './twitch-glitch';

// header-right chip shown only while the twitch stream is live. clicking it
// drops the user on /about where the live player iframe is mounted. the chip
// auto-hides when offline (caller renders conditionally) so the header has
// zero footprint when there's nothing live.
//
// three reinforcing signals: glitch icon (this is twitch), pulsing dot
// (broadcast live now), text label (confirmed). each does a different job —
// strangers get the platform from the icon, the universal "live broadcast"
// cue from the dot, the explicit text confirms.
export default function TwitchLiveBadge() {
  return (
    <Link
      to="/about"
      className="twitch-live-badge"
      aria-label="streaming live on twitch — open about page"
    >
      <span className="twitch-live-badge__dot" aria-hidden="true" />
      <span className="twitch-live-badge__label">live</span>
      <TwitchGlitch className="twitch-live-badge__glitch" />
    </Link>
  );
}
