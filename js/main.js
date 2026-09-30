/* ==========================================================================
   Remtoo — shared page behavior (loaded on every page except the homepage)
   Vanilla JS: reveal-on-scroll, FAQ accordions, testimonial carousel,
   demo request form. Navigation, drawer, footer and year live in
   site-shell.js; the homepage carousel/reveal live in home.js.
   ========================================================================== */

(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ------------------------------------------------------------------
     Reveal-on-scroll (subtle fade-up, staggered via --reveal-delay)
  ------------------------------------------------------------------ */
  const revealEls = $$(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!("IntersectionObserver" in window) || reduceMotion) {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  // Signal readiness only after the progressive-enhancement reveal gate is
  // safely configured. If setup above ever fails, the inline fail-safe keeps
  // all content visible instead of leaving it at opacity: 0.
  window.__remtooReady = true;

  /* ------------------------------------------------------------------
     Accordions (footer groups + FAQ items)
  ------------------------------------------------------------------ */
  $$(".accordion-trigger").forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (panel) {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      panel.inert = !expanded;
      panel.setAttribute("aria-hidden", String(!expanded));
    }

    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      if (panel) {
        panel.classList.toggle("is-open", !expanded);
        panel.inert = expanded;
        panel.setAttribute("aria-hidden", String(expanded));
      }
    });
  });

  /* ------------------------------------------------------------------
     Testimonial carousel (when present)
  ------------------------------------------------------------------ */
  const track = $("#testimonials-track");
  const prevBtn = $("#t-prev");
  const nextBtn = $("#t-next");
  const dotsWrap = $("#t-dots");

  if (track && prevBtn && nextBtn && dotsWrap) {
    const slides = [...track.children];
    dotsWrap.setAttribute("role", "group");

    /* The curriculum page uses a true responsive, paged carousel: all three
       cards on desktop, two on tablet, and one on mobile. Other pages keep
       the original single-card carousel behavior below. */
    if (track.closest("[data-responsive-testimonials]")) {
      const status = $("#testimonial-status");
      let dots = [];
      let pageStarts = [0];
      let targets = [0];
      let cardsPerView = 3;
      let currentPage = 0;
      let resizeFrame = 0;
      let scrollFrame = 0;
      let scrollSettleTimer = 0;
      let programmaticPage = null;

      const getCardsPerView = () => (window.innerWidth > 1180 ? 3 : window.innerWidth > 760 ? 2 : 1);

      const setActive = (pageIndex, announce = false) => {
        currentPage = Math.max(0, Math.min(pageStarts.length - 1, pageIndex));
        dots.forEach((dot, index) => {
          const active = index === currentPage;
          dot.classList.toggle("is-active", active);
          if (active) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });

        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = currentPage === pageStarts.length - 1;

        if (status) {
          const first = pageStarts[currentPage] + 1;
          const last = Math.min(slides.length, first + cardsPerView - 1);
          const message = `Showing testimonial${first === last ? "" : "s"} ${first}${first === last ? "" : `–${last}`} of ${slides.length}`;
          track.setAttribute("aria-label", `${message}. Use arrow keys to browse.`);
          if (status.textContent !== message) {
            status.setAttribute("aria-live", announce ? "polite" : "off");
            status.textContent = message;
          }
        }
      };

      const activePage = () => {
        let closest = 0;
        let distance = Infinity;
        targets.forEach((target, index) => {
          const nextDistance = Math.abs(track.scrollLeft - target);
          if (nextDistance < distance) {
            distance = nextDistance;
            closest = index;
          }
        });
        return closest;
      };

      const finishProgrammaticScroll = () => {
        programmaticPage = null;
        setActive(activePage());
      };

      const goToPage = (pageIndex, announce = true) => {
        const nextPage = Math.max(0, Math.min(pageStarts.length - 1, pageIndex));
        programmaticPage = nextPage;
        clearTimeout(scrollSettleTimer);
        track.scrollTo({ left: targets[nextPage] || 0, behavior: reduceMotion ? "auto" : "smooth" });
        setActive(nextPage, announce);
        scrollSettleTimer = window.setTimeout(finishProgrammaticScroll, 180);
      };

      const measureTargets = () => {
        const trackRect = track.getBoundingClientRect();
        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        targets = pageStarts.map((slideIndex) => {
          const slideRect = slides[slideIndex].getBoundingClientRect();
          return Math.max(0, Math.min(maxScroll, track.scrollLeft + slideRect.left - trackRect.left));
        });
      };

      const rebuild = () => {
        const previousStart = pageStarts[currentPage] || 0;
        const restoreDotFocus = dots.includes(document.activeElement);
        cardsPerView = getCardsPerView();
        pageStarts = Array.from(
          { length: Math.max(1, slides.length - cardsPerView + 1) },
          (_, index) => index
        );
        measureTargets();

        dotsWrap.replaceChildren();
        dots = pageStarts.map((start, pageIndex) => {
          const first = start + 1;
          const last = Math.min(slides.length, first + cardsPerView - 1);
          const dot = document.createElement("button");
          dot.type = "button";
          dot.className = "carousel-dot";
          dot.setAttribute(
            "aria-label",
            `Show testimonial${first === last ? "" : "s"} ${first}${first === last ? "" : ` to ${last}`}`
          );
          dot.addEventListener("click", () => goToPage(pageIndex));
          dotsWrap.appendChild(dot);
          return dot;
        });

        track.tabIndex = cardsPerView === slides.length ? -1 : 0;
        currentPage = Math.max(0, pageStarts.indexOf(Math.min(previousStart, pageStarts.at(-1))));
        track.scrollTo({ left: targets[currentPage] || 0, behavior: "auto" });
        setActive(currentPage);
        if (restoreDotFocus) dots[currentPage]?.focus();
      };

      prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
      nextBtn.addEventListener("click", () => goToPage(currentPage + 1));

      track.addEventListener(
        "scroll",
        () => {
          clearTimeout(scrollSettleTimer);
          if (programmaticPage !== null) {
            scrollSettleTimer = window.setTimeout(finishProgrammaticScroll, 180);
            return;
          }
          if (scrollFrame) return;
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = 0;
            setActive(activePage(), true);
          });
        },
        { passive: true }
      );

      track.addEventListener("keydown", (event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") goToPage(0);
        else if (event.key === "End") goToPage(pageStarts.length - 1);
        else goToPage(currentPage + (event.key === "ArrowRight" ? 1 : -1));
      });

      window.addEventListener("resize", () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          programmaticPage = null;
          clearTimeout(scrollSettleTimer);
          if (getCardsPerView() !== cardsPerView) {
            rebuild();
            return;
          }
          measureTargets();
          track.scrollTo({ left: targets[currentPage] || 0, behavior: "auto" });
          setActive(currentPage);
        });
      });

      rebuild();
    } else {
      const dots = [];

    const activeIndex = () => {
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      slides.forEach((s, i) => {
        const dist = Math.abs(s.offsetLeft + s.offsetWidth / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best;
    };

    const setActive = (i) =>
      dots.forEach((d, j) => {
        const active = i === j;
        d.classList.toggle("is-active", active);
        if (active) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });

    const goTo = (i) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, i));
      const s = slides[clamped];
      track.scrollTo({
        left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    slides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("aria-label", `Go to testimonial ${i + 1}`);
      if (i === 0) dot.setAttribute("aria-current", "true");
      dot.addEventListener("click", () => goTo(i));
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });

    const step = (dir) => goTo(activeIndex() + dir);

    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    track.addEventListener("scroll", () => setActive(activeIndex()), { passive: true });

    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    });

      window.addEventListener("resize", () => setActive(activeIndex()));
    }
  }

  /* ------------------------------------------------------------------
     Demo request form (For Schools page) — inline validation, then
     composes an email via mailto: because this static site has no
     backend endpoint.
  ------------------------------------------------------------------ */
  const demoForm = $("#demo-form");
  if (demoForm) {
    const validators = [
      { el: $("#df-name"), ok: (v) => v.trim().length > 1 },
      { el: $("#df-school"), ok: (v) => v.trim().length > 1 },
      {
        el: $("#df-email"),
        ok: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
      },
    ].filter((f) => f.el);

    const setError = (input, on) => {
      input.setAttribute("aria-invalid", on ? "true" : "false");
      const err = document.getElementById(`${input.id}-error`);
      if (err) err.hidden = !on;
    };

    validators.forEach(({ el }) => {
      el.addEventListener("input", () => setError(el, false));
    });

    demoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const summary = $("#demo-error");
      let firstInvalid = null;

      validators.forEach(({ el, ok }) => {
        const valid = ok(el.value || "");
        setError(el, !valid);
        if (!valid && !firstInvalid) firstInvalid = el;
      });

      if (firstInvalid) {
        if (summary) summary.hidden = false;
        firstInvalid.focus();
        return;
      }

      if (summary) summary.hidden = true;

      const data = new FormData(demoForm);
      const name = String(data.get("name") || "").trim();
      const school = String(data.get("school") || "").trim();
      const email = String(data.get("email") || "").trim();
      const size = String(data.get("size") || "").trim();
      const message = String(data.get("message") || "").trim();

      const subject = `Demo request — ${school || name || "School"}`;
      const body = [
        "Hello Remtoo team,",
        "",
        "I would like to book a 15-minute demo for our school.",
        "",
        `Name: ${name}`,
        `School / organization: ${school}`,
        `Email: ${email}`,
        `Number of teachers: ${size || "—"}`,
        message ? `Notes: ${message}` : "",
        "",
        "— Sent from the Remtoo website",
      ]
        .filter((line) => line !== "")
        .join("\n");

      window.location.href = `mailto:hello@remtoo.com?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;

      // A mailto: hand-off cannot confirm delivery. Keep the entered values in
      // place so the user can retry if no local email application is configured.
    });
  }

  /* ------------------------------------------------------------------
     Current year is injected by site-shell.js via [data-current-year].
  ------------------------------------------------------------------ */
})();
