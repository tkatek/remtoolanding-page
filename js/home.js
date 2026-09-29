(() => {
  "use strict";

  const header = document.getElementById("site-header");
  const menuButton = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const updateHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 10);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const closeMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    mobileMenu.classList.remove("is-open");
    mobileMenu.inert = true;
    mobileMenu.setAttribute("aria-hidden", "true");
  };

  if (menuButton && mobileMenu) {
    mobileMenu.inert = true;
    mobileMenu.setAttribute("aria-hidden", "true");

    menuButton.addEventListener("click", () => {
      const opening = menuButton.getAttribute("aria-expanded") !== "true";
      menuButton.setAttribute("aria-expanded", String(opening));
      menuButton.setAttribute("aria-label", opening ? "Close navigation" : "Open navigation");
      mobileMenu.classList.toggle("is-open", opening);
      mobileMenu.inert = !opening;
      mobileMenu.setAttribute("aria-hidden", String(!opening));
    });

    mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
        menuButton.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (!mobileMenu.classList.contains("is-open")) return;
      if (!mobileMenu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1040) closeMenu();
    });
  }

  const revealItems = [...document.querySelectorAll(".reveal")];
  if (!reducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const track = document.getElementById("testimonial-track");
  const previousButton = document.querySelector(".carousel-prev");
  const nextButton = document.querySelector(".carousel-next");
  const dotsContainer = document.querySelector(".carousel-dots");
  const status = document.getElementById("testimonial-status");

  if (track && previousButton && nextButton && dotsContainer) {
    const cards = [...track.children];
    let activeIndex = 0;
    let scrollFrame = 0;

    const dots = cards.map((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Show testimonial ${index + 1}`);
      dot.addEventListener("click", () => goTo(index));
      dotsContainer.appendChild(dot);
      return dot;
    });

    const update = (index, announce = false) => {
      activeIndex = Math.max(0, Math.min(cards.length - 1, index));
      dots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === activeIndex;
        dot.classList.toggle("is-active", isActive);
        if (isActive) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      if (announce && status) status.textContent = `Testimonial ${activeIndex + 1} of ${cards.length}`;
    };

    const goTo = (index) => {
      const nextIndex = (index + cards.length) % cards.length;
      const card = cards[nextIndex];
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: reducedMotion ? "auto" : "smooth" });
      update(nextIndex, true);
    };

    previousButton.addEventListener("click", () => goTo(activeIndex - 1));
    nextButton.addEventListener("click", () => goTo(activeIndex + 1));
    track.addEventListener(
      "scroll",
      () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          const closest = cards.reduce(
            (best, card, index) => {
              const distance = Math.abs(card.offsetLeft - track.offsetLeft - track.scrollLeft);
              return distance < best.distance ? { index, distance } : best;
            },
            { index: 0, distance: Infinity }
          );
          update(closest.index);
        });
      },
      { passive: true }
    );
    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(activeIndex + 1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(activeIndex - 1);
      }
    });
    update(0);
  }

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  window.__remtooHomeReady = true;
})();
