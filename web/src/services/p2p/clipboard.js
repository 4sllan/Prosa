export async function writeClipboardText(text, getClipboard = () => globalThis.navigator?.clipboard) {
  const api = getClipboard();
  if (typeof api?.writeText !== 'function') throw new Error('Clipboard indisponivel');
  await api.writeText(text);
}
