import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudio } from './audio';
import './styles.css';
import './hud.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

installAudio();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
