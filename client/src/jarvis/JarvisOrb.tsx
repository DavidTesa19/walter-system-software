// Jarvis's orb on the Jarvis screen: a glass sphere with light swirling
// inside, in the palette's primary and accent colours. It shows what Jarvis
// is doing: resting (a slow swirl), thinking (the swirl speeds up, the glow
// breathes), listening (an accent glow that pulses), speaking (the sphere
// pulses with the voice) or unavailable (grey and still). Pure CSS
// (JarvisCommandCenter.css), no canvas or WebGL, so it costs nothing and
// follows the light/dark theme and every palette.

export type OrbState = 'idle' | 'busy' | 'listening' | 'speaking' | 'offline';

const LABELS: Record<OrbState, string> = {
  idle: 'Jarvis je připravený',
  busy: 'Jarvis pracuje',
  listening: 'Jarvis poslouchá',
  speaking: 'Jarvis mluví',
  offline: 'Jarvis není dostupný',
};

export default function JarvisOrb({ state = 'idle', size = 'hero' }: { state?: OrbState; size?: 'hero' | 'compact' | 'mini' }) {
  return (
    <span className={`jorb jorb--${size} jorb--${state}`} role="img" aria-label={LABELS[state]}>
      <span className="jorb-halo" />
      <span className="jorb-sphere">
        <span className="jorb-swirl" />
        <span className="jorb-swirl jorb-swirl--back" />
        <span className="jorb-core" />
        <span className="jorb-gloss" />
      </span>
    </span>
  );
}
