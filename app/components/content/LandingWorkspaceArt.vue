<template>
  <svg viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="workspace-room" x1="0" y1="0" x2="600" y2="600" gradientUnits="userSpaceOnUse">
        <stop stop-color="#042336" /><stop offset=".45" stop-color="#081222" /><stop offset="1" stop-color="#02050c" />
      </linearGradient>
      <linearGradient id="workspace-case" x1="90" y1="100" x2="560" y2="450" gradientUnits="userSpaceOnUse">
        <stop stop-color="#183d58" /><stop offset=".5" stop-color="#0b1422" /><stop offset="1" stop-color="#17233b" />
      </linearGradient>
      <linearGradient id="workspace-desk" x1="0" y1="440" x2="600" y2="600" gradientUnits="userSpaceOnUse">
        <stop stop-color="#06435b" /><stop offset=".5" stop-color="#08192d" /><stop offset="1" stop-color="#060714" />
      </linearGradient>
      <linearGradient id="workspace-keyboard" x1="300" y1="410" x2="300" y2="550" gradientUnits="userSpaceOnUse">
        <stop stop-color="#172d48" /><stop offset="1" stop-color="#07111f" />
      </linearGradient>
      <radialGradient id="workspace-light">
        <stop stop-color="#087eaa" stop-opacity=".42" /><stop offset="1" stop-color="#087eaa" stop-opacity="0" />
      </radialGradient>
      <pattern id="workspace-keys" width="25" height="15" patternUnits="userSpaceOnUse">
        <rect x="2" y="2" width="20" height="9" rx="2" fill="#10253e" stroke="#245175" stroke-width=".6" />
      </pattern>
      <filter id="workspace-blur">
        <feGaussianBlur stdDeviation="14" />
      </filter>
    </defs>
    <rect width="600" height="600" fill="url(#workspace-room)" />
    <ellipse cx="68" cy="316" rx="270" ry="330" fill="url(#workspace-light)" />
    <g opacity=".35">
      <path d="M25 0v451M74 0v451M91 0v451" stroke="#127992" stroke-width="3" />
      <path d="M145 0v349" stroke="#173a53" stroke-width="12" />
      <rect x="193" y="-34" width="378" height="184" rx="5" fill="#030d1d" stroke="#143950" stroke-width="4" />
      <path d="M215 18h90m-75 14h145m-130 14h68m-52 14h210m-195 14h131m-115 14h163m-178 14h87" stroke="#1b72a6" stroke-width="4" />
      <path d="M360 18h51m-70 28h103m-126 28h-31m144 14h58" stroke="#5584a8" stroke-width="4" />
    </g>
    <path d="M-20 205 100 244v242l-120-40V205Z" fill="#060a1c" stroke="#0a3752" stroke-width="5" />
    <g stroke="#d42aaf" stroke-width="5">
      <path d="M0 309v48m9-65v80m9-91v105m9-67v51m9-38v32m9-66v94m9-115v135m9-107v84m9-56v35m9-16v30" />
    </g>
    <path d="M0 454 600 426v174H0V454Z" fill="url(#workspace-desk)" />
    <ellipse cx="326" cy="504" rx="242" ry="40" fill="#030613" opacity=".8" filter="url(#workspace-blur)" />
    <g transform="translate(106 102) rotate(2)">
      <rect width="476" height="335" rx="14" fill="url(#workspace-case)" stroke="#34516d" stroke-width="2" />
      <rect x="10" y="12" width="456" height="309" rx="6" fill="#060e21" />
      <circle cx="238" cy="6" r="2" fill="#527487" />
      <rect x="10" y="12" width="456" height="20" rx="5" fill="#0d2441" />
      <g fill="#6bb5e8">
        <circle cx="20" cy="22" r="2" /><circle cx="28" cy="22" r="2" /><circle cx="36" cy="22" r="2" />
      </g>
      <text x="49" y="25" fill="#8ca9c6" font-size="6" font-family="monospace">PROSA / RELEASE NOTES</text>
      <rect x="10" y="32" width="24" height="277" fill="#09172d" />
      <g stroke="#6b8ead" stroke-width="1.5">
        <rect x="18" y="44" width="8" height="10" rx="1" />
        <circle cx="22" cy="72" r="4" /><path d="m25 76 3 3M18 93l8 8m0-8-8 8M19 117h6v8h-6z" />
        <path d="M18 146h8m-4-4v8M18 166h8m-8 4h8" />
      </g>
      <rect x="34" y="32" width="91" height="277" fill="#0a1428" />
      <text x="42" y="46" fill="#7d96b3" font-size="5" font-family="monospace">EXPLORER</text>
      <g stroke="#526687" stroke-width="2">
        <path d="M44 61h44m-40 13h56m-52 13h47m-47 13h32m-32 13h53m-53 13h41m-41 13h37m-37 13h48" />
      </g>
      <path d="M35 104h89v17H35z" fill="#263960" opacity=".7" />
      <path d="M42 112h4" stroke="#b876ff" stroke-width="2" />
      <path d="M126 32h119v20H126z" fill="#101d35" />
      <circle cx="137" cy="42" r="2" fill="#ad70e5" />
      <text x="144" y="44" fill="#b3c0d6" font-size="6" font-family="monospace">release-notes.md</text>
      <text x="141" y="73" fill="#ce9df0" font-size="8" font-family="monospace"># Uma nova versao do Prosa</text>
      <text x="141" y="89" fill="#55738e" font-size="6" font-family="monospace">Cada conversa, um novo comeco.</text>
      <g stroke-width="3" stroke-linecap="round">
        <path d="M142 109h16m5 0h93" stroke="#63b8e1" />
        <path d="M152 123h36m6 0h108" stroke="#c181dc" />
        <path d="M152 137h68m7 0h57m6 0h63" stroke="#82c6c0" />
        <path d="M152 151h41m7 0h105" stroke="#9badd0" />
        <path d="M142 174h16m5 0h76" stroke="#63b8e1" />
        <path d="M152 188h53m6 0h93" stroke="#c181dc" />
        <path d="M152 202h90m7 0h47m6 0h42" stroke="#82c6c0" />
        <path d="M152 216h37m7 0h98" stroke="#9badd0" />
        <path d="M142 239h16m5 0h108" stroke="#63b8e1" />
        <path d="M152 253h41m7 0h73" stroke="#c181dc" />
        <path d="M152 267h62m7 0h99m6 0h22" stroke="#82c6c0" />
        <path d="M152 281h39m7 0h71" stroke="#9badd0" />
      </g>
      <g fill="#364e6c" font-size="5" font-family="monospace">
        <text v-for="line in 17" :key="line" x="130" :y="72 + line * 13">{{ line }}</text>
      </g>
      <g opacity=".45" stroke="#476687" stroke-width="2">
        <path d="M408 64h38m-38 5h20m-20 5h34m-34 5h27m-27 5h37m-37 5h14m-14 5h30m-30 5h25m-25 5h37m-37 5h17" />
      </g>
      <rect x="10" y="309" width="456" height="12" fill="#1264a3" />
      <text x="19" y="317" fill="#c5e9ff" font-size="5" font-family="monospace">main</text>
      <text x="396" y="317" fill="#c5e9ff" font-size="5" font-family="monospace">Markdown</text>
      <path d="m0 335-72 84c-4 5 0 11 8 11h579c8 0 12-6 8-11l-47-84H0Z" fill="url(#workspace-keyboard)" stroke="#284461" stroke-width="2" />
      <path d="m23 348-41 53h475l-28-53H23Z" fill="url(#workspace-keys)" stroke="#294965" />
      <path d="m155 408-8 15h145l-5-15H155Z" fill="#0c1e34" stroke="#28455f" />
      <path d="M-60 431h573" stroke="#1a5478" stroke-width="2" />
    </g>
    <path d="M0 566c129-26 362-7 600-32" stroke="#125171" stroke-opacity=".4" />
    <rect x=".5" y=".5" width="599" height="599" stroke="#163143" stroke-opacity=".5" />
  </svg>
</template>
