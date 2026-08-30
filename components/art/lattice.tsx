/**
 * The drawn art system.
 *
 * Everything illustrative on this site is built here out of SVG and gradients
 * rather than shipped as an image. Three reasons, in order of how much they
 * matter:
 *
 *   1. It themes. The old banner was a dark PNG, so in the light theme a black
 *      rectangle sat at the top of a white page. These read the --art-* tokens
 *      and are correct in both themes by construction.
 *   2. There is nothing to wait for, nothing to lay out around, and no second
 *      request before the page has a shape.
 *   3. It scales to any width without a crop that cuts the subject in half.
 *
 * The mesh geometry is a fixed table, not generated. Anything random here
 * would differ between the server render and the client one and tear
 * hydration — and a mesh that reshuffles on every visit is not an identity.
 */

/**
 * Points of the node graph, in the 1200x200 space the hero draws into. The
 * slice is anchored left (xMinYMid), so a phone-width hero keeps the logo mark
 * and loses the tail of the network rather than the other way round.
 */
const NODES: [number, number, number][] = [
  // x, y, radius. Larger nodes read as hubs, which is what gives the mesh a
  // sense of structure rather than scatter.
  [612, 40, 3.5],
  [688, 74, 5],
  [742, 32, 3],
  [806, 102, 3.5],
  [864, 53, 6],
  [918, 126, 3],
  [968, 72, 4],
  [1024, 31, 3.5],
  [1046, 113, 5],
  [1108, 68, 3],
  [1152, 136, 3.5],
  [654, 134, 3],
  [760, 156, 4],
  [880, 166, 3],
  [982, 150, 3.5],
  [1094, 170, 3],
  [566, 90, 3],
  [1176, 30, 3],
];

/** Which nodes are joined. Chosen by hand so the graph reads as a network. */
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [3, 5], [4, 6],
  [4, 7], [5, 6], [6, 7], [6, 8], [7, 9], [8, 9], [8, 10], [9, 17], [5, 8],
  [0, 16], [16, 11], [11, 1], [11, 12], [12, 3], [12, 13], [13, 5], [13, 14],
  [14, 8], [14, 15], [15, 10], [9, 10], [2, 17],
];

/**
 * The hexagon of the Redbelly mark, drawn as an outline. Flat-top, centred on
 * the origin so the caller can place it with a transform.
 */
function hexPath(r: number) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join("L")}Z`;
}

/**
 * The hero surface: a node graph over a hex mark, bloomed with brand red.
 *
 * `animated` drives a slow pulse on the hub nodes. It is off by default and
 * the pulse is suppressed under prefers-reduced-motion, because a background
 * that never stops moving is the kind of thing that looks impressive once and
 * is tiring on the fiftieth visit.
 */
export function LatticeHero({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <div className={className} aria-hidden>
      <div className="absolute inset-0 overflow-hidden">
        {/* Bloom and vignette. Kept in CSS rather than SVG so the colours come
            straight from the theme tokens with no fill plumbing. */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(120% 140% at 78% 18%, var(--art-bloom) 0%, transparent 58%),
              radial-gradient(80% 120% at 8% 100%, var(--art-bloom) 0%, transparent 55%),
              linear-gradient(120deg, var(--art-ink) 0%, transparent 62%)
            `,
          }}
        />

        {/* Infrastructure ruling. Very low contrast on purpose — it should be
            felt as texture, not read as a grid. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--art-line-soft) 1px, transparent 1px),
              linear-gradient(to bottom, var(--art-line-soft) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
            maskImage:
              "linear-gradient(to right, black 0%, transparent 55%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 0%, transparent 55%)",
          }}
        />

        <svg
          viewBox="0 0 1200 200"
          preserveAspectRatio="xMinYMid slice"
          className="absolute inset-0 size-full"
        >
          <defs>
            <filter id="rb-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="rb-edge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--art-line)" />
              <stop offset="100%" stopColor="var(--art-node)" />
            </linearGradient>
          </defs>

          {/* The mark: three nested hexagons, the outer one heaviest. */}
          <g transform="translate(150 100)" fill="none">
            <path
              d={hexPath(72)}
              stroke="var(--art-node)"
              strokeWidth="2.5"
              filter="url(#rb-glow)"
              opacity="0.9"
            />
            <path d={hexPath(54)} stroke="var(--art-line)" strokeWidth="1.5" />
            <path d={hexPath(33)} stroke="var(--art-line)" strokeWidth="1" />
            {/* Spokes, echoing the lattice inside the real logo mark. */}
            {Array.from({ length: 6 }, (_, i) => {
              const a = (Math.PI / 3) * i;
              return (
                <line
                  key={i}
                  x1={33 * Math.cos(a)}
                  y1={33 * Math.sin(a)}
                  x2={72 * Math.cos(a)}
                  y2={72 * Math.sin(a)}
                  stroke="var(--art-line)"
                  strokeWidth="1"
                />
              );
            })}
          </g>

          {/* The network. */}
          <g stroke="url(#rb-edge)" strokeWidth="1" opacity="0.55">
            {EDGES.map(([a, b]) => (
              <line
                key={`${a}-${b}`}
                x1={NODES[a][0]}
                y1={NODES[a][1]}
                x2={NODES[b][0]}
                y2={NODES[b][1]}
              />
            ))}
          </g>

          <g fill="var(--art-node)" filter="url(#rb-glow)">
            {NODES.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r}>
                {/* Only the hubs breathe, and only three of them, so the eye
                    has somewhere to settle instead of everything twitching. */}
                {animated && r >= 5 && (
                  <animate
                    attributeName="opacity"
                    values="1;0.45;1"
                    dur={`${3.6 + i * 0.7}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

/**
 * A quieter version of the same language, for panels that need a surface with
 * some life in it but must not compete with the content sitting on top.
 */
export function LatticePanel({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 120% at 100% 0%, var(--art-bloom) 0%, transparent 60%)",
        }}
      />
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full opacity-70"
      >
        <g transform="translate(340 24)" fill="none">
          <path d={hexPath(64)} stroke="var(--art-line)" strokeWidth="1.5" />
          <path d={hexPath(42)} stroke="var(--art-line)" strokeWidth="1" />
        </g>
        <g transform="translate(46 178)" fill="none">
          <path d={hexPath(48)} stroke="var(--art-line)" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Empty states. A drawn scene rather than an icon centred in grey text — an
 * empty list is a moment the interface is being looked at closely, and a
 * lucide glyph at 40% opacity is what "nobody designed this" looks like.
 */
export function EmptyArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 96"
      className={className}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="rb-empty" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--art-node)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--art-node)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Three ballot slips, the front one empty. */}
      <rect x="30" y="20" width="86" height="60" rx="6" stroke="var(--art-line)" />
      <rect x="38" y="14" width="86" height="60" rx="6" stroke="var(--art-line)" opacity="0.6" />
      <rect
        x="46"
        y="8"
        width="86"
        height="60"
        rx="6"
        stroke="url(#rb-empty)"
        strokeWidth="1.5"
        fill="var(--art-bloom)"
      />
      <line x1="60" y1="28" x2="104" y2="28" stroke="var(--art-line)" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="40" x2="88" y2="40" stroke="var(--art-line)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="118" cy="52" r="9" stroke="var(--art-node)" strokeWidth="1.5" />
    </svg>
  );
}
