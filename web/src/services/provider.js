// provider.js — seleção e registro do provider ativo do Service Layer.
// Providers disponíveis: "server" (backend atual) e "p2p" (experimental).
import { createServerProvider } from './providers/server.js';
import { createP2PProvider } from './providers/p2p.js';

const MODE_KEY = 'prosa_mode';
const factories = { server: createServerProvider, p2p: createP2PProvider };

/** Modo efetivamente persistido pelo usuário (null = ainda não escolheu). */
export function chosenMode() { return localStorage.getItem(MODE_KEY); }

/** Modo ativo — escolha persistida ou fallback 'server'. */
export const MODE = chosenMode() || 'server';

/** Persiste a escolha e reinicia o app para aplicá-la. */
export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  location.reload();
}

let provider = null;

export function getProvider() {
  if (!provider) provider = (factories[MODE] || createServerProvider)();
  return provider;
}

export function setProvider(p) { provider = p; }
