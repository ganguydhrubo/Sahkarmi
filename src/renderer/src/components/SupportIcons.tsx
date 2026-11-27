import { createUniqueId } from "solid-js";

/**
 * The rail's three support links as one set: the same raised, glossy tile in three rich
 * colours (rose, gold, brand navy), each with a white glyph that has a soft shadow. A sparkle
 * shows on hover (see revamp.css).
 */
type Kind = "support" | "star" | "website";

const TILE: Record<Kind, { from: string; mid: string; to: string; glow: string }> = {
  support: { from: "#FF9AA8", mid: "#F0476A", to: "#B3123A", glow: "#B3123A" },
  star: { from: "#FFE07A", mid: "#F7A823", to: "#C46F06", glow: "#C46F06" },
  website: { from: "#6C7FE0", mid: "#3346A6", to: "#1A2350", glow: "#1A2350" },
};

const GLYPH: Record<Kind, string> = {
  support:
    "M20 29.2 C11.6 23.6 10 19 11.5 15.6 C13.2 11.9 17.7 11.8 20 15.2 C22.3 11.8 26.8 11.9 28.5 15.6 C30 19 28.4 23.6 20 29.2 Z",
  star: "M20 9.8 L23 16.1 L29.9 17 L24.9 21.8 L26.1 28.6 L20 25.3 L13.9 28.6 L15.1 21.8 L10.1 17 L17 16.1 Z",
  website:
    "M20 10 a10 10 0 1 0 0 20 a10 10 0 1 0 0 -20 Z M20 12.2 c1.5 1.7 2.5 4.4 2.6 6.7 h-5.2 c0.1 -2.3 1.1 -5 2.6 -6.7 Z M15.2 18.9 h-2.9 a7.9 7.9 0 0 1 4.3 -6 c-0.8 1.7 -1.3 3.9 -1.4 6 Z M24.8 18.9 c-0.1 -2.1 -0.6 -4.3 -1.4 -6 a7.9 7.9 0 0 1 4.3 6 Z M12.3 21.1 h2.9 c0.1 2.1 0.6 4.3 1.4 6 a7.9 7.9 0 0 1 -4.3 -6 Z M17.4 21.1 h5.2 c-0.1 2.3 -1.1 5 -2.6 6.7 c-1.5 -1.7 -2.5 -4.4 -2.6 -6.7 Z M24.8 21.1 h2.9 a7.9 7.9 0 0 1 -4.3 6 c0.8 -1.7 1.3 -3.9 1.4 -6 Z",
};

export function SupportIcon(props: { kind: Kind }) {
  const id = `sk-sup-${createUniqueId()}`;
  const tile = TILE[props.kind];
  return (
    <span class={`support-3d support-3d--${props.kind}`}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-tile`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stop-color={tile.from} />
            <stop offset="0.5" stop-color={tile.mid} />
            <stop offset="1" stop-color={tile.to} />
          </linearGradient>
          <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <filter id={`${id}-drop`} x="-30%" y="-30%" width="160%" height="175%">
            <feDropShadow
              dx="0"
              dy="2.4"
              stdDeviation="2"
              flood-color={tile.glow}
              flood-opacity="0.45"
            />
          </filter>
          <filter id={`${id}-glyph`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.3" />
          </filter>
        </defs>
        <rect
          x="3"
          y="3"
          width="34"
          height="34"
          rx="10.5"
          fill={`url(#${id}-tile)`}
          filter={`url(#${id}-drop)`}
        />
        <rect
          x="3.6"
          y="3.6"
          width="32.8"
          height="32.8"
          rx="10"
          fill="none"
          stroke="#fff"
          stroke-opacity="0.4"
          stroke-width="0.8"
        />
        <path
          d="M5.5 14 Q5.5 5.5 13.5 5.5 H26.5 Q34.5 5.5 34.5 14 Q20 19.5 5.5 14 Z"
          fill={`url(#${id}-gloss)`}
        />
        <path
          class={props.kind === "support" ? "support-heart" : undefined}
          d={GLYPH[props.kind]}
          fill="#fff"
          fill-rule="evenodd"
          filter={`url(#${id}-glyph)`}
        />
        <path class="support-sparkle" d="M31 6 L32 9 L35 10 L32 11 L31 14 L30 11 L27 10 L30 9 Z" />
      </svg>
    </span>
  );
}
