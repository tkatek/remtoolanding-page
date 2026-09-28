/* ==========================================================================
   Remtoo Landing — interactions
   Vanilla JS only: mobile nav, carousel, tabs, accordions, reveal, helpers
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

  const closeMenu = () => {
    if (!mobileMenu.classList.contains("is-open")) return;
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

    // Close after selecting a navigation item
    $$("a", mobileMenu).forEach((a) => a.addEventListener("click", closeMenu));

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // Close when clicking/tapping outside the panel
    document.addEventListener("click", (e) => {
      if (
        mobileMenu.classList.contains("is-open") &&
        !mobileMenu.contains(e.target) &&
        !menuToggle.contains(e.target)
      ) {
        closeMenu();
      }
    });

    // Reset when resizing up to desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1080) closeMenu();
    });
  }

  /* ------------------------------------------------------------------
     Reveal-on-scroll (subtle fade-up)
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
     Testimonial carousel (scroll-snap + buttons + dots + keyboard)
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

    const setActive = (i) => dots.forEach((d, j) => d.classList.toggle("is-active", i === j));

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
     Free sample — level tabs + lesson data
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
        <span class="free">FREE</span>
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
        <a class="btn btn-soft btn-block" href="#get-started">Try this lesson <svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
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
     Footer accordions (mobile)
  ------------------------------------------------------------------ */
  $$(".accordion-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (panel) panel.classList.toggle("is-open", !expanded);
    });
  });

  /* ------------------------------------------------------------------
     Current year
  ------------------------------------------------------------------ */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ------------------------------------------------------------------
     Active nav link highlighting while scrolling
  ------------------------------------------------------------------ */
  const navLinks = $$('.nav-list .nav-link[href^="#"]');
  const sections = navLinks
    .map((l) => document.getElementById(l.getAttribute("href").slice(1)))
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    const navIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((l) =>
              l.setAttribute(
                "aria-current",
                l.getAttribute("href") === `#${entry.target.id}` ? "true" : "false"
              )
            );
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => navIo.observe(s));
  }
})();
