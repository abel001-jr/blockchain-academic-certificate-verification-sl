/**
 * FeatureStrip
 * Three-column trust indicator bar that sits immediately below the hero.
 * Collapses to a stacked list on mobile.
 */
const features = [
  { icon: "◇", label: "Institutionally issued"    },
  { icon: "▢", label: "Blockchain-anchored"        },
  { icon: "↻", label: "Independently verifiable"  },
];

export default function FeatureStrip() {
  return (
    <div className="cred-feature-strip">
      <div className="cred-features">
        {features.map(({ icon, label }) => (
          <div key={label} className="cred-feature">
            <span className="cred-feature-icon" aria-hidden="true">{icon}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
