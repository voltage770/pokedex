export default function AboutPage() {
  return (
    <div className="about-page">
      <aside className="news-about">
        <h2>about</h2>
        <p>
          a personal passion project with the goal of creating a useful and visually soothing
          pokemon database - free from noise, distractions or ads
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
      </aside>
    </div>
  );
}
