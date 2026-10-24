import type { CombatPreview as Preview, StrengthLine } from '@cx/engine';

export interface Side {
  name: string;
  health: number;
  maxHealth: number;
  /** Settlements: outer defense left and full. */
  walls?: number;
  wallsMax?: number;
}

interface Props {
  preview: Preview;
  attacker: Side;
  defender: Side;
  /** What a click does ("Click to attack", "Click to declare war on…"). */
  hint: string;
  /** Shown when the attack needs a war first. */
  warning?: string | undefined;
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

function Lines({ lines, name }: { lines: StrengthLine[]; name: string }) {
  return (
    <ul className="strength-lines">
      {lines.map((l, i) => (
        <li key={`${l.label}${i}`} className={i === 0 ? 'base' : l.amount < 0 ? 'minus' : 'plus'}>
          <span>{i === 0 && name.startsWith(l.label) ? 'Base strength' : l.label}</span>
          <span className="mono">{i === 0 ? l.amount : sign(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Health now, with the range the attack may take off (and the walls' share, for settlements). */
function HealthBar({
  side,
  loss,
  wallsLoss,
}: {
  side: Side;
  loss: [number, number];
  wallsLoss?: [number, number] | undefined;
}) {
  const pct = (n: number, max: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`;
  const range = ([lo, hi]: [number, number]) => (lo === hi ? `−${hi}` : `−${lo}–${hi}`);
  const after = Math.max(0, side.health - loss[1]);
  const walls = side.walls ?? 0;
  const wallsMax = side.wallsMax ?? 0;
  const wallsAfter = Math.max(0, walls - (wallsLoss?.[1] ?? 0));
  return (
    <div className="combat-bars">
      {wallsMax > 0 && (
        <div className="combat-bar walls" title={`Walls ${walls}/${wallsMax}`}>
          <span className="fill" style={{ width: pct(wallsAfter, wallsMax) }} />
          <span
            className="loss"
            style={{ left: pct(wallsAfter, wallsMax), width: pct(walls - wallsAfter, wallsMax) }}
          />
        </div>
      )}
      <div className="combat-bar" title={`Health ${side.health}/${side.maxHealth}`}>
        <span className="fill" style={{ width: pct(after, side.maxHealth) }} />
        <span
          className="loss"
          style={{
            left: pct(after, side.maxHealth),
            width: pct(side.health - after, side.maxHealth),
          }}
        />
      </div>
      <span className="mono small-text">
        {range(loss)} HP
        {wallsLoss && walls > 0 ? ` · walls ${range(wallsLoss)}` : ''}
      </span>
    </div>
  );
}

/** Both sides of a fight before you commit: strengths with every modifier, and the damage range. */
export function CombatPreview({ preview, attacker, defender, hint, warning }: Props) {
  if (preview.mode === 'capture') {
    return (
      <div className="combat-preview capture" role="status">
        <p className="combat-title">Capture {defender.name}</p>
        {warning && <p className="combat-warning">{warning}</p>}
        <p className="hint">{hint}</p>
      </div>
    );
  }
  const defenderLoss = preview.split?.health ?? preview.toDefender;
  const settlement = preview.target.kind === 'settlement';
  const [verdict, good] =
    defenderLoss[0] >= defender.health
      ? settlement
        ? preview.captures
          ? ['Takes it', true]
          : ['Breaks its defenses', true]
        : ['Destroys it', true]
      : preview.toAttacker[0] >= attacker.health
        ? ['Your unit dies', false]
        : defenderLoss[0] + defenderLoss[1] + (preview.split?.walls[1] ?? 0) >
            preview.toAttacker[0] + preview.toAttacker[1]
          ? ['Favorable', true]
          : ['Costly', false];
  return (
    <div className="combat-preview" role="status">
      <div className="combat-head">
        <span className={`verdict ${good ? 'good' : 'bad'}`}>{verdict}</span>
        <span className="muted small-text">
          {preview.mode === 'ranged' ? 'Ranged attack: no damage back' : 'Melee attack'}
        </span>
      </div>
      <div className="combat-sides">
        <div className="side">
          <p className="side-name">{attacker.name}</p>
          <p className="side-strength mono">{preview.attacker.total}</p>
          <Lines lines={preview.attacker.lines} name={attacker.name} />
          <HealthBar side={attacker} loss={preview.toAttacker} />
        </div>
        <div className="vs" aria-hidden="true">
          ⚔
        </div>
        <div className="side">
          <p className="side-name">{defender.name}</p>
          <p className="side-strength mono">{preview.defender.total}</p>
          <Lines lines={preview.defender.lines} name={defender.name} />
          <HealthBar side={defender} loss={defenderLoss} wallsLoss={preview.split?.walls} />
        </div>
      </div>
      {warning && <p className="combat-warning">{warning}</p>}
      <p className="hint">{hint}</p>
    </div>
  );
}
