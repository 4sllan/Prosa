// copy-text.js — cópia de texto para a área de transferência.
// Usa navigator.clipboard quando disponível (contexto seguro); senão,
// fallback com textarea temporário + execCommand (Electron/HTTP legado).
export async function copyText(text) {
  const value = String(text ?? '');
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) console.warn('[prosa] cópia via execCommand falhou');
      return ok;
    } catch (e) {
      console.warn('[prosa] não foi possível copiar:', e);
      return false;
    }
  }
}
