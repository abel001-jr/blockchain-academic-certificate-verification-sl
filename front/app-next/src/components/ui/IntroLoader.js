/**
 * IntroLoader
 * Three concentric rings that expand in sequence — fullscreen page/route loading.
 * Source: intro_loader.html (uiverse, MIT licence)
 * Adapted: uses Credence navy neumorphic shadows on the paper background.
 *
 * Props:
 *   size — outer ring px size (default 90)
 */
export default function IntroLoader({ size = 90 }) {
  const rings = [
    { s: size,           anim: "cd-intro-ring-1", delay: "0s"    },
    { s: size * (2 / 3), anim: "cd-intro-ring-2", delay: "0s"    },
    { s: size * (1 / 3), anim: "cd-intro-ring-3", delay: "0s"    },
  ];

  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ position: "relative", width: size, height: size, display: "inline-block" }}
    >
      {rings.map(({ s, anim }, i) => (
        <span
          key={i}
          className="cd-intro-ring"
          style={{
            width: s,
            height: s,
            left: `calc(50% - ${s / 2}px)`,
            top:  `calc(50% - ${s / 2}px)`,
            animationName: anim,
            animationDelay: `${i * 0}s`,
            zIndex: i + 1,
          }}
        />
      ))}
    </span>
  );
}
