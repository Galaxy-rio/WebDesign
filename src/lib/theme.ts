const storageKey = 'galaxyrio-design.theme.v1';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const button = document.querySelector<HTMLButtonElement>('#theme-toggle');

function preference(): string | null {
  try { return localStorage.getItem(storageKey); } catch { return null; }
}

function applyTheme(theme: string) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121315' : '#f6f6f4');
  if (!button) return;
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(dark));
  button.title = label;
  button.querySelector('.theme-toggle-label')!.textContent = dark ? 'Dark' : 'Light';
}

applyTheme(document.documentElement.dataset.theme ?? (systemTheme.matches ? 'dark' : 'light'));
button?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem(storageKey, theme); } catch { /* The selected theme still works for this visit. */ }
});
systemTheme.addEventListener('change', event => {
  if (!['light', 'dark'].includes(preference() ?? '')) applyTheme(event.matches ? 'dark' : 'light');
});
window.addEventListener('storage', event => {
  if (event.key === storageKey) applyTheme(event.newValue ?? (systemTheme.matches ? 'dark' : 'light'));
});
