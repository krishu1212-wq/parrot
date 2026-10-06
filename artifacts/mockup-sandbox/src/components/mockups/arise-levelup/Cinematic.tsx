import './_group.css';

export function Cinematic() {
  return (
    <main className="arise-mock arise-cinematic">
      <section className="cinematic-screen" aria-label="ARISE cinematic level-up screen">
        <header className="cinematic-topbar">
          <div className="cinematic-brand">
            <div className="cinematic-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40"><path d="M20 2 24 15 38 20 24 24 20 38 16 24 2 20 16 15Z" /><path d="m20 9 4 11-4 11-4-11Z" /></svg>
            </div>
            <div><strong>ARISE</strong><small>STUDY SYSTEM</small></div>
          </div>
          <div className="cinematic-event"><i />SYSTEM EVENT</div>
        </header>

        <div className="cinematic-title">
          <div className="cinematic-system-emblem" aria-hidden="true">
            <svg viewBox="0 0 40 40"><path d="M20 2 24 15 38 20 24 24 20 38 16 24 2 20 16 15Z" /><path d="m20 9 4 11-4 11-4-11Z" /></svg>
          </div>
          <small>CONGRATULATIONS</small>
          <h1>LEVEL UP</h1>
          <i />
        </div>

        <div className="cinematic-core-wrap" aria-label="New level">
          <div className="cinematic-ring one"><i /></div>
          <div className="cinematic-ring two"><i /></div>
          <div className="cinematic-ring three"><i /></div>
          <div className="cinematic-core">
            <svg className="cinematic-core-wings" viewBox="0 0 180 190" aria-hidden="true">
              <path d="M90 4 145 22 171 61 160 120 128 156 90 184 52 156 20 120 9 61 35 22Z" />
              <path d="M35 69C17 52 12 42 16 34 31 39 46 50 56 66M145 69c18-17 23-27 19-35-15 5-30 16-40 32" />
              <path d="m37 83-18-18m124 18 18-18M48 112l-18-14m102 14 18-14" />
            </svg>
            <div className="cinematic-core-inner"><small>LEVEL</small><strong>—</strong></div>
          </div>
        </div>

        <div className="cinematic-body">
          <div className="cinematic-message">“You are getting stronger. Keep going.”</div>

          <div className="cinematic-stats">
            <div className="cinematic-rank-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48"><path d="m8 33 3-18 9 8 4-15 5 15 9-8 3 18Z" /><path d="M10 38h28M15 42h18" /></svg>
            </div>
            <div className="cinematic-stat"><small>CURRENT RANK</small><strong>—</strong></div>
            <div className="cinematic-divider" />
            <div className="cinematic-stat"><small>TOTAL XP</small><strong>—</strong></div>
          </div>

          <section className="cinematic-progress" aria-label="Progress to next level">
            <div className="cinematic-progress-head">
              <div className="cinematic-progress-title"><span>▥</span><div><small>PROGRESS TO NEXT LEVEL</small><strong>LV —</strong></div></div>
              <div className="cinematic-percent">—%</div>
            </div>
            <div className="cinematic-track"><i /></div>
            <div className="cinematic-xp"><span>TOTAL XP · —</span><span>TARGET · — XP</span></div>
          </section>

          <section className="cinematic-activities" aria-label="Today's recorded study activity">
            <div className="cinematic-activities-head"><strong>TODAY’S ACHIEVEMENT</strong><span className="cinematic-activity-hint">ONLY VERIFIED RECORDS</span></div>
            <div className="cinematic-activity-grid">
              {[0, 1, 2].map((item) => (
                <div className="cinematic-activity" key={item}>
                  <span className="cinematic-activity-icon">◇</span>
                  <span className="cinematic-activity-copy"><strong>—</strong><small>VERIFIED ACTIVITY</small></span>
                  <span className="cinematic-activity-spark" />
                </div>
              ))}
            </div>
            <div className="cinematic-note">Only recorded same-day activity appears here.</div>
          </section>

          <section className="cinematic-rewards" aria-label="Level-Up rewards">
            <div className="cinematic-rewards-head"><strong>LEVEL-UP REWARDS</strong><span>THIS LEVEL-UP</span></div>
            <div className="cinematic-rewards-empty">
              <span className="cinematic-rewards-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M3 10h18v11H3zM2 6h20v4H2zM12 6v15M12 6H7.5a2.5 2.5 0 1 1 2.5-2.5V6Zm0 0h4.5A2.5 2.5 0 1 0 14 3.5V6Z" /></svg>
              </span>
              <strong>NO NEW REWARDS</strong>
            </div>
          </section>

          <button className="cinematic-button" type="button"><span>CONTINUE</span><i>→</i></button>
        </div>
      </section>
    </main>
  );
}