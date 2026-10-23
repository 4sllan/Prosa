// context-menu.js — posicionamento de menu de contexto dentro do viewport.
// Funcao pura: dado o ponto do cursor, o tamanho do menu e o viewport,
// retorna a origem (x, y) que mantem o menu visivel com margem minima.
export function menuPosition({ x, y, width, height, viewportW, viewportH, margin = 8 }) {
  const maxX = Math.max(margin, viewportW - width - margin);
  const maxY = Math.max(margin, viewportH - height - margin);
  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY),
  };
}
