
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // =====================================================
  // 1. ANNÉE AUTOMATIQUE DANS LE PIED DE PAGE
  // =====================================================

  const year = document.getElementById("year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // =====================================================
  // 2. EFFET MACHINE À ÉCRIRE
  // =====================================================

  const typingText = document.getElementById("typingText");

  const words = [
    "la cybersécurité",
    "les réseaux informatiques",
    "la supervision réseau",
    "les infrastructures IT"
  ];

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  let wordIndex = 0;
  let characterIndex = words[0].length;
  let deleting = false;
  let typingTimer = null;

  function typeEffect() {
    if (!typingText || reducedMotion.matches) return;

    const currentWord = words[wordIndex];

    if (deleting) {
      characterIndex--;
    } else {
      characterIndex++;
    }

    typingText.textContent = currentWord.substring(
      0,
      characterIndex
    );

    let delay = deleting ? 40 : 75;

    if (!deleting && characterIndex >= currentWord.length) {
      characterIndex = currentWord.length;
      deleting = true;
      delay = 1600;
    } else if (deleting && characterIndex <= 0) {
      characterIndex = 0;
      deleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      delay = 350;
    }

    typingTimer = window.setTimeout(typeEffect, delay);
  }

  if (typingText) {
    if (reducedMotion.matches) {
      typingText.textContent = words[0];
    } else {
      typingTimer = window.setTimeout(typeEffect, 1000);
    }

    // Adapter le comportement si la préférence d'accessibilité change.
    reducedMotion.addEventListener?.("change", (event) => {
      if (event.matches) {
        window.clearTimeout(typingTimer);
        typingText.textContent = words[wordIndex];
      } else {
        window.clearTimeout(typingTimer);
        typingTimer = window.setTimeout(typeEffect, 500);
      }
    });
  }

  // =====================================================
  // 3. APPARITION PROGRESSIVE AU DÉFILEMENT
  // Compatible avec les classes .reveal et .is-visible
  // =====================================================

  const revealElements = document.querySelectorAll(".reveal");

  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => {
      element.classList.add("is-visible");
    });
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -35px 0px"
      }
    );

    revealElements.forEach((element) => {
      revealObserver.observe(element);
    });
  }

  // =====================================================
  // 4. MENU DE NAVIGATION MOBILE
  // =====================================================

  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  const links = document.querySelectorAll(".nav-link");

  function closeMenu() {
    if (!navLinks || !menuToggle) return;

    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Ouvrir le menu");
    menuToggle.textContent = "☰";
  }

  function toggleMenu() {
    if (!navLinks || !menuToggle) return;

    const isOpen = navLinks.classList.toggle("open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Fermer le menu" : "Ouvrir le menu"
    );
    menuToggle.textContent = isOpen ? "✕" : "☰";
  }

  if (menuToggle && navLinks) {
    // État initial accessible
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Ouvrir le menu");

    menuToggle.addEventListener("click", toggleMenu);

    // Fermer le menu après le choix d'une section
    links.forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    // Fermer en cliquant en dehors du menu
    document.addEventListener("click", (event) => {
      if (
        navLinks.classList.contains("open") &&
        !navLinks.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        closeMenu();
      }
    });

    // Fermer avec la touche Échap
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        navLinks.classList.contains("open")
      ) {
        closeMenu();
        menuToggle.focus();
      }
    });

    // Fermer le menu si l'on repasse en affichage ordinateur
    window.addEventListener("resize", () => {
      if (window.innerWidth > 650) {
        closeMenu();
      }
    });
  }

  // =====================================================
  // 5. SECTION ACTIVE DANS LA NAVIGATION
  // =====================================================

  const sections = document.querySelectorAll("main section[id]");

  if ("IntersectionObserver" in window && sections.length > 0) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const activeId = `#${entry.target.id}`;

          links.forEach((link) => {
            const isActive =
              link.getAttribute("href") === activeId;

            link.classList.toggle("active", isActive);

            if (isActive) {
              link.setAttribute("aria-current", "location");
            } else {
              link.removeAttribute("aria-current");
            }
          });
        });
      },
      {
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0
      }
    );

    sections.forEach((section) => {
      sectionObserver.observe(section);
    });
  }

  // =====================================================
  // 6. BOUTON RETOUR EN HAUT
  // =====================================================

  const backToTop = document.getElementById("backToTop");

  if (backToTop) {
    function updateBackToTop() {
      backToTop.classList.toggle(
        "visible",
        window.scrollY > 450
      );
    }

    window.addEventListener("scroll", updateBackToTop, {
      passive: true
    });

    backToTop.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: reducedMotion.matches ? "auto" : "smooth"
      });
    });

    // Mettre immédiatement le bouton dans le bon état
    updateBackToTop();
  }

  // =====================================================
  // 7. PHOTO DE PROFIL ET VISUEL DE SECOURS
  // =====================================================

  const portraitImage = document.getElementById("portraitImage");
  const portraitPlaceholder = document.getElementById(
    "portraitPlaceholder"
  );

  if (portraitImage && portraitPlaceholder) {
    function showPortrait() {
      portraitImage.style.display = "block";
      portraitPlaceholder.style.display = "none";
    }

    function showPortraitPlaceholder() {
      portraitImage.style.display = "none";
      portraitPlaceholder.style.display = "flex";
    }

    portraitImage.addEventListener("load", showPortrait);
    portraitImage.addEventListener("error", showPortraitPlaceholder);

    // Gérer également une image déjà chargée par le navigateur
    if (portraitImage.complete) {
      if (portraitImage.naturalWidth > 0) {
        showPortrait();
      } else {
        showPortraitPlaceholder();
      }
    }
  }

});
 
/* =====================================
   LANCEMENT DE L'INTRO PAPILLONS
   ===================================== */


(() => {
  function lancerIntroPapillons() {
    const intro = document.getElementById("butterfly-intro");

    if (!intro) {
      console.warn("Introduction introuvable : butterfly-intro");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      intro.remove();
      return;
    }

    // Afficher l'introduction explicitement.
    intro.style.display = "block";
    intro.style.visibility = "visible";
    intro.style.opacity = "1";

    // Faire apparaître le portfolio après 3 secondes.
    window.setTimeout(() => {
      intro.classList.add("intro-finished");

      window.setTimeout(() => {
        intro.remove();
      }, 1000);
    }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", lancerIntroPapillons);
  } else {
    lancerIntroPapillons();
  }
})();
