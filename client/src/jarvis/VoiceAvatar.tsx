import { useId } from 'react';
import type { ReactNode } from 'react';

// A face for each of Jarvis's voices (server/jarvis/voice.js TTS_VOICES), so
// picking one feels like picking someone. Drawn here rather than loaded:
// six small SVGs, no image files, no licences.

interface Look {
  background: string;
  skin: string;
  shade: string;
  hair: string;
  shirt: string;
  // The smile's colour, light against a beard.
  mouth?: string;
  // Hair behind the head (long hair, a bob), drawn before the face.
  back?: ReactNode;
  // Hair, beard and accessories over the face.
  front: ReactNode;
  // Under the hair: glasses, a beard.
  extra?: ReactNode;
}

const LOOKS: Record<string, Look> = {
  // Long dark hair, side parting, small gold earrings.
  marin: {
    background: '#c7d2fe',
    skin: '#f2c9a8',
    shade: '#dca684',
    hair: '#3d2a1f',
    shirt: '#4f46e5',
    back: <path d="M20.5 29C19.5 17.5 25 13.2 32 13.2S44.5 17.5 43.5 29L45.5 48C40 51 24 51 18.5 48Z" />,
    front: (
      <>
        <path d="M21.3 27.5C20.8 18.5 25.6 14.4 32.4 14.4 38.8 14.4 43.4 18.6 42.6 27 40.6 22.6 37.6 20.4 34.4 19.6 31.2 21.8 26.2 23.8 21.3 27.5Z" />
        <circle cx="21.3" cy="33.6" r="0.95" fill="#f5c542" />
        <circle cx="42.7" cy="33.6" r="0.95" fill="#f5c542" />
      </>
    ),
  },
  // Blonde bob with a straight fringe.
  shimmer: {
    background: '#fde68a',
    skin: '#f7d7bf',
    shade: '#e2b496',
    hair: '#d9a441',
    shirt: '#0d9488',
    back: <path d="M19.8 31C19 18 25 13 32 13S45 18 44.2 31C44.2 36 43.4 39.6 41.8 41.6H22.2C20.6 39.6 19.8 36 19.8 31Z" />,
    front: <path d="M21.1 25.8C21.1 17.6 26 14 32 14S42.9 17.6 42.9 25.8C39.4 23.4 35.8 22.4 32 22.4S24.6 23.4 21.1 25.8Z" />,
  },
  // Auburn hair in a bun, gold hoops.
  coral: {
    background: '#fecdd3',
    skin: '#e8b48f',
    shade: '#cf9570',
    hair: '#9c3f24',
    shirt: '#be185d',
    back: <circle cx="32" cy="12.6" r="5.8" />,
    front: (
      <>
        <path d="M21 27C20.5 18 25.6 14 32 14S43.5 18 43 27C41.5 22.5 38 19.8 32 19.8S22.5 22.5 21 27Z" />
        <circle cx="21.3" cy="34.2" r="1.35" fill="none" stroke="#f5c542" strokeWidth="0.8" />
        <circle cx="42.7" cy="34.2" r="1.35" fill="none" stroke="#f5c542" strokeWidth="0.8" />
      </>
    ),
  },
  // Short dark hair and a full beard.
  cedar: {
    background: '#bbf7d0',
    skin: '#d9a27a',
    shade: '#bf845d',
    hair: '#2f2a26',
    shirt: '#15803d',
    mouth: '#f3d5c0',
    extra: (
      <path
        d="M21.6 30.5C22.2 38.6 26.6 42.6 32 42.6S41.8 38.6 42.4 30.5C41.4 34.6 39.4 36.4 37 36.6 35 36.8 33.6 35.6 32 35.6S29 36.8 27 36.6C24.6 36.4 22.6 34.6 21.6 30.5Z"
        fill="#2f2a26"
      />
    ),
    front: <path d="M21.3 26C20.6 17.4 25.6 13.8 32.2 13.8 38.8 13.8 43.6 17.6 42.7 26 41.6 22.2 39.6 20.4 36.6 19.8 33 19.2 28.8 19.4 25.8 20.6 23.4 21.6 22 23.4 21.3 26Z" />,
  },
  // Brown hair swept up into a quiff.
  verse: {
    background: '#bae6fd',
    skin: '#f0c29c',
    shade: '#d9a37b',
    hair: '#6b4226',
    shirt: '#0369a1',
    front: (
      <>
        <path d="M21.4 25.5C20.8 18 24.2 12.6 30 11.4 33.8 10.6 38.6 11.4 41 14.6 43.2 17.4 43.4 21.6 42.6 25.5 41.6 21.6 39.6 19.4 36.4 18.8 32.6 18.2 27.6 18.8 24.6 20.8 22.8 22 21.8 23.6 21.4 25.5Z" />
        <path d="M26.6 15.4C28.6 10.8 34.6 9.4 38.6 11.8 35.2 11.6 32 13 30.2 15.8Z" fill="#8a5a36" />
      </>
    ),
  },
  // Grey side-parted hair and round glasses.
  echo: {
    background: '#ddd6fe',
    skin: '#c98d66',
    shade: '#ad7149',
    hair: '#8b9099',
    shirt: '#5b21b6',
    extra: (
      <g fill="none" stroke="#1f2937" strokeWidth="1.05">
        <circle cx="28" cy="29.6" r="3.3" />
        <circle cx="36" cy="29.6" r="3.3" />
        <path d="M31.3 29.3Q32 28.6 32.7 29.3M24.7 29.2L21.8 28.4M39.3 29.2L42.2 28.4" />
      </g>
    ),
    front: <path d="M21.3 25.8C20.8 18.2 25.4 14.2 32 14.2S43.4 18 42.7 25.8C41.8 22 40 20.2 37.2 19.4L35.6 21C32 20.4 27.2 20.6 24.4 22 22.8 22.8 21.8 24.2 21.3 25.8Z" />,
  },
};

// A voice without a drawing of its own (a future one): a neutral silhouette.
const FALLBACK: Look = {
  background: '#e2e8f0',
  skin: '#cbd5e1',
  shade: '#94a3b8',
  hair: '#64748b',
  shirt: '#64748b',
  front: <path d="M21.3 25.8C20.8 18.2 25.4 14.2 32 14.2S43.4 18 42.7 25.8C40 21.6 36.4 20 32 20S24 21.6 21.3 25.8Z" />,
};

export function VoiceAvatar({ voice, size = 40 }: { voice: string; size?: number }) {
  const clip = useId();
  const look = LOOKS[voice] ?? FALLBACK;
  return (
    <svg className="jarvis-voice-avatar" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={look.background} />
        <g fill={look.hair}>{look.back}</g>
        <path d="M11 66C12 52.5 21.5 46.6 32 46.6S52 52.5 53 66Z" fill={look.shirt} />
        <path d="M27.4 38H36.6V46.2C36.6 49 27.4 49 27.4 46.2Z" fill={look.shade} />
        <ellipse cx="21.2" cy="30" rx="2.4" ry="3" fill={look.skin} />
        <ellipse cx="42.8" cy="30" rx="2.4" ry="3" fill={look.skin} />
        <ellipse cx="32" cy="28.5" rx="10.8" ry="12.6" fill={look.skin} />
        <circle cx="25.6" cy="33.6" r="1.9" fill="#f28b82" opacity="0.28" />
        <circle cx="38.4" cy="33.6" r="1.9" fill="#f28b82" opacity="0.28" />
        {look.extra}
        <g fill="#2a2320">
          <ellipse cx="28" cy="29.6" rx="1.25" ry="1.45" />
          <ellipse cx="36" cy="29.6" rx="1.25" ry="1.45" />
        </g>
        <g fill="none" strokeLinecap="round">
          <path d="M25.8 26.1Q28 24.8 30.2 26.1M33.8 26.1Q36 24.8 38.2 26.1" stroke={look.hair} strokeWidth="1.1" />
          <path d="M32 30.6Q31 33.4 32.7 33.9" stroke={look.shade} strokeWidth="0.9" />
          <path d="M28.8 36.2Q32 38.8 35.2 36.2" stroke={look.mouth ?? '#9a4a3c'} strokeWidth="1.25" />
        </g>
        <g fill={look.hair}>{look.front}</g>
      </g>
    </svg>
  );
}
