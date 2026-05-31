import darkThemeCSS from 'primereact/resources/themes/mdc-dark-indigo/theme.css?raw';
import lightThemeCSS from 'primereact/resources/themes/mdc-light-indigo/theme.css?raw';

let styleEl: HTMLStyleElement | null = null;

export function applyPrimeTheme(mode: 'dark' | 'light'): void {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'prime-theme';
    // Insert before other styles so custom theme.css variables take precedence
    document.head.insertBefore(styleEl, document.head.firstChild);
  }
  styleEl.textContent = mode === 'dark' ? darkThemeCSS : lightThemeCSS;
}
