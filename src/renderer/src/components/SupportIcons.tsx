import { createUniqueId } from "solid-js";
import { LogoMark } from "./Logo";

/**
 * Glossy 3D tiles for the rail's support links, all three on the same warm cream tile so they
 * read as one set (heart, gold star, logo). Each is a rounded tile with a light
 * top-left, a darker bottom-right, an inner gloss band and a soft drop shadow, so they
 * read as raised buttons. A sparkle shows on hover (see revamp.css).
 */
type Kind = "support" | "star" | "website";

function Tile(props: { id: string; from: string; mid: string; to: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${props.id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color={props.from} />
          <stop offset="0.55" stop-color={props.mid} />
          <stop offset="1" stop-color={props.to} />
        </linearGradient>
        <linearGradient id={`${props.id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.5" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <filter id={`${props.id}-drop`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow
            dx="0"
            dy="2.2"
            stdDeviation="1.8"
            flood-color="#1F2A5C"
            flood-opacity="0.35"
          />
        </filter>
      </defs>
      <rect
        x="3"
        y="3"
        width="34"
        height="34"
        rx="10"
        fill={`url(#${props.id}-tile)`}
        filter={`url(#${props.id}-drop)`}
      />
      <rect
        x="3.6"
        y="3.6"
        width="32.8"
        height="32.8"
        rx="9.6"
        fill="none"
        stroke="#fff"
        stroke-opacity="0.35"
        stroke-width="0.8"
      />
      <path
        d="M6 13 Q6 5.5 13 5.5 H27 Q34 5.5 34 13 Q20 18 6 13 Z"
        fill={`url(#${props.id}-gloss)`}
      />
    </>
  );
}

function Sparkle() {
  return (
    <path
      class="support-sparkle"
      d="M31 6 L32 9 L35 10 L32 11 L31 14 L30 11 L27 10 L30 9 Z"
      fill="#fff"
    />
  );
}

export function SupportIcon(props: { kind: Kind }) {
  const id = `sk-sup-${createUniqueId()}`;
  if (props.kind === "website") {
    return (
      <span class="support-3d support-3d--website">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <Tile id={id} from="#FFF8EE" mid="#F6E7D2" to="#E2C9A8" />
          <Sparkle />
        </svg>
        <LogoMark size={22} motion="shine" class="support-3d-logo" />
      </span>
    );
  }
  if (props.kind === "star") {
    return (
      <span class="support-3d">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0" stop-color="#FFF3A6" />
              <stop offset="0.45" stop-color="#FFC93C" />
              <stop offset="1" stop-color="#C8860B" />
            </linearGradient>
          </defs>
          <Tile id={id} from="#FFF8EE" mid="#F6E7D2" to="#E2C9A8" />
          <path
            d="M20 9.5 L23.1 15.9 L30.1 16.8 L25 21.6 L26.3 28.6 L20 25.2 L13.7 28.6 L15 21.6 L9.9 16.8 L16.9 15.9 Z"
            fill={`url(#${id}-gold)`}
            stroke="#8A5A00"
            stroke-width="0.6"
            stroke-linejoin="round"
          />
          <path d="M20 11.5 L22.2 16.4 L17.6 16.9 Z" fill="#fff" opacity="0.55" />
          <Sparkle />
        </svg>
      </span>
    );
  }
  return (
    <span class="support-3d">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-heart`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stop-color="#FFE1E6" />
            <stop offset="0.35" stop-color="#FF5A78" />
            <stop offset="1" stop-color="#B3123A" />
          </radialGradient>
        </defs>
        <Tile id={id} from="#FFF8EE" mid="#F6E7D2" to="#E2C9A8" />
        <path
          class="support-heart"
          d="M20 29 C11 23 9.5 18.5 11.2 15.2 C13 11.8 17.6 11.6 20 15 C22.4 11.6 27 11.8 28.8 15.2 C30.5 18.5 29 23 20 29 Z"
          fill={`url(#${id}-heart)`}
          stroke="#7A0C26"
          stroke-width="0.5"
        />
        <ellipse
          cx="15.6"
          cy="16.2"
          rx="2.2"
          ry="1.3"
          fill="#fff"
          opacity="0.7"
          transform="rotate(-30 15.6 16.2)"
        />
        <Sparkle />
      </svg>
    </span>
  );
}
