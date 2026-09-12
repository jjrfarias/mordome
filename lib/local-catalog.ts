export type LocalCatalogChannel = "POS" | "FLOOR" | "ONLINE" | "DELIVERY";

export type LocalCatalogProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  channels: LocalCatalogChannel[];
  active: boolean;
};

type LocalCatalogRecord = Omit<LocalCatalogProduct, "price" | "channels"> & {
  offerings: Map<string, { price: number; channels: LocalCatalogChannel[] }>;
};

const defaultEstablishments = ["parque-aeroporto", "anexo", "cavaleiros", "lagomar"];
const catalogProducts: LocalCatalogRecord[] = [
  { id: "p1", name: "X-Burger da Casa", category: "Lanches", active: true, offerings: new Map(defaultEstablishments.map(id => [id, { price: 28.9, channels: ["POS", "FLOOR"] }])) },
  { id: "p2", name: "Batata rústica", category: "Porções", active: true, offerings: new Map(defaultEstablishments.map(id => [id, { price: 19.5, channels: ["POS", "FLOOR", "DELIVERY"] }])) },
  { id: "p3", name: "Coca-Cola", category: "Bebidas", active: true, offerings: new Map(defaultEstablishments.map(id => [id, { price: 7, channels: ["POS", "FLOOR", "ONLINE", "DELIVERY"] }])) },
];

export function listLocalCatalog(establishmentId: string) {
  return catalogProducts.map(product => {
    const offering = product.offerings.get(establishmentId);
    return { id: product.id, name: product.name, category: product.category, active: product.active, price: offering?.price ?? 0, channels: [...(offering?.channels ?? [])] };
  });
}

export function createLocalCatalogProduct(establishmentId: string, input: Omit<LocalCatalogProduct, "id" | "active">) {
  if (catalogProducts.some(product => product.name.toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR"))) return null;
  const product: LocalCatalogRecord = { id: `local-product-${randomUUID()}`, name: input.name, category: input.category, active: true, offerings: new Map([[establishmentId, { price: input.price, channels: [...input.channels] }]]) };
  catalogProducts.push(product);
  return { id: product.id, name: product.name, category: product.category, active: true, price: input.price, channels: [...input.channels] };
}

export function updateLocalCatalogProduct(establishmentId: string, productId: string, input: { price: number; channels: LocalCatalogChannel[] }) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return null;
  product.offerings.set(establishmentId, { price: input.price, channels: [...input.channels] });
  return { id: product.id, name: product.name, category: product.category, active: product.active, price: input.price, channels: [...input.channels] };
}
import { randomUUID } from "node:crypto";
