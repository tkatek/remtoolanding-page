/* ==========================================================================
   Remtoo — shared site behavior (all pages)
   Vanilla JS: navigation, reveal, tabs, carousel, accordions, forms, language
   ========================================================================== */

(() => {
  "use strict";

  // Signal readiness to the head fail-safe (see inline script in each page).
  window.__remtooReady = true;

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

  const closeMenu = () => {
    if (!mobileMenu || !mobileMenu.classList.contains("is-open")) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
    mobileMenu.classList.remove("is-open");
  };

  const openMenu = () => {
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close menu");
    mobileMenu.classList.add("is-open");
  };

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", () => {
      menuToggle.getAttribute("aria-expanded") === "true" ? closeMenu() : openMenu();
    });

    $$("a", mobileMenu).forEach((a) => a.addEventListener("click", closeMenu));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
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
        d.setAttribute("aria-selected", String(active));
        d.setAttribute("tabindex", active ? "0" : "-1");
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
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", `Go to testimonial ${i + 1}`);
      dot.setAttribute("aria-selected", String(i === 0));
      dot.setAttribute("tabindex", i === 0 ? "0" : "-1");
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
    const closeLang = () => {
      langBtn.setAttribute("aria-expanded", "false");
      langMenu.classList.remove("is-open");
    };

    langBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const expanded = langBtn.getAttribute("aria-expanded") === "true";
      if (expanded) {
        closeLang();
      } else {
        langBtn.setAttribute("aria-expanded", "true");
        langMenu.classList.add("is-open");
      }
    });

    document.addEventListener("click", (e) => {
      if (!langMenu.contains(e.target) && !langBtn.contains(e.target)) closeLang();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLang();
    });

    $$("button[role='menuitemradio']", langMenu).forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("button[role='menuitemradio']", langMenu).forEach((b) =>
          b.setAttribute("aria-checked", String(b === btn))
        );
        closeLang();
      });
    });
  }

  /* ------------------------------------------------------------------
     Current year
  ------------------------------------------------------------------ */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
