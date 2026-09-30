/* Remtoo shared marketing-site shell: navigation, footer accordions, and active state. */
(() => {
  "use strict";

  const initSiteShell = () => {
    const root = document.documentElement;
    const body = document.body;
    const header = document.querySelector("[data-site-header]");
    const menuToggle = document.querySelector("[data-mobile-nav-toggle]");
    const mobileNav = document.querySelector("[data-mobile-nav]");
    const mobilePanel = mobileNav?.querySelector(".global-mobile-nav__panel");
    const desktopQuery = window.matchMedia("(min-width: 1121px)");

    root.classList.add("site-shell-js");
    body.classList.add("site-shell-js");

    const normalizeRoute = (route) => String(route || "").toLowerCase().replace(/\.html$/, "");
    const currentRoute = (() => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      return normalizeRoute(segments.at(-1) || "index.html");
    })();

    document.querySelectorAll("[data-nav-route]").forEach((link) => {
      const route = normalizeRoute(link.dataset.navRoute);
      if (route === currentRoute) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (header) {
      const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
      updateHeader();
      window.addEventListener("scroll", updateHeader, { passive: true });
    }

    const focusableSelector = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    let menuOpen = false;
    let previousBodyOverflow = "";
    let previousBodyPaddingRight = "";
    let focusBeforeMenu = null;

    const menuFocusables = () => {
      if (!mobilePanel) return [];
      return [...mobilePanel.querySelectorAll(focusableSelector)].filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true"
      );
    };

    const lockPageScroll = () => {
      previousBodyOverflow = body.style.overflow;
      previousBodyPaddingRight = body.style.paddingRight;
      const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
      body.style.overflow = "hidden";
      if (scrollbarWidth) body.style.paddingRight = `${scrollbarWidth}px`;
      root.classList.add("site-shell-nav-open");
      body.classList.add("site-shell-nav-open");
    };

    const unlockPageScroll = () => {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      root.classList.remove("site-shell-nav-open");
      body.classList.remove("site-shell-nav-open");
    };

    const setMenuOpen = (open, { restoreFocus = true } = {}) => {
      if (!menuToggle || !mobileNav || !mobilePanel || menuOpen === open) return;
      menuOpen = open;

      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      mobileNav.classList.toggle("is-open", open);
      mobileNav.setAttribute("aria-hidden", String(!open));
      mobileNav.inert = !open;

      if (open) {
        focusBeforeMenu = document.activeElement;
        lockPageScroll();
        window.requestAnimationFrame(() => {
          (menuFocusables()[0] || mobilePanel).focus({ preventScroll: true });
        });
      } else {
        unlockPageScroll();
        if (restoreFocus) {
          const focusTarget = focusBeforeMenu instanceof HTMLElement ? focusBeforeMenu : menuToggle;
          focusTarget.focus({ preventScroll: true });
        }
        focusBeforeMenu = null;
      }
    };

    if (menuToggle && mobileNav && mobilePanel) {
      mobilePanel.tabIndex = -1;
      mobilePanel.setAttribute("role", "dialog");
      mobilePanel.setAttribute("aria-modal", "true");
      mobileNav.setAttribute("aria-hidden", "true");
      mobileNav.inert = true;

      menuToggle.addEventListener("click", () => {
        setMenuOpen(!menuOpen);
      });

      mobileNav.querySelectorAll("[data-mobile-nav-close]").forEach((control) => {
        control.addEventListener("click", () => setMenuOpen(false));
      });

      mobileNav.querySelectorAll("a[href]").forEach((link) => {
        link.addEventListener("click", () => setMenuOpen(false, { restoreFocus: false }));
      });

      document.addEventListener("keydown", (event) => {
        if (!menuOpen) return;

        if (event.key === "Escape") {
          event.preventDefault();
          setMenuOpen(false);
          return;
        }

        if (event.key !== "Tab") return;
        const focusables = menuFocusables();
        if (!focusables.length) {
          event.preventDefault();
          mobilePanel.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });

      const closeAtDesktop = (event) => {
        if (!event.matches || !menuOpen) return;
        const focusWasInMenu = mobileNav.contains(document.activeElement);
        setMenuOpen(false, { restoreFocus: false });
        if (focusWasInMenu) {
          header?.querySelector(".global-brand")?.focus({ preventScroll: true });
        }
      };
      if (typeof desktopQuery.addEventListener === "function") {
        desktopQuery.addEventListener("change", closeAtDesktop);
      } else {
        desktopQuery.addListener(closeAtDesktop);
      }
    }

    document.querySelectorAll(".global-footer__accordion-trigger").forEach((trigger) => {
      const panelId = trigger.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;

      trigger.disabled = false;

      const setExpanded = (expanded) => {
        trigger.setAttribute("aria-expanded", String(expanded));
        panel.setAttribute("aria-hidden", String(!expanded));
        panel.inert = !expanded;
        panel.classList.toggle("is-open", expanded);
      };

      setExpanded(false);
      trigger.addEventListener("click", () => {
        setExpanded(trigger.getAttribute("aria-expanded") !== "true");
      });
    });

    document.querySelectorAll("[data-current-year]").forEach((year) => {
      year.textContent = String(new Date().getFullYear());
    });

    const ctaShowcase = document.querySelector("[data-cta-showcase]");
    if (ctaShowcase) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion || !("IntersectionObserver" in window)) {
        ctaShowcase.classList.add("is-visible");
      } else {
        const ctaObserver = new IntersectionObserver(
          (entries, observer) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            ctaShowcase.classList.add("is-visible");
            observer.disconnect();
          },
          { threshold: 0.12, rootMargin: "0px 0px -8%" }
        );
        ctaObserver.observe(ctaShowcase);
      }
    }

    // Page-level motion is progressive enhancement: never leave marketing
    // content hidden when an observer or page script fails to initialise.
    window.setTimeout(() => {
      document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => {
        element.classList.add("is-visible");
      });
    }, 3000);

    window.__remtooShellReady = true;
    if (window.__remtooShellFallbackTimer) {
      window.clearTimeout(window.__remtooShellFallbackTimer);
      delete window.__remtooShellFallbackTimer;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteShell, { once: true });
  } else {
    initSiteShell();
  }
})();
