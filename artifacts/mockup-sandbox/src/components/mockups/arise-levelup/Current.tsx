import './_group.css';

export function Current() {
  return (
    <main className="arise-mock arise-current">
      <section className="current-frame" aria-label="Current ARISE level-up dialog">
        <div className="current-alert">SYSTEM EVENT</div>
        <div className="current-stage" aria-hidden="true">
          <div className="current-ring ring-cyan" />
          <div className="current-ring ring-violet" />
          <div className="current-ring ring-gold" />
          <div className="current-number">
            <div className="caption">LEVEL UP</div>
            <div className="value">—</div>
          </div>
        </div>
        <div className="current-info">
          <div className="crown-placeholder" aria-hidden="true">♛</div>
          <div className="current-rank">
            <div className="current-key">CURRENT RANK</div>
            <div className="current-value">—</div>
          </div>
          <div className="current-total">
            <div className="current-key">TOTAL XP</div>
            <div className="current-value">—</div>
          </div>
        </div>
        <div className="current-track"><div className="current-fill" /></div>
        <div className="current-next">—% toward the next level · — XP</div>
        <button className="current-button" type="button">CONTINUE</button>
      </section>
    </main>
  );
}