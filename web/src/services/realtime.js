// realtime.js — transporte WS cliente (provider "server")
// Extraído de stores.js: mantém conexão, dispatch e handlers registrados.
// A camada de serviço configura os hooks; nenhum estado de UI vive aqui.

let ws = null;
let wsRetry = 0;
const handlers = {};

// Hooks configurados por configureRealtime()
let dispatchFn = () => {};
let onStateFn = () => {};
let canReconnectFn = () => false;
let getTokenFn = () => '';
let wsBaseFn = () => '';

export function configureRealtime({ dispatch, onStateChange, canReconnect, getToken, wsBase } = {}) {
  if (dispatch) dispatchFn = dispatch;
  if (onStateChange) onStateFn = onStateChange;
  if (canReconnect) canReconnectFn = canReconnect;
  if (getToken) getTokenFn = getToken;
  if (wsBase) wsBaseFn = wsBase;
}

export function onWs(type, fn) { (handlers[type] ||= []).push(fn); }

export function wsSend(t, d) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t, d }));
}

export function connectRealtime() {
  if (!getTokenFn()) return;
  ws = new WebSocket(`${wsBaseFn()}/ws?token=${getTokenFn()}`);
  ws.onopen = () => { wsRetry = 0; onStateFn(true); };
  ws.onclose = () => {
    ws = null;
    onStateFn(false);
    if (canReconnectFn()) setTimeout(connectRealtime, Math.min(15000, 500 * ++wsRetry));
  };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    dispatchFn(m.t, m.d);
    for (const fn of handlers[m.t] || []) fn(m.d);
  };
}

export function closeRealtime() { ws?.close(); }
