'use client';

import React, { useId } from 'react';

interface AscleonLogoProps {
  size?: number | string;
  className?: string;
  variant?: 'badge' | 'glyph';
}

export const AscleonLogo: React.FC<AscleonLogoProps> = ({
  size = 28,
  className = '',
  variant = 'badge',
}) => {
  const rawId = useId();
  // Sanitize React useId for SVG id attributes (strip colons)
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const bgId = `ascBg-${id}`;
  const creamId = `ascCream-${id}`;
  const orangeId = `ascOrange-${id}`;
  const glowId = `ascGlow-${id}`;
  const shadowId = `ascShadow-${id}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={`inline-block shrink-0 select-none ${className}`}
      aria-label="Ascleon Logo"
    >
      <defs>
        {/* Background Gradient */}
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1c1a22" />
          <stop offset="50%" stopColor="#121115" />
          <stop offset="100%" stopColor="#0a090b" />
        </linearGradient>

        {/* Warm Cream Serif Gradient */}
        <linearGradient id={creamId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff4dc" />
          <stop offset="100%" stopColor="#f6d7a1" />
        </linearGradient>

        {/* Electric Orange Serpent Gradient */}
        <linearGradient id={orangeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff7333" />
          <stop offset="50%" stopColor="#ff4c00" />
          <stop offset="100%" stopColor="#e03600" />
        </linearGradient>

        {/* Subtle Depth Shadow & Glow */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="10"
            floodColor="#ff4c00"
            floodOpacity="0.38"
          />
        </filter>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="12"
            floodColor="#000"
            floodOpacity="0.5"
          />
        </filter>
      </defs>

      {/* Squircle App Badge if variant is 'badge' */}
      {variant === 'badge' && (
        <rect
          x="24"
          y="24"
          width="464"
          height="464"
          rx="108"
          fill={`url(#${bgId})`}
          stroke="#322e3b"
          strokeWidth="3"
          filter={`url(#${shadowId})`}
        />
      )}

      {/* Fanning Open Book Leaf on Right Side of 'A' */}
      <g transform="translate(290, 160)" opacity="0.95">
        <path
          d="M 40 40 C 75 35, 115 50, 140 85 L 125 210 C 100 180, 65 170, 30 175 Z"
          fill="#eec584"
          opacity="0.45"
        />
        <path
          d="M 28 30 C 65 20, 110 38, 135 75 L 118 200 C 95 168, 55 155, 20 162 Z"
          fill={`url(#${creamId})`}
          stroke="#1a1820"
          strokeWidth="2.5"
        />
        <path
          d="M 118 200 C 100 185, 75 180, 45 185"
          stroke="#ff4c00"
          strokeWidth="3"
          fill="none"
          opacity="0.8"
        />
      </g>

      {/* The Classical Architectural Serif 'A' */}
      <path
        d="M 125 390
           L 185 390
           L 165 370
           L 220 170
           L 242 90
           L 230 90
           L 230 75
           L 282 75
           L 282 90
           L 270 90
           L 330 370
           L 310 390
           L 370 390
           L 370 375
           L 348 375
           L 305 185
           L 245 185
           L 205 375
           L 185 375
           Z"
        fill={`url(#${creamId})`}
        filter={`url(#${shadowId})`}
      />

      {/* Crossbar of 'A' */}
      <path
        d="M 200 285 L 305 285 L 302 305 L 196 305 Z"
        fill={`url(#${creamId})`}
      />

      {/* Staff of Asclepius Core Rod */}
      <line
        x1="256"
        y1="85"
        x2="256"
        y2="405"
        stroke="#ffe8be"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* Staff Golden Finial Nib */}
      <circle cx="256" cy="80" r="9" fill="#ff4c00" filter={`url(#${glowId})`} />
      <circle cx="256" cy="80" r="4.5" fill="#fff" />

      {/* The Entwined Asclepian Serpent */}
      <path
        d="M 285 380
           C 310 340, 290 310, 256 310
           C 215 310, 205 260, 256 260
           C 305 260, 315 210, 275 175
           C 240 145, 230 160, 215 150
           C 200 140, 210 120, 235 115
           C 250 110, 260 118, 265 125"
        fill="none"
        stroke={`url(#${orangeId})`}
        strokeWidth="19"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />

      {/* Serpent Head Details */}
      <path
        d="M 208 144
           C 200 138, 192 145, 198 155
           C 204 163, 218 162, 222 152
           Z"
        fill="#ff4c00"
      />
      {/* Serpent Eye */}
      <circle cx="206" cy="149" r="2.8" fill="#fff" />
      <circle cx="206" cy="149" r="1.2" fill="#0f0e10" />

      {/* Oracle Illumination Spark (Top Apex) */}
      <path
        d="M 256 42 L 260 55 L 272 59 L 260 63 L 256 76 L 252 63 L 240 59 L 252 55 Z"
        fill="#ff4c00"
      />
    </svg>
  );
};

export default AscleonLogo;

