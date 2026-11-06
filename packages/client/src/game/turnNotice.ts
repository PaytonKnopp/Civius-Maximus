/**
 * "Your turn" notices for online games (D118): a browser notification while the tab is in the
 * background, and a marked tab title until the player comes back. The browser asks the player
 * once, on their first click in an online game.
 */

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

/** Asks for permission to notify, once (call it from a click: some browsers insist). */
export function askTurnNotices() {
  if (!supported() || Notification.permission !== 'default') return;
  void Notification.requestPermission().catch(() => undefined);
}

let restoreTitle: (() => void) | null = null;

/** Tells the player it's their turn, if they're looking elsewhere. */
export function turnNotice(title: string, body: string) {
  if (typeof document === 'undefined' || !document.hidden) return;
  if (supported() && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, tag: 'civius-turn' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Some browsers only notify from a service worker: the title mark still shows.
    }
  }
  if (restoreTitle) return;
  const plain = document.title;
  document.title = `● ${title}`;
  const back = () => {
    if (document.hidden) return;
    document.title = plain;
    document.removeEventListener('visibilitychange', back);
    restoreTitle = null;
  };
  restoreTitle = back;
  document.addEventListener('visibilitychange', back);
}
