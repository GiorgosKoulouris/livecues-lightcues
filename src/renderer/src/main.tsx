import './ui/tokens.css';
import './ui/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DETACHED_VISUALISER_HASH } from '../../shared/protocol';
import { App } from './App';
import { UiProvider } from './ui/UiProvider';
import { DetachedVisualiser } from './visualiser/DetachedVisualiser';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <UiProvider>
      {location.hash === DETACHED_VISUALISER_HASH ? <DetachedVisualiser /> : <App />}
    </UiProvider>
  </StrictMode>,
);
