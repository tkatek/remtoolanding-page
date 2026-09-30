/* Remtoo homepage behavior: reveal-on-scroll + hero testimonial carousel.
   Navigation, drawer, footer and year live in site-shell.js. */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const carousel = track.closest(".testimonial-carousel");
    let activeIndex = Math.min(1, cards.length - 1);
    let measureFrame = 0;
    let swipeStart = null;

    const wrapIndex = (index) => (index + cards.length) % cards.length;

    const dots = cards.map((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to testimonial ${index + 1}`);
      dot.addEventListener("click", () => goTo(index));
      dotsContainer.appendChild(dot);
      return dot;
    });

    const measureTrack = () => {
      measureFrame = 0;
      const tallestCard = Math.ceil(Math.max(...cards.map((card) => card.offsetHeight)));
      if (!tallestCard) return;
      const height = `${tallestCard}px`;
      track.style.setProperty("--testimonial-height", height);
      carousel?.style.setProperty("--testimonial-height", height);
    };

    const scheduleMeasure = () => {
      if (measureFrame) cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(measureTrack);
    };

    const update = (index, announce = false) => {
      activeIndex = wrapIndex(index);
      const previousIndex = wrapIndex(activeIndex - 1);
      const nextIndex = wrapIndex(activeIndex + 1);

      cards.forEach((card, cardIndex) => {
        const isActive = cardIndex === activeIndex;
        card.classList.toggle("is-active", isActive);
        card.classList.toggle("is-previous", cardIndex === previousIndex);
        card.classList.toggle("is-next", cardIndex === nextIndex);
        if (isActive) card.setAttribute("aria-current", "true");
        else card.removeAttribute("aria-current");
      });

      dots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === activeIndex;
        dot.classList.toggle("is-active", isActive);
        if (isActive) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });

      track.dataset.activeIndex = String(activeIndex);
      track.setAttribute("aria-label", `Testimonial ${activeIndex + 1} of ${cards.length} selected`);
      if (announce && status) status.textContent = `Testimonial ${activeIndex + 1} of ${cards.length}`;
      scheduleMeasure();
    };

    const goTo = (index) => {
      update(index, true);
    };

    previousButton.addEventListener("click", () => goTo(activeIndex - 1));
    nextButton.addEventListener("click", () => goTo(activeIndex + 1));

    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(activeIndex + 1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(activeIndex - 1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        goTo(cards.length - 1);
      }
    });

    track.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      track.setPointerCapture?.(event.pointerId);
    });

    track.addEventListener("pointerup", (event) => {
      if (!swipeStart || swipeStart.id !== event.pointerId) return;
      const deltaX = event.clientX - swipeStart.x;
      const deltaY = event.clientY - swipeStart.y;
      const threshold = Math.max(44, track.clientWidth * 0.11);
      swipeStart = null;
      if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      goTo(activeIndex + (deltaX < 0 ? 1 : -1));
    });

    track.addEventListener("pointercancel", () => {
      swipeStart = null;
    });

    if ("ResizeObserver" in window) {
      const cardObserver = new ResizeObserver(scheduleMeasure);
      cards.forEach((card) => cardObserver.observe(card));
    }
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    document.fonts?.ready.then(scheduleMeasure);
    cards.forEach((card) => card.querySelector("img")?.addEventListener("load", scheduleMeasure, { once: true }));

    update(activeIndex);
  }

  window.__remtooHomeReady = true;
})();
