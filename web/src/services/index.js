// services/index.js — Service Layer (facade)
// Contrato nomeado consumido pela UI e pelas stores.
// Cada grupo delega ao provider ativo em runtime; a implementação concreta
// "server" vive em providers/server.js e um provider P2P futuro implementará
// a mesma superfície sem alterar os chamadores.
import { getProvider, MODE, setProvider, chosenMode, setMode } from './provider.js';

export { MODE, setProvider, chosenMode, setMode };

// Proxy delega métodos ao provider ativo na hora da chamada, sem
// enumerar a superfície — operações novas não exigem mudança aqui.
const delegate = (group) => new Proxy({}, {
  get: (_, fn) => (...args) => getProvider()[group][fn](...args),
});

export const config = delegate('config');
export const auth = delegate('auth');
export const users = delegate('users');
export const contacts = delegate('contacts');
export const communities = delegate('communities');
export const dms = delegate('dms');
export const messages = delegate('messages');
export const files = delegate('files');
export const misc = delegate('misc');
export const admin = delegate('admin');
export const events = delegate('events');
