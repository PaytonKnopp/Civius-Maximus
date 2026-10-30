import type { LeaderDef } from '@cx/content';
import { type ReactNode, useId } from 'react';

/**
 * A leader's portrait (docs/10-art-direction.md, "Leaders"): an illustrated bust drawn from the
 * traits in content (`leader.portrait`): face, skin, hair, beard, headwear, clothes, jewelry and
 * expression, over a field of the civ's colors. A painted image (`portrait.image`) replaces it
 * when one exists. `framed` adds the gold oval frame; `painted` adds a brush-grain finish for
 * big sizes.
 */

type Spec = NonNullable<LeaderDef['portrait']>;

interface Props {
  portrait: Spec | undefined;
  /** The civ's colors, for the background. */
  primary: string;
  secondary: string;
  size?: number | string;
  framed?: boolean;
  painted?: boolean;
  title?: string;
  className?: string;
  /** Crop: the whole bust (default) or just the head, for small round chips. */
  crop?: 'bust' | 'head';
  /** The civ's architecture: the landmark on the horizon behind them. */
  scene?: string;
}

// --- Color helpers ------------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]) {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Mixes `a` toward `b` by `t` (0–1). */
function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
const dark = (c: string, t: number) => mix(c, '#000000', t);
const light = (c: string, t: number) => mix(c, '#ffffff', t);

const GOLD = '#d4a94e';
const GOLD_DARK = '#8a6420';

// --- Face geometry ------------------------------------------------------------------------------

const FACES = {
  oval: { w: 34, jaw: 26, chin: 10, top: 54, bottom: 146 },
  round: { w: 37, jaw: 31, chin: 14, top: 56, bottom: 142 },
  square: { w: 35, jaw: 32, chin: 17, top: 54, bottom: 144 },
  long: { w: 32, jaw: 24, chin: 10, top: 50, bottom: 150 },
  heart: { w: 36, jaw: 22, chin: 8, top: 54, bottom: 146 },
} as const;
type Face = (typeof FACES)[keyof typeof FACES];

function facePath(f: Face) {
  const { w, jaw, chin, top, bottom } = f;
  return (
    `M100,${top} C${100 + w * 1.15},${top} ${100 + w},${86} ${100 + w},${102} ` +
    `C${100 + w},${120} ${100 + jaw},${130} ${100 + chin},${bottom - 4} ` +
    `Q100,${bottom + 1} ${100 - chin},${bottom - 4} ` +
    `C${100 - jaw},${130} ${100 - w},${120} ${100 - w},${102} ` +
    `C${100 - w},${86} ${100 - w * 1.15},${top} 100,${top} Z`
  );
}

/** The lower face, where beards grow, as a path. `drop` extends it below the chin. */
function beardPath(f: Face, drop: number, point = false) {
  const { w, jaw, chin, bottom } = f;
  const b = bottom + drop;
  return (
    `M${100 - w + 1},${106} C${100 - w + 1},${122} ${100 - jaw - 1},${132} ${100 - chin - 4},${b - 6} ` +
    (point ? `L100,${b + 6} ` : `Q100,${b + 4} `) +
    `${100 + chin + 4},${b - 6} C${100 + jaw + 1},${132} ${100 + w - 1},${122} ${100 + w - 1},${106} ` +
    `C${100 + w - 6},${121} 112,${124} 100,${124} C88,${124} ${100 - w + 6},${121} ${100 - w + 1},${106} Z`
  );
}

const SHOULDERS = 'M14,240 C18,198 50,176 86,168 L114,168 C150,176 182,198 186,240 Z';

// --- Pieces -------------------------------------------------------------------------------------

function hairBack(style: Spec['hairStyle'], hair: string, f: Face): ReactNode {
  const shade = dark(hair, 0.25);
  switch (style) {
    case 'long':
      return (
        <path
          d={`M${100 - f.w - 6},92 C${100 - f.w - 14},140 ${100 - f.w - 16},190 ${100 - f.w - 8},222 L${100 + f.w + 8},222 C${100 + f.w + 16},190 ${100 + f.w + 14},140 ${100 + f.w + 6},92 Z`}
          fill={shade}
        />
      );
    case 'wavy':
      return (
        <path
          d={`M${100 - f.w - 6},90 C${100 - f.w - 18},120 ${100 - f.w - 6},140 ${100 - f.w - 16},165 C${100 - f.w - 22},180 ${100 - f.w - 6},196 ${100 - f.w - 10},204 L${100 + f.w + 10},204 C${100 + f.w + 6},196 ${100 + f.w + 22},180 ${100 + f.w + 16},165 C${100 + f.w + 6},140 ${100 + f.w + 18},120 ${100 + f.w + 6},90 Z`}
          fill={shade}
        />
      );
    case 'bob':
      return (
        <path
          d={`M${100 - f.w - 6},90 C${100 - f.w - 10},120 ${100 - f.w - 8},140 ${100 - f.w},150 L${100 + f.w},150 C${100 + f.w + 8},140 ${100 + f.w + 10},120 ${100 + f.w + 6},90 Z`}
          fill={shade}
        />
      );
    case 'braids':
      return (
        <g fill={shade}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <ellipse cx={100 - f.w - 4} cy={128 + i * 14} rx={6} ry={8} />
              <ellipse cx={100 + f.w + 4} cy={128 + i * 14} rx={6} ry={8} />
            </g>
          ))}
        </g>
      );
    case 'updo':
      return <circle cx={100} cy={f.top - 2} r={16} fill={shade} />;
    case 'tied':
      return <ellipse cx={100} cy={f.top + 6} rx={12} ry={10} fill={shade} />;
    default:
      return null;
  }
}

function hairFront(style: Spec['hairStyle'], hair: string, f: Face): ReactNode {
  const { w, top } = f;
  const hi = light(hair, 0.18);
  // A cap over the skull with its hairline at `line`; `lift` raises the outer edge (volume).
  const cap = (line: number, lift: number, part = false) =>
    `M${100 - w - 3},${106} C${100 - w - 7},${72 - lift} ${100 - w * 0.6},${top - 7 - lift} 100,${top - 8 - lift} ` +
    `C${100 + w * 0.6},${top - 7 - lift} ${100 + w + 7},${72 - lift} ${100 + w + 3},${106} ` +
    `C${100 + w - 1},${88} ${100 + w * 0.55},${line} ${part ? 102 : 100},${line + (part ? -10 : 0)} ` +
    (part ? `L98,${line - 10} ` : '') +
    `C${100 - w * 0.55},${line} ${100 - w + 1},${88} ${100 - w - 3},${106} Z`;
  const sheen = (
    <path
      d={`M${100 - w * 0.5},${top - 2} Q100,${top - 8} ${100 + w * 0.4},${top - 1}`}
      stroke={hi}
      strokeWidth={2.4}
      fill="none"
      strokeLinecap="round"
      opacity={0.6}
    />
  );
  switch (style) {
    case 'bald':
      return (
        <g fill={hair}>
          <path
            d={`M${100 - w - 2},${110} C${100 - w - 3},${96} ${100 - w},${88} ${100 - w + 4},${84} L${100 - w + 6},${104} Z`}
          />
          <path
            d={`M${100 + w + 2},${110} C${100 + w + 3},${96} ${100 + w},${88} ${100 + w - 4},${84} L${100 + w - 6},${104} Z`}
          />
        </g>
      );
    case 'cropped':
      return (
        <g>
          <path d={cap(70, -2)} fill={hair} />
          {sheen}
        </g>
      );
    case 'chonmage':
      // Shaved crown, hair at the sides and back, the topknot folded forward on top.
      return (
        <g fill={hair}>
          <path
            d={`M${100 - w - 3},${108} C${100 - w - 6},${80} ${100 - w + 2},${66} ${100 - w + 10},${62} L${100 - w + 8},${92} Z`}
          />
          <path
            d={`M${100 + w + 3},${108} C${100 + w + 6},${80} ${100 + w - 2},${66} ${100 + w - 10},${62} L${100 + w - 8},${92} Z`}
          />
          <rect
            x={96}
            y={top - 6}
            width={8}
            height={26}
            rx={4}
            transform={`rotate(-8 100 ${top + 6})`}
          />
          <ellipse cx={100} cy={top - 4} rx={7} ry={4} />
        </g>
      );
    case 'curly':
      return (
        <g fill={hair}>
          <path d={cap(74, 4)} />
          {Array.from({ length: 11 }, (_, i) => {
            const a = Math.PI * (0.05 + (i / 10) * 0.9);
            return (
              <circle
                key={i}
                cx={100 - Math.cos(a) * (w + 4)}
                cy={top + 30 - Math.sin(a) * (top - 18)}
                r={9}
              />
            );
          })}
        </g>
      );
    case 'topknot':
      return (
        <g fill={hair}>
          <circle cx={100} cy={top - 12} r={10} />
          <path d={cap(70, 0, true)} />
          <rect x={92} y={top - 6} width={16} height={4} rx={2} fill={GOLD} />
        </g>
      );
    case 'long':
    case 'wavy':
    case 'braids':
      return (
        <g>
          <path d={cap(72, 2, true)} fill={hair} />
          {sheen}
        </g>
      );
    case 'bob':
      return (
        <g>
          <path
            d={`M${100 - w - 5},${108} C${100 - w - 8},${70} ${100 - w * 0.6},${top - 8} 100,${top - 9} C${100 + w * 0.6},${top - 8} ${100 + w + 8},${70} ${100 + w + 5},${108} L${100 + w - 2},${84} L${100 - w + 2},${84} Z`}
            fill={hair}
          />
          {sheen}
        </g>
      );
    case 'updo':
    case 'tied':
      return (
        <g>
          <path d={cap(70, 2, true)} fill={hair} />
          {sheen}
        </g>
      );
    default:
      return (
        <g>
          <path d={cap(72, 2)} fill={hair} />
          {sheen}
        </g>
      );
  }
}

function beard(kind: Spec['beard'], hair: string, f: Face): ReactNode {
  const mustache = (
    <path
      d="M86,128 Q93,121 100,125 Q107,121 114,128 Q107,126.5 100,128 Q93,126.5 86,128 Z"
      fill={hair}
    />
  );
  switch (kind) {
    case 'stubble':
      return <path d={beardPath(f, 0)} fill={hair} opacity={0.22} />;
    case 'mustache':
      return mustache;
    case 'goatee':
      return (
        <g>
          <ellipse cx={100} cy={f.bottom - 6} rx={9} ry={9} fill={hair} />
          {mustache}
        </g>
      );
    case 'short':
      return (
        <g>
          <path d={beardPath(f, 3)} fill={hair} />
          {mustache}
        </g>
      );
    case 'chin':
      // A chin curtain: along the jaw, no mustache.
      return <path d={beardPath(f, 6)} fill={hair} />;
    case 'full':
      return (
        <g>
          <path d={beardPath(f, 16)} fill={hair} />
          {mustache}
        </g>
      );
    case 'long':
      return (
        <g>
          <path d={beardPath(f, 38, true)} fill={hair} />
          {mustache}
        </g>
      );
    default:
      return null;
  }
}

function mouth(expression: Spec['expression'], lip: string): ReactNode {
  const upper =
    expression === 'smile'
      ? 'M89,130 Q95,127.5 100,129 Q105,127.5 111,130 Q100,133 89,130 Z'
      : 'M90,131 Q95,128.6 100,130 Q105,128.6 110,131 Q100,132.6 90,131 Z';
  const lower =
    expression === 'smile'
      ? 'M90,130.6 Q100,139 110,130.6 Q100,134.5 90,130.6 Z'
      : expression === 'stern'
        ? 'M91,131.4 Q100,135 109,131.4 Q100,133.2 91,131.4 Z'
        : 'M91,131.4 Q100,137 109,131.4 Q100,133.8 91,131.4 Z';
  return (
    <g>
      <path d={lower} fill={light(lip, 0.08)} />
      <path d={upper} fill={lip} />
      <path
        d={expression === 'smile' ? 'M89,130 Q100,134.5 111,130' : 'M90,131 Q100,132.6 110,131'}
        stroke={dark(lip, 0.45)}
        strokeWidth={0.9}
        fill="none"
      />
    </g>
  );
}

function eyes(spec: Spec, skin: string): ReactNode {
  const brow = dark(spec.hair, spec.hair === '#e8e2d2' ? 0.3 : 0.05);
  const stern = spec.expression === 'stern';
  return (
    <g>
      {[86, 114].map((cx, i) => {
        const s = i === 0 ? -1 : 1;
        const y = 101;
        return (
          <g key={cx}>
            {/* Socket shadow. */}
            <ellipse cx={cx} cy={y - 1} rx={11} ry={6} fill={dark(skin, 0.12)} opacity={0.5} />
            <path
              d={`M${cx - 8.5},${y} Q${cx},${y - 6} ${cx + 8.5},${y} Q${cx},${y + 4.6} ${cx - 8.5},${y} Z`}
              fill="#f4eee4"
            />
            <circle cx={cx} cy={y - 0.4} r={3.7} fill={spec.eyes} />
            <circle cx={cx} cy={y - 0.4} r={1.7} fill="#120c08" />
            <circle cx={cx + 1.2} cy={y - 1.6} r={0.95} fill="#ffffff" />
            <path
              d={`M${cx - 9.5},${y + 0.4} Q${cx},${y - 7} ${cx + 9.5},${y}`}
              stroke={dark(skin, 0.6)}
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={
                stern
                  ? `M${cx + s * 9},${y - 11} Q${cx},${y - 11.5} ${cx - s * 9},${y - 6.5}`
                  : `M${cx - 9},${y - 9} Q${cx},${y - 13} ${cx + 9},${y - 9.5}`
              }
              stroke={brow}
              strokeWidth={3.2}
              fill="none"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

function outfit(spec: Spec, skin: string): ReactNode {
  const c = spec.outfitColor;
  const t = spec.trim;
  const shade = dark(c, 0.3);
  const base = (fill: string) => <path d={SHOULDERS} fill={fill} />;
  switch (spec.outfit) {
    case 'toga':
      return (
        <g>
          {base('#e8e0cc')}
          <path d="M40,240 C52,206 70,182 92,172 L104,174 C88,190 112,214 150,240 Z" fill={c} />
          <path
            d="M60,240 C70,214 84,196 100,184 M120,240 C114,222 108,206 104,190"
            stroke={dark('#e8e0cc', 0.2)}
            strokeWidth={1.5}
            fill="none"
          />
          <path d="M40,240 C52,206 70,182 92,172" stroke={t} strokeWidth={2.5} fill="none" />
        </g>
      );
    case 'armor':
      return (
        <g>
          <path d="M8,240 C14,192 52,172 86,166 L114,166 C148,172 186,192 192,240 Z" fill={c} />
          <path d={SHOULDERS} fill="#8e9196" />
          <path d="M66,240 C66,214 80,190 100,184 C120,190 134,214 134,240 Z" fill="#a8acb2" />
          <path d="M100,186 L100,240" stroke="#6a6e74" strokeWidth={1.5} />
          <ellipse cx={46} cy={198} rx={26} ry={16} fill="#9a9ea4" transform="rotate(-24 46 198)" />
          <ellipse
            cx={154}
            cy={198}
            rx={26}
            ry={16}
            fill="#9a9ea4"
            transform="rotate(24 154 198)"
          />
          <path d="M80,176 Q100,186 120,176" stroke={t} strokeWidth={3} fill="none" />
        </g>
      );
    case 'gown':
      return (
        <g>
          {base(c)}
          <path d="M62,186 Q100,214 138,186 L130,178 Q100,198 70,178 Z" fill={skin} />
          <path d="M62,186 Q100,214 138,186" stroke={t} strokeWidth={3} fill="none" />
          <path d="M100,206 L100,240" stroke={shade} strokeWidth={2} />
        </g>
      );
    case 'coat':
      return (
        <g>
          {base(c)}
          <path d="M82,170 L100,214 L118,170 Z" fill="#efe9dc" />
          <path
            d="M82,168 L74,190 L100,224 L94,192 Z M118,168 L126,190 L100,224 L106,192 Z"
            fill={dark(c, 0.15)}
          />
          <path d="M80,166 L84,180 L116,180 L120,166 Z" fill={t} />
          {[42, 158].map((x) => (
            <g key={x}>
              <ellipse
                cx={x}
                cy={192}
                rx={20}
                ry={8}
                fill={t}
                transform={`rotate(${x < 100 ? -22 : 22} ${x} 192)`}
              />
              {[0, 1, 2, 3, 4].map((k) => (
                <rect
                  key={k}
                  x={x - 14 + k * 6}
                  y={198}
                  width={2.4}
                  height={10}
                  fill={t}
                  transform={`rotate(${x < 100 ? -22 : 22} ${x} 192)`}
                />
              ))}
            </g>
          ))}
          {[200, 212, 224].map((y) => (
            <circle key={y} cx={108} cy={y} r={1.8} fill={t} />
          ))}
        </g>
      );
    case 'suit':
      return (
        <g>
          {base(c)}
          <path d="M84,168 L100,222 L116,168 Z" fill="#f2efe8" />
          <path
            d="M84,168 L72,196 L100,232 L92,194 Z M116,168 L128,196 L100,232 L108,194 Z"
            fill={dark(c, 0.2)}
          />
          <path d="M92,176 L100,180 L108,176 L108,184 L100,180 L92,184 Z" fill="#1a1a1a" />
        </g>
      );
    case 'kimono':
      return (
        <g>
          {base(c)}
          <path d="M84,166 L112,240 L124,240 L96,166 Z" fill="#efe9dc" />
          <path d="M116,166 L88,240 L76,240 L104,166 Z" fill={dark(c, 0.15)} />
          <path d="M116,166 L88,240" stroke={t} strokeWidth={2.5} />
          <path
            d="M14,240 C14,206 24,190 40,184 L40,240 Z M186,240 C186,206 176,190 160,184 L160,240 Z"
            fill={dark(c, 0.2)}
          />
        </g>
      );
    case 'furs':
      return (
        <g>
          {base(c)}
          <path d="M100,180 L132,240" stroke={t} strokeWidth={4} />
          <path
            d="M58,184 Q100,206 142,184 Q148,174 138,170 Q100,190 62,170 Q52,174 58,184 Z"
            fill="#8a6a4a"
          />
          {Array.from({ length: 14 }, (_, i) => (
            <circle
              key={i}
              cx={60 + i * 6}
              cy={180 + Math.sin(i * 0.7) * 3 + (Math.abs(i - 6.5) < 4 ? 6 : 0)}
              r={4}
              fill="#9a7a58"
            />
          ))}
        </g>
      );
    case 'dragon_robe':
      return (
        <g>
          {base(c)}
          <path d="M76,170 Q100,190 124,170 L126,178 Q100,198 74,178 Z" fill={t} />
          <path d="M100,186 L100,240" stroke={dark(c, 0.3)} strokeWidth={1.5} />
          <circle cx={100} cy={218} r={14} fill="none" stroke={GOLD} strokeWidth={2} />
          <path
            d="M90,222 Q94,210 100,216 Q106,222 110,210"
            stroke={GOLD}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
          {[50, 150].map((x) => (
            <circle
              key={x}
              cx={x}
              cy={214}
              r={9}
              fill="none"
              stroke={GOLD}
              strokeWidth={1.6}
              opacity={0.8}
            />
          ))}
        </g>
      );
    case 'kaftan':
      return (
        <g>
          {base(c)}
          <path d="M78,168 Q100,196 122,168 L132,174 Q100,210 68,174 Z" fill={t} />
          <path d="M100,196 L100,240" stroke={t} strokeWidth={6} />
          {[204, 218, 232].map((y) => (
            <path
              key={y}
              d={`M94,${y} L100,${y - 5} L106,${y} L100,${y + 5} Z`}
              fill={dark(t, 0.3)}
            />
          ))}
          {[44, 156].map((x) => (
            <path
              key={x}
              d={`M${x - 16},230 L${x + 16},222`}
              stroke={t}
              strokeWidth={3}
              opacity={0.7}
            />
          ))}
        </g>
      );
    case 'robe':
      return (
        <g>
          {base(c)}
          <path d="M80,168 L100,206 L120,168" stroke={t} strokeWidth={4} fill="none" />
          <path d="M84,168 L100,200 L116,168 Z" fill={dark(c, 0.25)} />
        </g>
      );
    case 'wrap':
      return (
        <g>
          {base(c)}
          <path
            d="M30,240 C40,200 80,178 130,176 L150,186 C100,190 70,210 60,240 Z"
            fill={t}
            opacity={0.85}
          />
        </g>
      );
    default:
      return (
        <g>
          {base(c)}
          <path d="M84,168 Q100,184 116,168" stroke={t} strokeWidth={3} fill="none" />
        </g>
      );
  }
}

function accessory(kind: Spec['accessory'], f: Face, trim: string): ReactNode {
  switch (kind) {
    case 'ruff':
      return (
        <g>
          <ellipse cx={100} cy={170} rx={44} ry={13} fill="#f4f0e6" />
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return (
              <ellipse
                key={i}
                cx={100 + Math.cos(a) * 36}
                cy={170 + Math.sin(a) * 9}
                rx={7}
                ry={4.5}
                fill="#ffffff"
                stroke="#d8d0c0"
                strokeWidth={0.8}
              />
            );
          })}
        </g>
      );
    case 'necklace':
      return (
        <g>
          <path d="M76,176 Q100,204 124,176" stroke={GOLD} strokeWidth={2} fill="none" />
          <path
            d="M100,194 L105,201 L100,208 L95,201 Z"
            fill={trim}
            stroke={GOLD_DARK}
            strokeWidth={0.8}
          />
        </g>
      );
    case 'pearls':
      return (
        <g fill="#f4f0e8">
          {Array.from({ length: 15 }, (_, i) => {
            const t = i / 14;
            return (
              <circle key={i} cx={74 + t * 52} cy={178 + Math.sin(t * Math.PI) * 20} r={2.4} />
            );
          })}
          {Array.from({ length: 19 }, (_, i) => {
            const t = i / 18;
            return (
              <circle
                key={`b${i}`}
                cx={68 + t * 64}
                cy={182 + Math.sin(t * Math.PI) * 32}
                r={2.4}
              />
            );
          })}
        </g>
      );
    case 'medal':
      return (
        <g>
          <rect x={64} y={196} width={8} height={10} fill="#b8322a" />
          <path
            d="M68,206 l3,6 6.5,.8 -4.8,4.4 1.2,6.4 -5.9,-3.2 -5.9,3.2 1.2,-6.4 -4.8,-4.4 6.5,-.8 z"
            fill={GOLD}
          />
        </g>
      );
    case 'earrings':
      return (
        <g fill={GOLD}>
          <circle cx={100 - f.w - 1} cy={116} r={3} />
          <circle cx={100 + f.w + 1} cy={116} r={3} />
        </g>
      );
    case 'beads':
      return (
        <g>
          {Array.from({ length: 13 }, (_, i) => {
            const t = i / 12;
            return (
              <circle
                key={i}
                cx={72 + t * 56}
                cy={178 + Math.sin(t * Math.PI) * 18}
                r={3.4}
                fill={['#c9442e', GOLD, '#2f6f8a', '#e8e0cc'][i % 4]}
              />
            );
          })}
        </g>
      );
    case 'collar':
      // A broad beaded collar in bands.
      return (
        <g fill="none">
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M${62 - i * 7},${172 + i * 4} Q100,${200 + i * 10} ${138 + i * 7},${172 + i * 4}`}
              stroke={['#2f6f8a', GOLD, '#b8322a', GOLD][i]}
              strokeWidth={5}
            />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function headwear(spec: Spec, f: Face): ReactNode {
  const { top, w } = f;
  const c = spec.outfitColor;
  switch (spec.headwear) {
    case 'laurel':
      return (
        <g>
          {[-1, 1].map((s) =>
            Array.from({ length: 7 }, (_, i) => {
              const a = Math.PI * (0.98 - i * 0.075);
              const x = 100 + s * Math.cos(a) * -(w + 2);
              const y = 98 - Math.sin(a) * 0 - i * 6.5;
              return (
                <ellipse
                  key={`${s}${i}`}
                  cx={x + s * i * 3.2}
                  cy={y}
                  rx={6.5}
                  ry={2.6}
                  fill={i % 2 ? '#b89a3e' : '#d4b45a'}
                  transform={`rotate(${s * (-40 + i * 9)} ${x + s * i * 3.2} ${y})`}
                />
              );
            }),
          )}
        </g>
      );
    case 'crown':
      return (
        <g>
          <path
            d={`M${100 - w + 2},${top + 22} L${100 - w + 2},${top + 4} L${100 - w * 0.55},${top + 14} L${100 - w * 0.3},${top - 8} L100,${top + 10} L${100 + w * 0.3},${top - 8} L${100 + w * 0.55},${top + 14} L${100 + w - 2},${top + 4} L${100 + w - 2},${top + 22} Z`}
            fill={GOLD}
            stroke={GOLD_DARK}
            strokeWidth={1}
          />
          <rect
            x={100 - w + 2}
            y={top + 16}
            width={(w - 2) * 2}
            height={7}
            fill={dark(GOLD, 0.15)}
          />
          <circle cx={100} cy={top + 19.5} r={3} fill="#b8322a" />
          <circle cx={100 - w * 0.5} cy={top + 19.5} r={2.2} fill="#2f5f9a" />
          <circle cx={100 + w * 0.5} cy={top + 19.5} r={2.2} fill="#2f5f9a" />
        </g>
      );
    case 'tall_crown':
      return (
        <g>
          <path
            d={`M${100 - w + 1},${top + 24} L${100 - w + 6},${top - 16} Q100,${top - 34} ${100 + w - 6},${top - 16} L${100 + w - 1},${top + 24} Z`}
            fill={GOLD}
            stroke={GOLD_DARK}
            strokeWidth={1}
          />
          {[-16, -2, 12].map((dy) => (
            <path
              key={dy}
              d={`M${100 - w + 4},${top + dy} Q100,${top + dy - 6} ${100 + w - 4},${top + dy}`}
              stroke={GOLD_DARK}
              strokeWidth={1.2}
              fill="none"
            />
          ))}
          <rect
            x={100 - w + 1}
            y={top + 17}
            width={(w - 1) * 2}
            height={8}
            fill={dark(GOLD, 0.2)}
          />
          <circle cx={100} cy={top - 4} r={4} fill="#2f8a6a" />
        </g>
      );
    case 'diadem':
    case 'circlet':
      return (
        <g>
          <path
            d={`M${100 - w - 1},${top + 26} Q100,${top + 14} ${100 + w + 1},${top + 26}`}
            stroke={GOLD}
            strokeWidth={3}
            fill="none"
          />
          {spec.headwear === 'diadem' && (
            <circle cx={100} cy={top + 19} r={3.4} fill="#b8322a" stroke={GOLD} strokeWidth={1.2} />
          )}
        </g>
      );
    case 'nemes':
      return (
        <g>
          <path
            d={`M100,${top - 10} C${100 + w + 18},${top - 10} ${100 + w + 16},${top + 30} ${100 + w + 12},${top + 52} L${100 + w + 26},${top + 128} L${100 + w + 2},${top + 120} L${100 + w + 2},${top + 58} C${100 + w + 2},${top + 36} ${100 + w - 8},${top + 22} 100,${top + 22} C${100 - w + 8},${top + 22} ${100 - w - 2},${top + 36} ${100 - w - 2},${top + 58} L${100 - w - 2},${top + 120} L${100 - w - 26},${top + 128} L${100 - w - 12},${top + 52} C${100 - w - 16},${top + 30} ${100 - w - 18},${top - 10} 100,${top - 10} Z`}
            fill={GOLD}
          />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M${100 - w - 14 + i * ((w + 14) / 4)},${top - 4 + Math.abs(i - 4) * 3} L${100 - w - 20 + i * ((w + 20) / 4)},${top + 120}`}
              stroke="#2f4f8a"
              strokeWidth={3.4}
              opacity={0.9}
            />
          ))}
          <path
            d={`M${100 - w - 2},${top + 58} L${100 - w - 2},${top + 120} L${100 + w + 2},${top + 120} L${100 + w + 2},${top + 58} C${100 + w + 2},${top + 36} ${100 + w - 8},${top + 22} 100,${top + 22} C${100 - w + 8},${top + 22} ${100 - w - 2},${top + 36} ${100 - w - 2},${top + 58} Z`}
            fill="none"
          />
          <path
            d={`M${100 - w + 2},${top + 26} Q100,${top + 18} ${100 + w - 2},${top + 26}`}
            stroke={dark(GOLD, 0.2)}
            strokeWidth={5}
            fill="none"
          />
          <path
            d={`M100,${top + 10} q4,6 0,12 q-4,-6 0,-12 Z`}
            fill="#c9a14f"
            stroke={GOLD_DARK}
            strokeWidth={1.2}
          />
        </g>
      );
    case 'fur_hat':
      return (
        <g>
          <path
            d={`M${100 - w + 2},${top + 16} C${100 - w},${top - 30} ${100 + w},${top - 30} ${100 + w - 2},${top + 16} Z`}
            fill={c}
          />
          <circle cx={100} cy={top - 18} r={4} fill={GOLD} />
          <rect
            x={100 - w - 6}
            y={top + 10}
            width={(w + 6) * 2}
            height={16}
            rx={8}
            fill="#7a5a3c"
          />
          {Array.from({ length: 12 }, (_, i) => (
            <circle
              key={i}
              cx={100 - w - 2 + i * ((w * 2 + 4) / 11)}
              cy={top + 18 + (i % 2) * 2}
              r={4.4}
              fill="#8e6c4a"
            />
          ))}
        </g>
      );
    case 'bicorne':
      return (
        <g>
          <path
            d={`M${100 - w - 26},${top + 22} Q100,${top - 42} ${100 + w + 26},${top + 22} Q100,${top + 6} ${100 - w - 26},${top + 22} Z`}
            fill="#1b1b1e"
          />
          <path
            d={`M${100 - w - 26},${top + 22} Q100,${top + 6} ${100 + w + 26},${top + 22}`}
            stroke={GOLD}
            strokeWidth={1.6}
            fill="none"
          />
          <circle cx={100 + w - 2} cy={top + 2} r={6} fill="#2f4f9a" />
          <circle cx={100 + w - 2} cy={top + 2} r={4} fill="#f2efe8" />
          <circle cx={100 + w - 2} cy={top + 2} r={2} fill="#b8322a" />
        </g>
      );
    case 'top_hat':
      return (
        <g>
          <rect
            x={100 - w + 4}
            y={top - 40}
            width={(w - 4) * 2}
            height={52}
            rx={3}
            fill="#1a1a1c"
          />
          <rect x={100 - w + 4} y={top + 2} width={(w - 4) * 2} height={7} fill="#2e2e33" />
          <ellipse cx={100} cy={top + 13} rx={w + 14} ry={6} fill="#141416" />
        </g>
      );
    case 'mian':
      return (
        <g>
          <path
            d={`M${100 - w + 6},${top + 18} L${100 - w + 10},${top - 8} L${100 + w - 10},${top - 8} L${100 + w - 6},${top + 18} Z`}
            fill="#1a1a1c"
          />
          <rect x={100 - w - 16} y={top - 16} width={(w + 16) * 2} height={8} fill="#1a1a1c" />
          <rect x={100 - w - 16} y={top - 16} width={(w + 16) * 2} height={2} fill={GOLD} />
          {Array.from({ length: 9 }, (_, i) => {
            const x = 100 - w - 12 + i * ((w + 12) / 4);
            return (
              <g key={i}>
                <line x1={x} y1={top - 8} x2={x} y2={top + 24} stroke="#3a2e22" strokeWidth={0.8} />
                {[0, 1, 2, 3].map((k) => (
                  <circle
                    key={k}
                    cx={x}
                    cy={top - 2 + k * 7.5}
                    r={1.8}
                    fill={['#c9442e', GOLD, '#2f6f8a', '#e8e0cc'][(i + k) % 4]}
                  />
                ))}
              </g>
            );
          })}
        </g>
      );
    case 'turban':
      return (
        <g>
          <path
            d={`M${100 - w - 4},${top + 26} C${100 - w - 8},${top - 26} ${100 + w + 8},${top - 26} ${100 + w + 4},${top + 26} Q100,${top + 14} ${100 - w - 4},${top + 26} Z`}
            fill={c}
          />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${100 - w - 2},${top + 18 - i * 12} Q100,${top + 4 - i * 14} ${100 + w + 2},${top + 18 - i * 12}`}
              stroke={dark(c, 0.25)}
              strokeWidth={2}
              fill="none"
            />
          ))}
          <circle cx={100} cy={top + 6} r={4} fill={GOLD} />
        </g>
      );
    case 'helmet':
      return (
        <g>
          <path
            d={`M${100 - w - 4},${top + 30} C${100 - w - 6},${top - 16} ${100 + w + 6},${top - 16} ${100 + w + 4},${top + 30} L${100 + w - 4},${top + 30} Q100,${top + 18} ${100 - w + 4},${top + 30} Z`}
            fill={GOLD}
            stroke={GOLD_DARK}
            strokeWidth={1}
          />
          <path
            d={`M${100 - 6},${top - 8} C${100 - 30},${top - 30} ${100 + 30},${top - 34} ${100 + 44},${top + 6} L${100 + 34},${top + 6} C${100 + 24},${top - 18} ${100 + 4},${top - 18} 100,${top - 4} Z`}
            fill={c}
          />
        </g>
      );
    case 'veil':
      return (
        <path
          d={`M100,${top - 10} C${100 + w + 16},${top - 10} ${100 + w + 20},${top + 50} ${100 + w + 30},${top + 128} L${100 + w + 8},${top + 120} C${100 + w + 6},${top + 70} ${100 + w},${top + 30} 100,${top + 22} C${100 - w},${top + 30} ${100 - w - 6},${top + 70} ${100 - w - 8},${top + 120} L${100 - w - 30},${top + 128} C${100 - w - 20},${top + 50} ${100 - w - 16},${top - 10} 100,${top - 10} Z`}
          fill={c}
          opacity={0.92}
        />
      );
    case 'feathers':
      return (
        <g>
          {Array.from({ length: 9 }, (_, i) => {
            const a = -60 + i * 15;
            return (
              <ellipse
                key={i}
                cx={100}
                cy={top - 14}
                rx={5}
                ry={24}
                fill={i % 2 ? '#e8e0cc' : c}
                transform={`rotate(${a} 100 ${top + 16})`}
              />
            );
          })}
          <rect x={100 - w - 2} y={top + 12} width={(w + 2) * 2} height={8} fill={spec.trim} />
        </g>
      );
    case 'cap':
      return (
        <path
          d={`M${100 - w - 2},${top + 22} C${100 - w - 4},${top - 18} ${100 + w + 4},${top - 18} ${100 + w + 2},${top + 22} Z`}
          fill={c}
        />
      );
    default:
      return null;
  }
}

// --- The portrait -------------------------------------------------------------------------------

const FALLBACK: Spec = {
  skin: '#c79a74',
  hair: '#2e2218',
  eyes: '#4a3626',
  face: 'oval',
  hairStyle: 'short',
  beard: 'none',
  headwear: 'none',
  outfit: 'robe',
  outfitColor: '#5a4a6a',
  trim: '#d4a94e',
  accessory: 'none',
  expression: 'neutral',
};

// --- The painted scene behind a bust -----------------------------------------------------------

/** A landmark of the civ's architecture on the far hills, as a silhouette. */
function landmark(kind: string, color: string): ReactNode {
  switch (kind) {
    case 'european':
      return (
        <path
          d="M150,178V140h6v-6h4v6h4v-6h4v6h6v38ZM178,178v-50h-3v-6h3v-4h4v4h3v6h-3v50Z M156,178v-22h20v22Z"
          fill={color}
        />
      );
    case 'northern':
      return <path d="M152,178l10-14h-4l9-14h-4l9-16 9 16h-4l9 14h-4l10 14Z" fill={color} />;
    case 'east_asian':
      return (
        <path
          d="M150,178h44v-4h-4l-6-8h-4l3-6h-24l3 6h-4l-6 8h-4Z M158,160l5-8h-3l4-8h14l4 8h-3l5 8Z M164,144l4-7h8l4 7Z M171,137v-8h2v8Z"
          fill={color}
        />
      );
    case 'south_asian':
      return (
        <path
          d="M148,178h48v-6h-6v-10c0-12-7-20-14-22v-6h-2v-4h-1v4h-2v6c-7 2-14 10-14 22v10h-9Z"
          fill={color}
        />
      );
    case 'middle_eastern':
      return (
        <path
          d="M150,178h40v-14c0-10-8-18-16-19v-4h-2v4c-8 1-16 9-16 19v-1h-6Z M188,178v-40l2-6 2 6v40Z M151,178v-30l1.6-5 1.6 5v30Z"
          fill={color}
        />
      );
    case 'african':
      return (
        <path
          d="M150,178v-8l10-12 10 12v8Z M168,178v-10l9-11 9 11v10Z M184,178v-34c-6-1-10-6-8-10 3 0 6 2 8 4 0-6 3-10 6-12 3 2 6 6 6 12 2-2 5-4 8-4 2 4-2 9-8 10v34Z"
          fill={color}
        />
      );
    case 'american':
      return (
        <path d="M146,178h50v-6h-5v-7h-5v-7h-5v-7h-6v-6h-8v6h-6v7h-5v7h-5v7h-5Z" fill={color} />
      );
    case 'steppe':
      return (
        <path
          d="M148,178c0-9 5-14 13-14s13 5 13 14Z M168,178c0-11 6-17 15-17s15 6 15 17Z M159,164l2-6 2 6Z M181,161l2-6 2 6Z"
          fill={color}
        />
      );
    default:
      // A temple: steps, columns, a pediment.
      return (
        <g fill={color}>
          <path d="M146,178h50v-4h-50Z M148,174h46v-3h-46Z M146,146h50l-25-12Z M146,146h50v3h-50Z" />
          {[150, 159, 168, 177, 186].map((x) => (
            <rect key={x} x={x} y={149} width={4.5} height={22} />
          ))}
        </g>
      );
  }
}

/** Dusk behind the leader: a warm horizon, far hills, a landmark of their civ, soft clouds. */
function scene(uid: string, primary: string, kind: string): ReactNode {
  const far = mix(dark(primary, 0.55), '#3a3a4a', 0.35);
  const near = dark(primary, 0.78);
  return (
    <g>
      <rect x="0" y="0" width="200" height="240" fill={`url(#sky${uid})`} />
      <ellipse
        cx="150"
        cy="150"
        rx="90"
        ry="46"
        fill="#ffd79a"
        opacity="0.22"
        filter={`url(#soft${uid})`}
      />
      <g opacity="0.3" filter={`url(#soft${uid})`} fill="#ffe8c4">
        <ellipse cx="40" cy="62" rx="34" ry="5" />
        <ellipse cx="165" cy="88" rx="30" ry="4" />
        <ellipse cx="120" cy="40" rx="22" ry="3" />
      </g>
      <path
        d="M0,170C30,152 60,158 90,150C120,142 150,156 200,146V240H0Z"
        fill={far}
        opacity="0.85"
      />
      <g opacity="0.85">{landmark(kind, mix(far, '#000', 0.2))}</g>
      <path d="M0,190C40,176 80,186 120,178C150,172 175,180 200,174V240H0Z" fill={near} />
    </g>
  );
}

/**
 * Painted form on the face: soft shadow on the side away from the light, hollows under the
 * cheekbones and along the jaw, light on the forehead, the cheek, the bridge of the nose and the
 * chin. All blurred and clipped to the face, so it reads as modeling, not lines.
 */
function modeling(uid: string, f: Face, skin: string): ReactNode {
  const shade = dark(skin, 0.42);
  const lit = light(skin, 0.38);
  return (
    <g clipPath={`url(#face${uid})`} filter={`url(#soft${uid})`}>
      <ellipse cx={100 + f.w * 0.78} cy={110} rx={f.w * 0.55} ry={40} fill={shade} opacity={0.42} />
      <ellipse cx={100 - f.w * 0.98} cy={98} rx={6} ry={20} fill={shade} opacity={0.3} />
      <ellipse cx={100 + f.w * 0.55} cy={124} rx={8} ry={5} fill={shade} opacity={0.35} />
      <ellipse cx={100 - f.w * 0.55} cy={124} rx={7} ry={4} fill={shade} opacity={0.22} />
      <ellipse cx={100} cy={f.bottom - 3} rx={f.jaw * 0.9} ry={7} fill={shade} opacity={0.28} />
      <ellipse cx={100} cy={121.5} rx={6} ry={2.2} fill={shade} opacity={0.45} />
      <ellipse cx={92} cy={f.top + 20} rx={16} ry={9} fill={lit} opacity={0.5} />
      <ellipse cx={85} cy={111} rx={8} ry={6} fill={lit} opacity={0.42} />
      <ellipse cx={100} cy={108} rx={2.2} ry={8} fill={lit} opacity={0.55} />
      <ellipse cx={98} cy={f.bottom - 9} rx={6} ry={3} fill={lit} opacity={0.35} />
    </g>
  );
}

export function Portrait({
  portrait,
  primary,
  secondary,
  size = 160,
  framed = false,
  painted = false,
  title,
  className,
  crop = 'bust',
  scene: sceneKind = 'mediterranean',
}: Props) {
  const uid = useId().replace(/:/g, '');
  const spec = portrait ?? FALLBACK;
  const f = FACES[spec.face];
  const skin = spec.skin;
  const lip = mix(skin, '#a0463c', 0.38);
  const viewBox = crop === 'head' ? '42 30 116 116' : '0 0 200 240';
  const width = size;
  const height = crop === 'head' ? size : typeof size === 'number' ? (size * 240) / 200 : size;
  if (spec.image) {
    return (
      <img
        className={`portrait ${framed ? 'framed' : ''} ${className ?? ''}`}
        src={spec.image}
        alt={title ?? ''}
        width={typeof width === 'number' ? width : undefined}
        height={typeof height === 'number' ? height : undefined}
        style={{ objectFit: 'cover' }}
      />
    );
  }
  return (
    <svg
      className={`portrait ${framed ? 'framed' : ''} ${className ?? ''}`}
      viewBox={viewBox}
      width={width}
      height={height}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="38%" r="75%">
          <stop offset="0" stopColor={light(mix(primary, secondary, 0.25), 0.18)} />
          <stop offset="0.55" stopColor={dark(primary, 0.35)} />
          <stop offset="1" stopColor={dark(primary, 0.78)} />
        </radialGradient>
        <linearGradient id={`skin${uid}`} x1="0.2" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor={light(skin, 0.14)} />
          <stop offset="0.55" stopColor={skin} />
          <stop offset="1" stopColor={dark(skin, 0.18)} />
        </linearGradient>
        <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(dark(primary, 0.72), '#1a2230', 0.4)} />
          <stop offset="0.45" stopColor={mix(dark(primary, 0.35), '#c88a5a', 0.3)} />
          <stop offset="0.66" stopColor={mix('#f0c27c', primary, 0.22)} />
          <stop offset="1" stopColor={dark(primary, 0.6)} />
        </linearGradient>
        <filter id={`soft${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <clipPath id={`face${uid}`}>
          <path d={facePath(f)} />
        </clipPath>
        <linearGradient id={`light${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6e0" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff6e0" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        {painted && (
          <filter id={`paint${uid}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035"
              numOctaves="2"
              seed="7"
              result="warp"
            />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.2" result="wobble" />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="1"
              seed="3"
              result="grain"
            />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.09 0"
              result="grainA"
            />
            <feComposite in="grainA" in2="wobble" operator="in" result="grainIn" />
            <feMerge>
              <feMergeNode in="wobble" />
              <feMergeNode in="grainIn" />
            </feMerge>
          </filter>
        )}
      </defs>
      {crop === 'head' ? (
        <rect x="0" y="0" width="200" height="240" fill={`url(#bg${uid})`} />
      ) : (
        scene(uid, primary, sceneKind)
      )}
      <g filter={painted ? `url(#paint${uid})` : undefined}>
        {hairBack(spec.hairStyle, spec.hair, f)}
        {spec.headwear === 'nemes' || spec.headwear === 'veil' ? headwear(spec, f) : null}
        {outfit(spec, skin)}
        {/* Neck, with the jaw's shadow. */}
        <path d="M84,126 L84,172 Q100,180 116,172 L116,126 Z" fill={dark(skin, 0.08)} />
        <ellipse cx={100} cy={146} rx={18} ry={9} fill={dark(skin, 0.3)} opacity={0.4} />
        {accessory(
          spec.accessory === 'ruff' || spec.accessory === 'collar' ? spec.accessory : 'none',
          f,
          spec.trim,
        )}
        {/* Ears. */}
        <ellipse cx={100 - f.w - 1} cy={106} rx={5} ry={9.5} fill={dark(skin, 0.1)} />
        <ellipse cx={100 + f.w + 1} cy={106} rx={5} ry={9.5} fill={dark(skin, 0.1)} />
        {/* Face. */}
        <path d={facePath(f)} fill={`url(#skin${uid})`} />
        <ellipse cx={83} cy={117} rx={7} ry={5} fill="#d0604e" opacity={0.13} />
        <ellipse cx={117} cy={117} rx={7} ry={5} fill="#d0604e" opacity={0.13} />
        {modeling(uid, f, skin)}
        {eyes(spec, skin)}
        {/* Nose. */}
        <path
          d="M101,103 Q99,113 95,118 Q100,121.5 105,118"
          stroke={dark(skin, 0.32)}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M95,118 Q100,121.5 105,118 Q100,123.5 95,118 Z"
          fill={dark(skin, 0.2)}
          opacity={0.6}
        />
        {beard(spec.beard, spec.hair, f)}
        {mouth(spec.expression, lip)}
        {hairFront(spec.hairStyle, spec.hair, f)}
        {spec.headwear !== 'nemes' && spec.headwear !== 'veil' ? headwear(spec, f) : null}
        {accessory(
          spec.accessory === 'ruff' || spec.accessory === 'collar' ? 'none' : spec.accessory,
          f,
          spec.trim,
        )}
        {/* A warm rim of light on the shoulders from the sunset behind. */}
        <path
          d={SHOULDERS}
          fill="none"
          stroke="#ffd9a0"
          strokeWidth={3}
          opacity={0.32}
          filter={`url(#soft${uid})`}
        />
        {/* Key light from the upper left, shade to the lower right. */}
        <rect x="0" y="0" width="200" height="240" fill={`url(#light${uid})`} />
      </g>
    </svg>
  );
}
