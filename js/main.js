/* ==========================================================================
   Remtoo — shared site behavior (all pages)
   Vanilla JS: navigation, reveal, tabs, carousel, accordions, forms, language
   ========================================================================== */

(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ------------------------------------------------------------------
     Sticky header shadow
  ------------------------------------------------------------------ */
  const header = $("#site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ------------------------------------------------------------------
     Mobile navigation
  ------------------------------------------------------------------ */
  const menuToggle = $(".menu-toggle");
  const mobileMenu = $("#mobile-menu");

  const closeMenu = (restoreFocus = false) => {
    if (!mobileMenu || !mobileMenu.classList.contains("is-open")) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
    mobileMenu.classList.remove("is-open");
    mobileMenu.inert = true;
    if (restoreFocus) menuToggle.focus();
  };

  const openMenu = () => {
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close menu");
    mobileMenu.inert = false;
    mobileMenu.classList.add("is-open");
  };

  if (menuToggle && mobileMenu) {
    mobileMenu.inert = true;

    menuToggle.addEventListener("click", () => {
      menuToggle.getAttribute("aria-expanded") === "true" ? closeMenu() : openMenu();
    });

    $$("a", mobileMenu).forEach((a) => a.addEventListener("click", () => closeMenu()));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu(true);
    });

    document.addEventListener("click", (e) => {
      if (
        mobileMenu.classList.contains("is-open") &&
        !mobileMenu.contains(e.target) &&
        !menuToggle.contains(e.target)
      ) {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1080) closeMenu();
    });
  }

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
     Free sample — level tabs + lesson data (when present)
  ------------------------------------------------------------------ */
  const sampleGrid = $("#sample-lessons");
  const tabs = $$(".tab[data-level]");

  const IMG = {
    wave: "assets/images/lessons/waving-woman.webp",
    pair: "assets/images/lessons/pair-work.webp",
    class: "assets/images/lessons/classroom.webp",
    meet: "assets/images/lessons/meeting.webp",
    teach: "assets/images/lessons/teacher-teaching.webp",
  };

  const LESSONS = {
    a1: {
      code: "A1",
      items: [
        { n: 1, title: "Meet & Greet", min: 45, pages: 14, img: IMG.wave, dur: "6:24" },
        { n: 2, title: "Introductions", min: 50, pages: 16, img: IMG.pair, dur: "5:48" },
        { n: 3, title: "Everyday English", min: 45, pages: 12, img: IMG.class, dur: "7:12" },
        { n: 4, title: "Numbers & Time", min: 40, pages: 11, img: IMG.meet, dur: "4:56" },
      ],
    },
    a2: {
      code: "A2",
      items: [
        { n: 1, title: "Daily Routines", min: 50, pages: 15, img: IMG.pair, dur: "6:02" },
        { n: 2, title: "Shopping & Money", min: 45, pages: 13, img: IMG.meet, dur: "5:37" },
        { n: 3, title: "Past Stories", min: 55, pages: 17, img: IMG.class, dur: "7:44" },
        { n: 4, title: "Making Plans", min: 45, pages: 12, img: IMG.wave, dur: "5:15" },
      ],
    },
    b1: {
      code: "B1",
      items: [
        { n: 1, title: "Travel Stories", min: 60, pages: 18, img: IMG.class, dur: "8:05" },
        { n: 2, title: "Opinions & Debates", min: 60, pages: 16, img: IMG.meet, dur: "7:33" },
        { n: 3, title: "Work & Study", min: 55, pages: 15, img: IMG.pair, dur: "6:48" },
        { n: 4, title: "Health & Lifestyle", min: 50, pages: 14, img: IMG.teach, dur: "6:19" },
      ],
    },
    b2: {
      code: "B2",
      items: [
        { n: 1, title: "News & Media", min: 60, pages: 18, img: IMG.meet, dur: "8:12" },
        { n: 2, title: "Technology Today", min: 60, pages: 17, img: IMG.pair, dur: "7:26" },
        { n: 3, title: "The Environment", min: 55, pages: 16, img: IMG.class, dur: "7:58" },
        { n: 4, title: "Job Interviews", min: 50, pages: 14, img: IMG.teach, dur: "6:41" },
      ],
    },
    c1: {
      code: "C1",
      items: [
        { n: 1, title: "Global Issues", min: 60, pages: 19, img: IMG.teach, dur: "8:36" },
        { n: 2, title: "Academic English", min: 60, pages: 18, img: IMG.class, dur: "8:02" },
        { n: 3, title: "Idioms & Nuance", min: 55, pages: 15, img: IMG.wave, dur: "7:14" },
        { n: 4, title: "Professional Writing", min: 55, pages: 16, img: IMG.meet, dur: "6:55" },
      ],
    },
  };

  const lessonCard = (level, l) => `
    <article class="sample-card">
      <div class="sc-head">
        <span class="chip chip--level lv-${level}">${LESSONS[level].code} · Lesson ${l.n}</span>
        <span class="free-chip">FREE</span>
      </div>
      <h3>${l.title.replace(/&/g, "&amp;")}</h3>
      <p class="sc-meta">
        <span><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>${l.min} min</span>
        <span><svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg>${l.pages} pages</span>
      </p>
      <div class="sc-thumb">
        <img src="${l.img}" alt="Preview of the ${LESSONS[level].code} lesson ${l.title}" width="640" height="360" loading="lazy" decoding="async">
        <span class="play" aria-hidden="true"><span><svg class="ic ic-fill"><use href="#i-play"/></svg></span></span>
        <span class="duration" aria-hidden="true">${l.dur}</span>
      </div>
      <div class="sc-action">
        <a class="btn btn-soft btn-block" href="pricing.html">Unlock Full Lessons <svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
      </div>
    </article>`;

  const selectTab = (tab) => {
    tabs.forEach((t) => {
      const isActive = t === tab;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", String(isActive));
      t.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    const level = tab.dataset.level;
    if (sampleGrid) {
      sampleGrid.setAttribute("aria-labelledby", tab.id);
      sampleGrid.innerHTML = LESSONS[level].items.map((l) => lessonCard(level, l)).join("");
    }
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      let target = null;
      if (e.key === "ArrowRight") target = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") target = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") target = tabs[0];
      if (e.key === "End") target = tabs[tabs.length - 1];
      if (target) {
        e.preventDefault();
        target.focus();
        selectTab(target);
      }
    });
  });

  /* ------------------------------------------------------------------
     Impact metric count-up (For Schools page) — animates only the real
     values already printed in the HTML. Skipped entirely under
     prefers-reduced-motion or without IntersectionObserver, in which
     case the final values simply stay visible.
  ------------------------------------------------------------------ */
  const counters = $$("[data-countup]");
  if (counters.length && !reduceMotion && "IntersectionObserver" in window) {
    const fmt = (n) => n.toLocaleString("en-US");
    const animate = (el) => {
      const target = Number(el.dataset.target || "0");
      const suffix = el.dataset.suffix || "";
      const dur = 1400;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(target * eased)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            cio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach((c) => cio.observe(c));
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
     Footer language dropdown (English active; more coming soon)
  ------------------------------------------------------------------ */
  const langBtn = $("#lang-btn");
  const langMenu = $("#lang-menu");

  if (langBtn && langMenu) {
    const langItems = $$('button[role="menuitemradio"]', langMenu);
    const enabledLangItems = () => langItems.filter((item) => !item.disabled);

    const closeLang = (restoreFocus = false) => {
      langBtn.setAttribute("aria-expanded", "false");
      langMenu.classList.remove("is-open");
      langMenu.inert = true;
      if (restoreFocus) langBtn.focus();
    };

    const openLang = () => {
      langBtn.setAttribute("aria-expanded", "true");
      langMenu.inert = false;
      langMenu.classList.add("is-open");
      const checked = enabledLangItems().find((item) => item.getAttribute("aria-checked") === "true");
      const focusTarget = checked || enabledLangItems()[0];
      window.setTimeout(() => focusTarget?.focus(), 0);
    };

    langMenu.inert = true;

    langBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const expanded = langBtn.getAttribute("aria-expanded") === "true";
      if (expanded) {
        closeLang();
      } else {
        openLang();
      }
    });

    document.addEventListener("click", (e) => {
      if (!langMenu.contains(e.target) && !langBtn.contains(e.target)) closeLang();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && langBtn.getAttribute("aria-expanded") === "true") closeLang(true);
    });

    langMenu.addEventListener("keydown", (e) => {
      const items = enabledLangItems();
      const current = items.indexOf(document.activeElement);
      let next = current;
      if (e.key === "ArrowDown") next = (current + 1) % items.length;
      else if (e.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else return;
      e.preventDefault();
      items[next]?.focus();
    });

    langItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        langItems.forEach((b) =>
          b.setAttribute("aria-checked", String(b === btn))
        );
        closeLang(true);
      });
    });
  }

  /* ------------------------------------------------------------------
     Current year
  ------------------------------------------------------------------ */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
