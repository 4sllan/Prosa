<template>
  <svg viewBox="0 0 600 520" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="community-background" x1="0" y1="0" x2="600" y2="520" gradientUnits="userSpaceOnUse">
        <stop stop-color="#10052f" /><stop offset=".5" stop-color="#1d0750" /><stop offset="1" stop-color="#080319" />
      </linearGradient>
      <linearGradient id="community-frame" x1="70" y1="150" x2="530" y2="400" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f857ff" /><stop offset=".45" stop-color="#852dff" /><stop offset="1" stop-color="#fa5dff" />
      </linearGradient>
      <linearGradient id="community-shirt" x1="0" y1="0" x2="60" y2="100" gradientUnits="userSpaceOnUse">
        <stop stop-color="#6e45ef" /><stop offset="1" stop-color="#0f165d" />
      </linearGradient>
      <linearGradient id="community-jacket" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
        <stop stop-color="#08d9e9" /><stop offset=".6" stop-color="#1657a6" /><stop offset="1" stop-color="#25216a" />
      </linearGradient>
      <radialGradient id="community-glow">
        <stop stop-color="#9c17fb" stop-opacity=".6" /><stop offset="1" stop-color="#570bb7" stop-opacity="0" />
      </radialGradient>
      <filter id="community-neon" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <clipPath id="community-window">
        <rect x="77" y="179" width="446" height="191" rx="20" />
      </clipPath>
      <g id="community-person">
        <path d="M0 110c0-31 18-42 42-42s42 11 42 42v44H0v-44Z" fill="url(#community-shirt)" />
        <path d="m22 77 20 32 20-32-8-5H30l-8 5Z" fill="#ca85d9" />
        <path d="M31 60h22v20c-6 9-16 9-22 0V60Z" fill="#d28fbd" />
        <path d="M17 34c0-19 12-29 25-29s25 10 25 29v16c0 21-14 32-25 32S17 71 17 50V34Z" fill="#ebb7d4" />
        <path d="M17 45c-12 0-8 18 2 18m46-18c12 0 8 18-2 18" fill="#ce84bc" />
        <path d="M17 38c-7-22 4-36 25-36 21 0 30 13 25 34-7-4-12-12-14-18-9 12-22 18-36 20Z" fill="#372052" />
        <path d="m24 44 10-2m16 0 10 2" stroke="#512855" stroke-width="3" stroke-linecap="round" />
        <path d="M29 50h2m22 0h2" stroke="#282341" stroke-width="4" stroke-linecap="round" />
        <path d="m42 51-3 10h6" stroke="#b774b0" stroke-width="2" stroke-linecap="round" />
        <path d="M34 68c5 3 11 3 16 0" stroke="#9f4e94" stroke-width="2" stroke-linecap="round" />
        <path d="m9 109 10-10m56 10L65 99M21 127v27m42-27v27" stroke="#ae70ff" stroke-width="2" opacity=".7" />
      </g>
    </defs>
    <rect width="600" height="520" rx="32" fill="url(#community-background)" />
    <ellipse cx="300" cy="270" rx="295" ry="210" fill="url(#community-glow)" />
    <g fill="#b399ff" opacity=".55">
      <circle cx="67" cy="84" r="1" /><circle cx="507" cy="76" r="1.5" />
      <circle cx="451" cy="440" r="1" /><circle cx="101" cy="419" r="1" />
      <circle cx="555" cy="306" r="1.5" /><circle cx="173" cy="69" r="1" />
      <circle cx="349" cy="84" r="1.5" /><circle cx="48" cy="257" r="1" />
    </g>
    <path d="M50 177v-26h27M550 177v-26h-27M50 365v26h27M550 365v26h-27" stroke="#9428f4" stroke-opacity=".45" stroke-width="2" />
    <rect x="59" y="132" width="482" height="261" rx="38" stroke="#b01fff" stroke-width="9" opacity=".7" filter="url(#community-neon)" />
    <rect x="59" y="132" width="482" height="261" rx="38" fill="#180638" stroke="url(#community-frame)" stroke-width="2.5" />
    <rect x="76" y="177" width="448" height="195" rx="22" stroke="#08e6fa" stroke-width="7" filter="url(#community-neon)" />
    <rect x="77" y="179" width="446" height="191" rx="20" fill="#151044" stroke="#59eaff" stroke-width="2" />
    <g clip-path="url(#community-window)">
      <path d="M77 284h446M77 320h446M140 179l-24 193m148-193-8 193m148-193 16 193m70-193 35 193" stroke="#4835bc" stroke-opacity=".4" />
      <ellipse cx="302" cy="384" rx="217" ry="81" fill="#7b22d4" />
      <g transform="translate(87 230) scale(1.14)">
        <use href="#community-person" />
        <path d="m15 28 4-23L33-2l12 8 19-3 7 26-20-9-16 11-20-3Z" fill="#fa65d6" />
        <path d="M18 44h47l-5 14H23l-5-14Z" fill="#18254e" stroke="#fda0f0" stroke-width="2" />
        <path d="m43 45-4 12" stroke="#c37dec" stroke-width="2" />
      </g>
      <g transform="translate(172 214) scale(1.14)">
        <use href="#community-person" />
        <path d="m15 31 3-24 10 2L30-5l12 10 9-13 6 15 13-2-3 28-13-11-13 8-10-7-16 8Z" fill="#c8c4ff" />
        <path d="M22 46h17v13H22V46Zm24 0h17v13H46V46Zm-7 4h7" stroke="#4a225c" stroke-width="3" />
      </g>
      <g transform="translate(255 229) scale(1.22)">
        <path d="M4 90C-6 44 1 1 42 0s49 43 38 90H4Z" fill="#162b84" stroke="#3888dd" stroke-width="2" />
        <use href="#community-person" />
        <path d="M14 41C4 2 26-9 43-7c27 0 42 24 27 52L55 18 35 31 14 41Z" fill="#0d1a4e" />
        <path d="m50 7 10 15 9 25" stroke="#477ceb" stroke-width="3" />
      </g>
      <g transform="translate(351 226) scale(1.14)">
        <path d="M11 101C-2 60 2-1 41-1s50 61 34 102H11Z" fill="#a831ae" />
        <use href="#community-person" />
        <path d="M17 38C7 4 31-6 45-3c23 0 32 19 25 42L49 17c-8 10-18 17-32 21Z" fill="#b437b7" />
        <path d="M20 48c0-9 18-9 18 0v6c0 9-18 9-18 0v-6Zm27 0c0-9 18-9 18 0v6c0 9-18 9-18 0v-6Zm-9 0h9" stroke="#392253" stroke-width="3" />
      </g>
      <g transform="translate(438 216) scale(1.14)">
        <use href="#community-person" />
        <path d="M0 112c0-21 11-32 24-35l18 32 18-32c14 3 24 14 24 35v42H0v-42Z" fill="url(#community-jacket)" />
        <path d="m15 25 3-21 11 9L35-7l10 17L59-3l1 16 11-2-3 23-53-9Z" fill="#263458" stroke="#617b9b" stroke-width="2" />
        <path d="m23 66 8 18h23l9-18-11 6H35l-12-6Z" fill="#3a234b" />
        <path d="M20 43h45l-5 14H25l-5-14Z" fill="#141f39" stroke="#677f9c" stroke-width="2" />
      </g>
      <path d="M77 369h446" stroke="#dc51ff" stroke-width="4" />
    </g>
    <g>
      <circle cx="177" cy="151" r="22" fill="#312067" stroke="#df72ff" stroke-width="2" />
      <circle cx="177" cy="147" r="8" fill="#d69be3" /><path d="M164 166c0-16 26-16 26 0" fill="#468cea" />
      <circle cx="300" cy="151" r="35" fill="#ba17e6" stroke="#ff9bff" stroke-width="2" />
      <path d="M281 145c0-17 38-17 38 0v14l-19 12-19-12v-14Z" stroke="white" stroke-width="3" />
      <path d="m282 143 18 11 18-11m-18 11v16" stroke="white" stroke-width="3" />
      <circle cx="423" cy="151" r="22" fill="#312067" stroke="#df72ff" stroke-width="2" />
      <circle cx="423" cy="147" r="8" fill="#d69be3" /><path d="M410 166c0-16 26-16 26 0" fill="#b636c7" />
    </g>
    <g fill="#ce5cff">
      <circle cx="77" cy="150" r="2" /><circle cx="85" cy="150" r="2" /><circle cx="77" cy="158" r="2" />
    </g>
    <g stroke="#cdc0f7" stroke-width="1.5">
      <circle cx="272" cy="417" r="6" /><circle cx="300" cy="417" r="6" /><circle cx="328" cy="417" r="6" />
      <path d="m270 414 4 3-4 3m27-3h6m22-2 6 4m0-4-6 4" />
    </g>
    <path d="M200 462h200" stroke="#7734b4" stroke-opacity=".25" />
  </svg>
</template>
