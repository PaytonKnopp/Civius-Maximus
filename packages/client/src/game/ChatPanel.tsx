import type { OnlineSession } from '@cx/host';
import type { ChatLine } from '@cx/protocol';
import { useEffect, useRef, useState } from 'react';

/**
 * Online chat (V1 final F20): a button with the unread count that opens the conversation. `/`
 * opens it from the map; Escape closes it.
 */
export function ChatPanel({
  online,
  colorOf,
}: {
  online: OnlineSession;
  /** A seat's color, for the names. */
  colorOf: (player: string | null) => string | undefined;
}) {
  const [lines, setLines] = useState<ChatLine[]>(() => online.chat());
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(
    () =>
      online.onChat(() => {
        setLines([...online.chat()]);
        if (!openRef.current) setUnread((n) => n + 1);
      }),
    [online],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    input.current?.focus();
    list.current?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  }, [open, lines]);

  const send = () => {
    if (!text.trim()) return;
    online.say(text);
    setText('');
  };

  if (!open)
    return (
      <button type="button" className="chat-toggle" onClick={() => setOpen(true)} title="Chat (/)">
        Chat{unread > 0 ? ` · ${unread}` : ''}
      </button>
    );
  return (
    <aside className="chat-panel" aria-label="Chat">
      <header>
        <strong>Chat</strong>
        <button
          type="button"
          className="ghost small"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
        >
          ✕
        </button>
      </header>
      <ol ref={list}>
        {lines.length === 0 && <li className="muted">Nothing said yet. Say hello!</li>}
        {lines.map((l, i) => (
          <li key={i}>
            <strong style={{ color: colorOf(l.player) }}>{l.from}</strong> {l.text}
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={input}
          value={text}
          maxLength={300}
          placeholder="Say something (Enter to send)"
          aria-label="Message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
            // Keys typed here don't also move units or open screens.
            e.stopPropagation();
          }}
        />
      </form>
    </aside>
  );
}
