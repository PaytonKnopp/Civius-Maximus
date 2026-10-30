import '@fontsource-variable/cinzel';
import '@fontsource-variable/source-sans-3';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudio } from './audio';
import { Tooltips } from './ui/Tooltips';
import { openLiveSite } from './update';
import './styles.css';
import './hud.css';
import './theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The desktop app opens the website (always the latest version) when it answers; offline, the
// copy inside the app plays.
void openLiveSite().then((leaving) => leaving || start(root));

function start(root: HTMLElement) {
  installAudio();
  // The map draws its labels and badges on canvases, which use whatever font is loaded at the
  // time: wait (briefly) for the game's fonts so they never bake in a fallback.
  const fonts = Promise.all(
    ['500 40px "Cinzel Variable"', '600 32px "Source Sans 3 Variable"'].map((f) =>
      document.fonts?.load(f),
    ),
  ).catch(() => undefined);
  void Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(() =>
    createRoot(root).render(
      <StrictMode>
        <App />
        <Tooltips />
      </StrictMode>,
    ),
  );
}
