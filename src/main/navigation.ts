// Whether `url` is the app's own page, the one the window loaded as `appUrl`.
// A `file:` page must be the same file; query and hash may differ. A dev
// server page may be any path on the same origin, so Vite reloads work.
export function isAppPage(url: string, appUrl: string): boolean {
  if (!URL.canParse(url) || !URL.canParse(appUrl)) return false;
  const target = new URL(url);
  const appPage = new URL(appUrl);
  if (appPage.protocol === 'file:') {
    return (
      target.protocol === 'file:' &&
      target.host === appPage.host &&
      target.pathname === appPage.pathname
    );
  }
  // Opaque origins (`javascript:`, `data:`) are all 'null'.
  return appPage.origin !== 'null' && target.origin === appPage.origin;
}

// The part of `WebContents` that `restrictContents` uses.
export interface NavigationTarget {
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  on(event: 'will-navigate' | 'will-redirect', listener: (event: NavigationEvent) => void): unknown;
}

export interface NavigationEvent {
  url: string;
  preventDefault(): void;
}

// Denies new windows, and any navigation or redirect off the app's page.
// `will-navigate` does not fire for redirects, so both are guarded.
export function restrictContents(contents: NavigationTarget, pageUrl: string): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (event: NavigationEvent): void => {
    if (!isAppPage(event.url, pageUrl)) event.preventDefault();
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
}
