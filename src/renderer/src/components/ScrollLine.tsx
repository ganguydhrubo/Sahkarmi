import { createSignal, onCleanup, onMount } from "solid-js";

/**
 * One line of text that slides slowly to show its hidden end when it is too long for its box
 * (a coworker's status in the team list), then slides back. Short text stays still. The full
 * text is also the tooltip. Reduced motion keeps the usual "…" ending.
 */
export function ScrollLine(props: {
  text: string;
  class?: string;
  classList?: Record<string, boolean>;
}) {
  let box: HTMLSpanElement | undefined;
  let inner: HTMLSpanElement | undefined;
  const [distance, setDistance] = createSignal(0);

  const measure = () => {
    if (!box || !inner) return;
    const extra = Math.ceil(inner.scrollWidth - box.clientWidth);
    setDistance(extra > 4 ? extra : 0);
  };

  onMount(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (box) observer.observe(box);
    if (inner) observer.observe(inner);
    onCleanup(() => observer.disconnect());
  });

  return (
    <span
      ref={box}
      class={`scroll-line ${props.class ?? ""}`}
      classList={{ ...props.classList, "scroll-line-moving": distance() > 0 }}
      title={props.text}
      style={{
        "--scroll-distance": `-${distance()}px`,
        // About 30 px a second, never faster than 6 s for the whole back-and-forth.
        "--scroll-time": `${Math.max(6, Math.round((distance() / 30) * 2 + 4))}s`,
      }}
    >
      <span ref={inner} class="scroll-line-text">
        {props.text}
      </span>
    </span>
  );
}
