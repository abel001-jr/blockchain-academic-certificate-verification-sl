/**
 * RocketLoader
 * A rocket ship with speed-lines — fun fullscreen or splash loading state.
 * Source: rocket_loader.html (uiverse, MIT licence)
 * Adapted: all hard-coded #000 replaced with Intelligent Academic Credentialing navy.
 *
 * Usage:
 *   <RocketLoader />                  — renders rocket centered, caller provides container
 *   wrap in a fixed inset-0 div for a true fullscreen overlay
 */
export default function RocketLoader() {
  return (
    <div role="status" aria-label="Loading" className="cd-rocket-wrap">
      {/* Speed lines behind the rocket */}
      <div className="cd-rocket-fazers">
        <span /><span /><span /><span />
      </div>

      {/* The rocket itself */}
      <div className="cd-rocket">
        {/* Trailing exhaust sparks */}
        <span className="cd-rocket-sparks">
          <span /><span /><span /><span />
        </span>

        {/* Body */}
        <div className="cd-rocket-base">
          <span />
          <div className="cd-rocket-face" />
        </div>
      </div>
    </div>
  );
}
