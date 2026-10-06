import './_group.css';

function RankECrown() {
  return (
    <svg
      className="arise-level-crown arise-level-crown-refined"
      viewBox="0 0 100 100"
      role="img"
      aria-label="E-rank iron crown"
    >
      <defs>
        <linearGradient id="iron-crown-gradient-refined" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9FB4CF" />
          <stop offset="1" stopColor="#5A7494" />
        </linearGradient>
      </defs>
      <path d="M24 72 L24 44 L37 54 L50 34 L63 54 L76 44 L76 72 Z" fill="url(#iron-crown-gradient-refined)" stroke="#9FB4CF" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M24 72 L76 72 L72 82 L28 82 Z" fill="#5A7494" stroke="#9FB4CF" strokeWidth="1" />
      <polygon points="0,-4 3,0 0,4 -3,0" transform="translate(50 77)" fill="#F4FCFF" />
      <circle cx="50" cy="46" r="2.4" fill="#FFFFFF" fillOpacity="0.9" />
    </svg>
  );
}

export function Refined() {
  return (
    <main className="arise-level-preview">
      <section className="arise-level-surface arise-level-surface-refined" aria-label="Refined Home level and XP row">
        <div className="arise-level-row arise-level-row-refined">
          <RankECrown />
          <div className="arise-level-name-plate">
            <div className="arise-level-name">LEVEL-04</div>
          </div>
          <div className="arise-level-xp-divider" aria-hidden="true" />
          <div className="arise-level-xp arise-level-xp-refined">
            <div className="arise-level-xp-total">3,460</div>
            <div className="arise-level-xp-caption arise-level-xp-caption-refined">XP · NEXT 4,000</div>
          </div>
        </div>
      </section>
    </main>
  );
}