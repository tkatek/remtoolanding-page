/* Remtoo Free Sample page interactions: accessible level tabs and mobile testimonials. */
(() => {
  "use strict";

  document.documentElement.classList.add("fs-js");

  const levelTabs = [...document.querySelectorAll("[data-sample-level]")];
  const lessonPanel = document.getElementById("sample-lessons");
  const levelStatus = document.getElementById("sample-level-status");

  if (levelTabs.length && lessonPanel) {
    levelTabs.forEach((tab, index) => {
      tab.disabled = false;
      tab.removeAttribute("aria-disabled");
      tab.tabIndex = index === 0 ? 0 : -1;
    });

    const a1Markup = lessonPanel.innerHTML;
    const reducePanelMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const upcomingLevels = {
      a2: {
        code: "A2",
        name: "Elementary",
        description: "Develop communication skills in real contexts.",
        tone: "mint",
        teasers: [
          { title: "At the Restaurant", focus: "Real-life communication", duration: "45 min", image: "assets/images/lessons/restaurant-conversation.webp" },
          { title: "Video Lesson Preview", focus: "Listening · Vocabulary", duration: "45 min", image: "assets/images/lessons/meeting.webp" },
          { title: "Speaking Activity", focus: "Guided pair practice", duration: "50 min", image: "assets/images/lessons/pair-work.webp" },
        ],
      },
      b1: {
        code: "B1",
        name: "Intermediate",
        description: "Communicate independently at work, while travelling, and in daily life.",
        tone: "sky",
        teasers: [
          { title: "Video Lesson", focus: "Context · Comprehension", duration: "55 min", image: "assets/images/lessons/waving-woman.webp" },
          { title: "Speaking Activity", focus: "Work · Travel · Daily life", duration: "55 min", image: "assets/images/lessons/meeting.webp" },
          { title: "Lesson Assessment", focus: "Review · Progress check", duration: "50 min", image: "assets/images/lessons/classroom.webp" },
        ],
      },
      b2: {
        code: "B2",
        name: "Upper Intermediate",
        description: "Handle more complex conversations with ease.",
        tone: "violet",
        teasers: [
          { title: "Interactive Video", focus: "Nuance · Comprehension", duration: "60 min", image: "assets/images/lessons/classroom.webp" },
          { title: "Discussion Activity", focus: "Complex conversations", duration: "55 min", image: "assets/images/lessons/teacher-teaching.webp" },
          { title: "Teacher Notes", focus: "Prompts · Extension tasks", duration: "60 min", image: "assets/images/lessons/pair-work.webp" },
        ],
      },
      c1: {
        code: "C1",
        name: "Advanced",
        description: "Communicate confidently in professional and academic settings.",
        tone: "rose",
        teasers: [
          { title: "Advanced Video", focus: "Register · Precision", duration: "60 min", image: "assets/images/lessons/teacher-laptop.webp" },
          { title: "Academic Discussion", focus: "Critical thinking", duration: "60 min", image: "assets/images/lessons/meeting.webp" },
          { title: "Progress Assessment", focus: "Professional · Academic", duration: "60 min", image: "assets/images/lessons/teacher-teaching.webp" },
        ],
      },
    };

    const panelTransition = () => {
      if (reducePanelMotion || typeof lessonPanel.animate !== "function") return;
      lessonPanel.animate(
        [
          { opacity: 0.35, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 280, easing: "cubic-bezier(.22,.75,.24,1)" },
      );
    };

    const teaserCard = (level, lesson) => `
      <article class="fs-teaser-card fs-teaser-card--${level.tone}" aria-label="${lesson.title}, coming soon">
        <div class="fs-teaser-thumb" aria-hidden="true">
          <img src="${lesson.image}" alt="" width="640" height="427" loading="lazy" decoding="async" />
          <span class="fs-teaser-lock"><svg class="ic"><use href="#i-lock"/></svg></span>
          <span class="fs-coming-badge">Coming soon</span>
        </div>
        <div class="fs-teaser-body">
          <span class="fs-teaser-level">${level.code} preview</span>
          <h4>${lesson.title}</h4>
          <p>${lesson.focus}</p>
          <span class="fs-teaser-duration"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>${lesson.duration}</span>
        </div>
      </article>`;

    const comingSoonMarkup = (level) => `
      <div class="fs-coming-shell fs-coming-shell--${level.tone}">
        <div class="fs-coming-main">
          <div class="fs-coming-copy">
            <p class="fs-coming-kicker"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>${level.code} sample library</p>
            <div><h3>${level.code} sample lessons are coming soon</h3><p>${level.description} Our ${level.name.toLowerCase()} samples are being prepared and reviewed for the full Remtoo lesson experience. Explore A1 now or see how ${level.code} fits into the complete curriculum.</p></div>
            <div class="fs-coming-actions">
              <button class="btn btn-primary" type="button" data-switch-sample-level="a1">Explore A1 Lessons <svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></button>
              <a class="btn btn-white" href="schools.html#demo">Book a Demo</a>
            </div>
            <a class="fs-coming-text-link" href="curriculum.html#levels">See Full Curriculum <svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
          </div>
          <div class="fs-coming-visual" data-level="${level.code}" aria-hidden="true">
            <span class="fs-visual-orbit"></span>
            <div class="fs-level-medallion"><small>Next up</small><strong>${level.code}</strong><span>${level.name}</span></div>
            <div class="fs-kit-card fs-kit-card--video"><span class="fs-kit-icon"><svg class="ic ic-fill"><use href="#i-play"/></svg></span><div><small>Lesson video</small><i></i><i></i><i></i></div></div>
            <div class="fs-kit-card fs-kit-card--worksheet"><span>Teacher notes</span><i></i><i></i><i></i><i></i></div>
            <div class="fs-kit-progress"><span>Lesson kit</span><i><b></b></i><small>In production</small></div>
          </div>
        </div>
        <div class="fs-teaser-heading"><div><span>Preview roadmap</span><h4>A glimpse at what we are preparing for ${level.code}</h4></div><p>Titles are early previews and remain locked until the lessons pass review.</p></div>
        <div class="fs-teaser-grid">${level.teasers.map((lesson) => teaserCard(level, lesson)).join("")}</div>
      </div>`;

    const renderLevel = (tab) => {
      const selectedLevel = tab.dataset.sampleLevel;

      levelTabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });

      lessonPanel.setAttribute("aria-labelledby", tab.id);

      if (selectedLevel === "a1") {
        lessonPanel.classList.remove("is-coming");
        lessonPanel.innerHTML = a1Markup;
        lessonPanel.querySelectorAll(".reveal").forEach((card) => card.classList.add("is-visible"));
        if (levelStatus) levelStatus.textContent = "Showing four available A1 sample lessons.";
        panelTransition();
        return;
      }

      const level = upcomingLevels[selectedLevel];
      if (!level) return;
      lessonPanel.classList.add("is-coming");
      lessonPanel.innerHTML = comingSoonMarkup(level);
      if (levelStatus) levelStatus.textContent = `${level.code} sample lessons are coming soon. Preview roadmap and next actions are shown.`;
      panelTransition();
    };

    levelTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => renderLevel(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % levelTabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + levelTabs.length) % levelTabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = levelTabs.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        levelTabs[nextIndex].focus();
        renderLevel(levelTabs[nextIndex]);
      });
    });

    lessonPanel.addEventListener("click", (event) => {
      const switcher = event.target.closest("[data-switch-sample-level]");
      if (!switcher) return;
      const target = levelTabs.find((tab) => tab.dataset.sampleLevel === switcher.dataset.switchSampleLevel);
      if (!target) return;
      target.focus({ preventScroll: true });
      renderLevel(target);
    });
  }

  const track = document.getElementById("sample-testimonials");
  const previous = document.getElementById("sample-testimonial-prev");
  const next = document.getElementById("sample-testimonial-next");
  const dots = document.getElementById("sample-testimonial-dots");
  const status = document.getElementById("sample-testimonial-status");

  if (track && previous && next && dots && status) {
    const cards = [...track.children];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const carouselQuery = window.matchMedia("(max-width: 760px)");
    let current = 0;

    const dotButtons = cards.map((_, index) => {
      const dot = document.createElement("span");
      dot.className = `fs-carousel-dot${index === 0 ? " is-active" : ""}`;
      dots.appendChild(dot);
      return dot;
    });

    const setCurrent = (index) => {
      const nextCurrent = Math.max(0, Math.min(cards.length - 1, index));
      const changed = nextCurrent !== current;
      current = nextCurrent;
      dotButtons.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === current));
      previous.disabled = current === 0;
      next.disabled = current === cards.length - 1;
      if (carouselQuery.matches && changed) {
        status.textContent = `Testimonial ${current + 1} of ${cards.length}`;
      }
    };

    const updateCarouselMode = () => {
      if (carouselQuery.matches) {
        track.tabIndex = 0;
        track.setAttribute("aria-label", "Testimonials. Use arrow keys or the controls to browse");
        status.textContent = `Testimonial ${current + 1} of ${cards.length}`;
      } else {
        track.removeAttribute("tabindex");
        track.setAttribute("aria-label", "Testimonials");
      }
    };

    const closestCard = () => {
      const center = track.scrollLeft + track.clientWidth / 2;
      let bestIndex = 0;
      let bestDistance = Infinity;
      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    };

    const goTo = (index) => {
      setCurrent(index);
      const card = cards[current];
      track.scrollTo({
        left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    previous.addEventListener("click", () => goTo(current - 1));
    next.addEventListener("click", () => goTo(current + 1));
    track.addEventListener("scroll", () => setCurrent(closestCard()), { passive: true });
    track.addEventListener("keydown", (event) => {
      if (!carouselQuery.matches) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(current + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(current - 1);
      }
    });
    window.addEventListener("resize", () => {
      updateCarouselMode();
      setCurrent(closestCard());
    }, { passive: true });
    carouselQuery.addEventListener("change", updateCarouselMode);
    updateCarouselMode();
    setCurrent(0);
  }
})();
