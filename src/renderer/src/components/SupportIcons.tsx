import { createUniqueId } from "solid-js";

/**
 * The rail's three support links as one set: the same raised, glossy tile in three rich
 * colours (rose, gold, brand navy), each with a white glyph that has a soft shadow. A sparkle
 * shows on hover (see revamp.css).
 */
type Kind = "support" | "star" | "discord" | "telegram" | "website";

const TILE: Record<Kind, { from: string; mid: string; to: string; glow: string }> = {
  support: { from: "#FF9AA8", mid: "#F0476A", to: "#B3123A", glow: "#B3123A" },
  star: { from: "#FFE07A", mid: "#F7A823", to: "#C46F06", glow: "#C46F06" },
  discord: { from: "#98A2FF", mid: "#5865F2", to: "#3540B8", glow: "#3540B8" },
  telegram: { from: "#7FD4FF", mid: "#2AABEE", to: "#1479B8", glow: "#1479B8" },
  website: { from: "#6C7FE0", mid: "#3346A6", to: "#1A2350", glow: "#1A2350" },
};

/** Brand marks drawn on a 24 x 24 grid; they are scaled into the tile. */
const BRAND: Partial<Record<Kind, string>> = {
  discord:
    "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z",
  telegram:
    "M21.94 4.6 18.7 19.86c-.24 1.07-.88 1.34-1.78.83l-4.93-3.63-2.38 2.29c-.26.26-.48.48-.99.48l.35-5.02 9.14-8.26c.4-.35-.09-.55-.62-.2L6.2 13.46l-4.86-1.52c-1.06-.33-1.08-1.06.22-1.57L20.58 3.05c.88-.33 1.65.2 1.36 1.55z",
};

const GLYPH: Record<"support" | "star" | "website", string> = {
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
        {BRAND[props.kind] ? (
          <path
            d={BRAND[props.kind]}
            transform={
              props.kind === "telegram"
                ? "translate(8.6 9.4) scale(0.9)"
                : "translate(9 9.2) scale(0.92)"
            }
            fill="#fff"
            filter={`url(#${id}-glyph)`}
          />
        ) : (
          <path
            class={props.kind === "support" ? "support-heart" : undefined}
            d={GLYPH[props.kind as "support" | "star" | "website"]}
            fill="#fff"
            fill-rule="evenodd"
            filter={`url(#${id}-glyph)`}
          />
        )}
        <path class="support-sparkle" d="M31 6 L32 9 L35 10 L32 11 L31 14 L30 11 L27 10 L30 9 Z" />
      </svg>
    </span>
  );
}
