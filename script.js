document.addEventListener("DOMContentLoaded", () => {
  const progress = document.getElementById("progress");
  const tocLinks = Array.from(document.querySelectorAll(".toc a[href^='#']"));
  const tocTargets = tocLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progress.style.width = `${percent}%`;
  };

  const setActiveTocLink = (sectionId) => {
    for (const link of tocLinks) {
      const isActive = link.getAttribute("href") === `#${sectionId}`;
      link.classList.toggle("active", isActive);
    }
  };

  if ("IntersectionObserver" in window && tocTargets.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        setActiveTocLink(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1] }
    );

    for (const target of tocTargets) observer.observe(target);
  } else if (tocTargets.length > 0) {
    const updateActiveOnScroll = () => {
      const y = window.scrollY + window.innerHeight * 0.25;
      let current = tocTargets[0].id;
      for (const section of tocTargets) {
        if (section.offsetTop <= y) current = section.id;
      }
      setActiveTocLink(current);
    };
    window.addEventListener("scroll", updateActiveOnScroll, { passive: true });
    updateActiveOnScroll();
  }

  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
});
