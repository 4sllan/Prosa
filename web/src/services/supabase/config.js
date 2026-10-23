// supabase/config.js — resolução da config do hub Supabase.
// Precedência: localStorage 'prosa_supabase' (JSON {url,key}) > VITE_* (build) > desligado.
// Sem url+key o hub fica desligado e o app opera 100% P2P manual — nunca é erro.
// Em runtime (app empacotado), configure pelo console/devtools:
//   localStorage.setItem('prosa_supabase', '{"url":"https://<ref>.supabase.co","key":"sb_publishable_..."}')
// Para desligar: localStorage.removeItem('prosa_supabase')

const LS_KEY = 'prosa_supabase';

export function resolveSupabaseConfig({ storage, env } = {}) {
  storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  env = env ?? import.meta.env ?? {};
  let url = '', key = '';
  try {
    const raw = storage?.getItem(LS_KEY);
    if (raw) ({ url = '', key = '' } = JSON.parse(raw));
  } catch {}
  url ||= env.VITE_SUPABASE_URL || '';
  key ||= env.VITE_SUPABASE_ANON_KEY || '';
  url = String(url).trim().replace(/\/+$/, '');
  key = String(key).trim();
  return { url, key, enabled: !!(url && key) };
}

export function hubEnabled() {
  return resolveSupabaseConfig().enabled;
}
