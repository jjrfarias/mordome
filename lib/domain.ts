export type OrderStatus = "Recebido" | "Em preparo" | "Pronto" | "Entregue";
export type TableStatus = "Livre" | "Ocupada" | "Fechamento";

export type IngredientOption = { id: string; name: string; priceDelta: number; active: boolean };
export type IngredientGroup = { id: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: IngredientOption[] };
export type SelectedIngredientOption = { groupName: string; optionName: string; priceDelta: number };
export type Product = { id: string; name: string; category: string; price: number; emoji: string; imageUrl?: string | null; ingredientGroups?: IngredientGroup[] };
export type OrderItem = Product & { quantity: number; note?: string; cartLineId?: string; selectedOptions?: SelectedIngredientOption[]; optionSelections?: { groupId: string; optionIds: string[] }[] };
export type Table = { id: number; seats: number; status: TableStatus; openedAt?: string; items: OrderItem[]; orderStatus?: OrderStatus };
export type Sale = { id: string; table?: number; channel: "Salão" | "PDV"; total: number; payment: string; closedAt: string };
export type RestaurantState = { establishmentId: string; tables: Table[]; sales: Sale[] };

export const products: Product[] = [
  { id: "p1", name: "X-Burger da Casa", category: "Lanches", price: 28.9, emoji: "🍔" },
  { id: "p2", name: "Batata rústica", category: "Porções", price: 19.5, emoji: "🍟" },
  { id: "p3", name: "Pizza Margherita", category: "Pizzas", price: 49.9, emoji: "🍕" },
  { id: "p4", name: "Coca-Cola", category: "Bebidas", price: 7.0, emoji: "🥤" },
  { id: "p5", name: "Suco de laranja", category: "Bebidas", price: 10.0, emoji: "🍊" },
  { id: "p6", name: "Pudim da casa", category: "Sobremesas", price: 14.9, emoji: "🍮" },
];

export function initialState(establishmentId = "demo-bistro"): RestaurantState {
  return { establishmentId, tables: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, seats: i % 3 === 0 ? 6 : 4, status: "Livre" as const, items: [] })), sales: [] };
}

export const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const tableTotal = (table: Table) => table.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export function addProduct(table: Table, product: Product): Table {
  const found = table.items.find((item) => item.id === product.id);
  const items = found ? table.items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...table.items, { ...product, quantity: 1 }];
  return { ...table, status: "Ocupada", openedAt: table.openedAt ?? new Date().toISOString(), items };
}

export function closeTable(state: RestaurantState, tableId: number, payment: string): RestaurantState {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table || table.items.length === 0) return state;
  const sale: Sale = { id: `venda-${Date.now()}`, table: table.id, channel: "Salão", total: tableTotal(table), payment, closedAt: new Date().toISOString() };
  return { ...state, sales: [...state.sales, sale], tables: state.tables.map((item) => item.id === tableId ? { ...item, status: "Livre", items: [], openedAt: undefined, orderStatus: undefined } : item) };
}

export function recordPosSale(state: RestaurantState, items: OrderItem[], payment: string): RestaurantState {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!items.length || total <= 0) return state;
  return { ...state, sales: [...state.sales, { id: `pdv-${Date.now()}`, channel: "PDV", total, payment, closedAt: new Date().toISOString() }] };
}
