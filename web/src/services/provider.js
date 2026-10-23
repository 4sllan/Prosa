// provider.js — seleção e registro do provider ativo do Service Layer.
// Modo único: "p2p". O provider "server" (providers/server.js) permanece
// no código para reativação futura, mas não é instanciado.
import { createP2PProvider } from './providers/p2p.js';

export const MODE = 'p2p';

let provider = null;

export function getProvider() {
  if (!provider) provider = createP2PProvider();
  return provider;
}

export function setProvider(p) { provider = p; }
