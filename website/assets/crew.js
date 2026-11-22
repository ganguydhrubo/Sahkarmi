// "Meet the crew" loader. The 3D scene (crew-3d.js and three.js, about 700 KB) is fetched only
// when the section comes near, so it never slows the first view of the page. Without WebGL
// or modules the poster picture stays.
const stage = document.getElementById("crew-stage");

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

if (stage && "IntersectionObserver" in window && webglOk()) {
  const near = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      import("./crew-3d.js")
        .then((crew) => crew.start())
        .catch(() => stage.classList.remove("is-live"));
    },
    { rootMargin: "300px" },
  );
  near.observe(stage);
}
