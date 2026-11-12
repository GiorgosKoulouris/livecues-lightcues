// Fixtures for electron.yml: the app-wide guard is a helper in another file,
// named `restrict…` or `guard…`. Own file, since an app-wide guard covers the
// whole file. Not compiled or linted. No annotations, as in
// electron.app-guard.ts.

import { app, BrowserWindow } from 'electron';
import { restrictContents } from './navigation';

function createWindow(): void {
  // Clean: the helper below covers this window.
  const window = new BrowserWindow({});
  void window.loadFile('index.html');
}

void app.whenReady().then(() => {
  app.on('web-contents-created', (_event, contents) => restrictContents(contents, 'page'));
  createWindow();
});
