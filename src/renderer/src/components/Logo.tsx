import { createUniqueId } from "solid-js";

/**
 * Sahkarmi mark: two overlapping rounded shapes - two coworkers side by side.
 * Glossy 3D look (gradients, a soft highlight and a shadow). motion "turn" spins it slowly in 3D
 * (splash, About, first open); "shine" sends a light sweep across it now and then (small logos,
 * where a constant spin would distract). Reduced motion keeps it still.
 */
export function LogoMark(props: { size?: number; class?: string; motion?: "turn" | "shine" }) {
  const size = () => props.size ?? 28;
  const id = createUniqueId();
  const left = `sk-left-${id}`;
  const both = `sk-both-${id}`;
  const orange = `sk-orange-${id}`;
  const indigo = `sk-indigo-${id}`;
  const gloss = `sk-gloss-${id}`;
  const sweep = `sk-sweep-${id}`;
  return (
    <svg
      class={`logo-mark ${props.motion ? `logo-${props.motion}` : ""} ${props.class ?? ""}`}
      width={size()}
      height={size()}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={left}>
          <rect x="14" y="30" width="58" height="74" rx="29" />
        </clipPath>
        <clipPath id={both}>
          <rect x="14" y="30" width="58" height="74" rx="29" />
          <rect x="48" y="16" width="58" height="74" rx="29" />
        </clipPath>
        <linearGradient id={orange} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFA35C" />
          <stop offset="0.55" stop-color="#E8772E" />
          <stop offset="1" stop-color="#B9531B" />
        </linearGradient>
        <linearGradient id={indigo} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4A5490" />
          <stop offset="0.6" stop-color="#1F2A5C" />
          <stop offset="1" stop-color="#121a3d" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <linearGradient id={sweep} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0.75" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect
        class="logo-mark__indigo"
        x="14"
        y="30"
        width="58"
        height="74"
        rx="29"
        fill={`url(#${indigo})`}
      />
      <rect x="48" y="16" width="58" height="74" rx="29" fill={`url(#${orange})`} />
      <rect
        x="48"
        y="16"
        width="58"
        height="74"
        rx="29"
        fill="#8E3F1E"
        clip-path={`url(#${left})`}
      />
      <g clip-path={`url(#${both})`}>
        <ellipse cx="74" cy="30" rx="24" ry="11" fill={`url(#${gloss})`} />
        <ellipse cx="36" cy="44" rx="17" ry="8" fill={`url(#${gloss})`} opacity="0.6" />
        <rect class="logo-sweep" x="-60" y="0" width="40" height="120" fill={`url(#${sweep})`} />
      </g>
    </svg>
  );
}
