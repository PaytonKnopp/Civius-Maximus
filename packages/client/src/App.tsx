import { ENGINE_VERSION } from '@cx/engine';

const MENU = ['Single Player', 'Host Multiplayer', 'Join with Code', 'Hotseat', 'Load Game'];

export function App() {
  return (
    <main className="menu">
      <h1>Civius Maximus</h1>
      <p className="tagline">Placeholder main menu. Gameplay arrives in later milestones.</p>
      <nav>
        {MENU.map((label) => (
          <button key={label} type="button" disabled>
            {label}
          </button>
        ))}
      </nav>
      <footer>engine v{ENGINE_VERSION}</footer>
    </main>
  );
}
