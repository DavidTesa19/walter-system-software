// Jarvis's face on the Jarvis screen: a glowing orb in the palette's primary
// and accent colours, with two eyes. It shows what Jarvis is doing: resting,
// thinking (rings turn faster), listening (accent halo, eyes open), speaking
// (eyes move) or unavailable (grey). Pure CSS (JarvisCommandCenter.css), no
// canvas or WebGL, so it costs nothing and follows the light/dark theme.

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
      {size !== 'mini' && (
        <>
          <span className="jorb-ring jorb-ring--outer" />
          <span className="jorb-ring jorb-ring--inner" />
        </>
      )}
      <span className="jorb-core">
        <span className="jorb-eye" />
        <span className="jorb-eye" />
      </span>
    </span>
  );
}
