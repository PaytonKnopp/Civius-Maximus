import { Component, type ReactNode } from 'react';

/**
 * Keeps one failure (a game that can't be made from its setup, a save the rules can't read)
 * from blanking the whole page: it shows what went wrong and a way back to the title screen.
 */
export class GameErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('The game stopped:', error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx mx-crash" role="alertdialog" aria-label="The game couldn't continue">
        <div className="mx-panel">
          <span className="home-kicker">Something went wrong</span>
          <h2>This game couldn’t start</h2>
          <p>{error.message || String(error)}</p>
          <p className="mx-section-hint">
            Your saved games are safe. Go back to the title screen and try another setup or save.
          </p>
          <button
            type="button"
            className="primary big"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            Back to the title screen
          </button>
        </div>
      </div>
    );
  }
}
