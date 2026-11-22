// Sahkarmi site: the film layer's motion. No library; everything is driven by the page's own
// scrolling (never the other way round) and stops for people who ask for less motion.
(() => {
  const root = document.documentElement;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // The opening title card and letterbox are removed once they have played.
  for (const element of document.querySelectorAll(".letterbox, .cine-title-card")) {
    element.addEventListener("animationend", () => element.remove(), { once: true });
  }

  // Everything arrives: the pieces of each section fade up, one after another.
  const arriving = [];
  // Parts of the page that already have their own entrance are left alone.
  const OWN_MOTION = ".reveal, .tg-stage, .plug-card, .toasts, .scene, [hidden]";
  for (const section of document.querySelectorAll("main > section:not(.hero)")) {
    let index = 0;
    for (const piece of section.querySelectorAll("h2, .wrap > p, li, article, details, figure")) {
      if (piece.closest(OWN_MOTION) || piece.classList.contains("cine")) continue;
      // One fade per piece: a list item inside an arriving card comes with its card.
      if (piece.parentElement?.closest(".cine")) continue;
      piece.classList.add("cine");
      piece.style.setProperty("--cine-i", String(index % 6));
      index += 1;
      arriving.push(piece);
    }
  }
  const headings = [...document.querySelectorAll("main section h2")];
  const scenes = [...document.querySelectorAll(".scene")];

  if (calm || !("IntersectionObserver" in window)) {
    for (const piece of arriving) piece.classList.add("cine-in");
    for (const scene of scenes) scene.classList.add("cine-in");
    for (const heading of headings) heading.classList.add("cine-seen-h");
  } else {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add(entry.target.tagName === "H2" ? "cine-seen-h" : "cine-in");
          if (entry.target.tagName === "H2") entry.target.classList.add("cine-in");
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const piece of arriving) seen.observe(piece);
    for (const scene of scenes) seen.observe(scene);
    for (const heading of headings) if (!arriving.includes(heading)) seen.observe(heading);
  }

  // Scroll position drives the film strip, the opening picture and each scene's slow move.
  let queued = false;
  const frame = () => {
    queued = false;
    const height = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    root.style.setProperty("--cine-scroll", String(Math.min(1, window.scrollY / height)));
    if (calm) return;
    root.style.setProperty("--cine-hero", String(Math.min(1, window.scrollY / window.innerHeight)));
    for (const scene of scenes) {
      const box = scene.getBoundingClientRect();
      if (box.bottom < -50 || box.top > window.innerHeight + 50) continue;
      const progress = (window.innerHeight - box.top) / (window.innerHeight + box.height);
      scene.style.setProperty("--scene-p", String(Math.max(0, Math.min(1, progress))));
    }
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  frame();

  // The opening video plays only where it is welcome: not on data-saver, not when less motion
  // is asked for. The still picture is always there underneath.
  const saving = navigator.connection?.saveData === true;
  // Films wait until the page has finished loading (plus a short pause), so the first view,
  // the words and the download button, is never slowed by a video download.
  const settled = new Promise((resolve) => {
    const later = () => setTimeout(resolve, 1500);
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
  });
  for (const video of document.querySelectorAll(".scene-video, .go-film")) {
    if (calm || saving) {
      video.remove();
    } else {
      video.muted = true;
      let inView = false;
      const play = () => {
        inView = true;
        settled.then(() => inView && video.play().catch(() => undefined));
      };
      // A film plays (and downloads) only while its scene is on screen.
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) play();
              else {
                inView = false;
                video.pause();
              }
            }
          },
          { rootMargin: "200px 0px" },
        ).observe(video);
      } else {
        play();
      }
    }
  }

  // A lamp follows the pointer through the opening scene, and cards lean towards it.
  if (finePointer && !calm) {
    const hero = document.querySelector(".hero.hero-campaign");
    hero?.addEventListener("pointermove", (event) => {
      const box = hero.getBoundingClientRect();
      hero.style.setProperty("--lamp-x", `${((event.clientX - box.left) / box.width) * 100}%`);
      hero.style.setProperty("--lamp-y", `${((event.clientY - box.top) / box.height) * 100}%`);
    });
    const cards = document.querySelectorAll(
      "main section article, main section .card, main section .vt-card, main section .feature",
    );
    for (const card of cards) {
      card.classList.add("cine-tilt");
      card.addEventListener("pointermove", (event) => {
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        card.style.setProperty("--tilt-x", `${(-y * 4).toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${(x * 5).toFixed(2)}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
      });
    }
  }

  // Music is the visitor's choice: silent until the button is pressed, soft when it plays.
  const sound = document.querySelector(".sound");
  if (sound) {
    const source = sound.getAttribute("data-src");
    let audio = null;
    let fade = 0;
    const fadeTo = (target) => {
      cancelAnimationFrame(fade);
      const step = () => {
        if (!audio) return;
        const next = audio.volume + (target - audio.volume) * 0.08;
        audio.volume = Math.max(0, Math.min(1, next));
        if (Math.abs(target - audio.volume) > 0.01) {
          fade = requestAnimationFrame(step);
        } else {
          audio.volume = target;
          if (target === 0) audio.pause();
        }
      };
      fade = requestAnimationFrame(step);
    };
    sound.addEventListener("click", () => {
      const on = sound.getAttribute("aria-pressed") !== "true";
      sound.setAttribute("aria-pressed", String(on));
      if (on) {
        if (!audio && source) {
          audio = new Audio(source);
          audio.loop = true;
          audio.volume = 0;
        }
        audio?.play().then(() => fadeTo(0.35)).catch(() => sound.setAttribute("aria-pressed", "false"));
      } else {
        fadeTo(0);
      }
    });
    // The film's own explainer video has sound of its own: the music steps back for it.
    for (const media of document.querySelectorAll("video:not(.scene-video):not(.go-film)")) {
      media.addEventListener("play", () => {
        if (sound.getAttribute("aria-pressed") === "true") sound.click();
      });
    }
  }
})();
