// datetime.js — formatação de data/hora de mensagens (fuso local do usuário).
// Aceita epoch ms (number), string ISO/numérica ou Date. Retorna '' para
// valores ausentes ou inválidos — a UI nunca deve renderizar "Invalid Date".
export function messageTime(ts, locale = 'pt-BR') {
  if (ts == null || ts === '') return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}
