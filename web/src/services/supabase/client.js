// supabase/client.js — client Supabase (publishable key) para o hub de rendezvous.
// Hub ausente ou indisponível retorna null — nunca lança; o app continua P2P manual.
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './config.js';

let hub = null; // { cfg, client } | null

export function getSupabase() {
  if (hub) return hub.client;
  const cfg = resolveSupabaseConfig();
  if (!cfg.enabled) return null;
  try {
    hub = {
      cfg,
      client: createClient(cfg.url, cfg.key, {
        // sem Supabase Auth nesta etapa: sem sessão persistida nem refresh
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
    return hub.client;
  } catch {
    return null;
  }
}

// testes e troca de config em runtime
export function resetSupabase() { hub = null; }
