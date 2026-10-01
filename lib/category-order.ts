// Ordem das categorias no cardápio/vitrine (ADR 0058). Regras puras compartilhadas pelo modo Prisma,
// pelo modo local e pela tela de configuração.

export function moveItem<T>(items: T[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// A nova ordem precisa conter exatamente as categorias existentes, sem repetição — evita que uma
// requisição parcial ou de outra organização reordene (ou "esconda") categorias.
export function isCompleteOrder(order: string[], existing: string[]) {
  if (order.length !== existing.length || new Set(order).size !== order.length) return false;
  const known = new Set(existing);
  return order.every(id => known.has(id));
}

// Ordena itens pela posição da categoria; categorias desconhecidas vão para o fim, mantendo a ordem
// original entre si (sort estável).
export function sortByCategoryOrder<T>(items: T[], categoryOf: (item: T) => string, order: string[]) {
  const rank = new Map(order.map((category, index) => [category, index]));
  return [...items].sort((a, b) => (rank.get(categoryOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(categoryOf(b)) ?? Number.MAX_SAFE_INTEGER));
}
