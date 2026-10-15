// p2p/syncstore.js — pequenas queries reutilizadas por sync e provider.
import { getLocalStore } from './localstore.js';

export async function maxSeqMap(spaceId) {
  return getLocalStore().maxSeqMap(spaceId);
}
export async function eventsSince(store, spaceId, author, seq) {
  return store.eventsSince(spaceId, author, seq);
}
export async function eventsInSpace(spaceId) {
  return getLocalStore().eventsInSpace(spaceId);
}
