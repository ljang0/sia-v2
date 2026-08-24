const root = document.documentElement;
const themeStorageKey = 'sia-site-theme';

try {
  if (window.localStorage.getItem(themeStorageKey) === 'light') {
    root.dataset.theme = 'light';
  }
} catch {
  // Storage can be unavailable in private or hardened browser contexts.
}

const menuButton = document.querySelector('[data-menu-button]');
const menu = document.querySelector('[data-menu]');

if (menu) {
  const themeButton = document.createElement('button');
  const updateThemeButton = () => {
    const light = root.dataset.theme === 'light';
    themeButton.textContent = light ? 'Dark' : 'Light';
    themeButton.setAttribute('aria-label', `Use ${light ? 'dark' : 'light'} appearance`);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', light ? '#eeefe9' : '#090b0a');
  };

  themeButton.type = 'button';
  themeButton.className = 'theme-toggle';
  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    try {
      window.localStorage.setItem(themeStorageKey, root.dataset.theme);
    } catch {
      // The appearance still changes for the current page.
    }
    updateThemeButton();
  });
  menu.insertBefore(themeButton, menu.querySelector('.nav-cta'));
  updateThemeButton();
}

const closeMenu = () => {
  if (!menu || !menuButton) return;
  menu.dataset.open = 'false';
  menuButton.setAttribute('aria-expanded', 'false');
};

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const open = menu.dataset.open !== 'true';
    menu.dataset.open = String(open);
    menuButton.setAttribute('aria-expanded', String(open));
  });

  menu.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (menu.dataset.open !== 'true' || !(event.target instanceof Node)) return;
    if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });
}

for (const element of document.querySelectorAll('[data-current-year]')) {
  element.textContent = String(new Date().getFullYear());
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealElements = [...document.querySelectorAll('.reveal')];

revealElements.forEach((element, index) => {
  element.style.setProperty('--reveal-index', String(index % 4));
});

if (reducedMotion || !('IntersectionObserver' in window)) {
  for (const element of revealElements) element.classList.add('is-visible');
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -7% 0px', threshold: 0.1 },
  );

  for (const element of revealElements) observer.observe(element);
}
