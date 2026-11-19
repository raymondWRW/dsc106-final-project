// Scrollytelling glue. Each .step[data-act] card, when it scrolls to the middle of the screen,
// runs the action registered under that name. The charts register their actions once their data loads
// (Story.register), so a step that scrolls into view before the data arrives still runs afterwards.
(() => {
  const acts = {};
  const active = {};   // section id -> name of the step currently in view

  window.Story = {
    register(name, fn) {
      acts[name] = fn;
      for (const sec in active) if (active[sec] === name) fn();
    },
  };

  const steps = [...document.querySelectorAll(".step")];
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const sec = e.target.closest("section").id;
    steps.forEach(s => { if (s.closest("section").id === sec) s.classList.toggle("is-active", s === e.target); });
    active[sec] = e.target.dataset.act;
    if (acts[active[sec]]) acts[active[sec]]();
  }), { rootMargin: "-45% 0px -45% 0px" });   // a thin band across the middle of the viewport
  steps.forEach(s => io.observe(s));
})();
