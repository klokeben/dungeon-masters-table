import React from 'react';

/** A little heraldic shield — d20 over crossed swords. */
export default function Crest({ size = 46 }) {
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 64 72" aria-hidden>
      <defs>
        <linearGradient id="crestGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eccb5a" />
          <stop offset="55%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#7a6210" />
        </linearGradient>
        <linearGradient id="crestField" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9b2a2a" />
          <stop offset="100%" stopColor="#4a1010" />
        </linearGradient>
      </defs>

      {/* shield */}
      <path
        d="M32 2 L60 11 V36 C60 53 47 65 32 70 C17 65 4 53 4 36 V11 Z"
        fill="url(#crestField)"
        stroke="url(#crestGold)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* crossed swords */}
      <g stroke="#e8dcc0" strokeWidth="2.4" strokeLinecap="round" opacity=".55">
        <path d="M16 54 L46 20" />
        <path d="M48 54 L18 20" />
      </g>

      {/* d20 */}
      <g transform="translate(32 34)">
        <polygon
          points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8"
          fill="#1c130b"
          stroke="url(#crestGold)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <polygon points="0,-16 14,-8 0,-1 -14,-8" fill="url(#crestGold)" opacity=".82" />
        <path d="M0,-1 L14,8 M0,-1 L-14,8 M0,-1 L0,16" stroke="url(#crestGold)" strokeWidth="1.4" fill="none" opacity=".8" />
        <text
          x="0"
          y="10"
          textAnchor="middle"
          fontFamily="Cinzel, Georgia, serif"
          fontSize="11"
          fontWeight="700"
          fill="#eccb5a"
        >
          20
        </text>
      </g>
    </svg>
  );
}
