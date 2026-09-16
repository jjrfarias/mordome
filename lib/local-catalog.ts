import { randomUUID } from "node:crypto";

export type LocalCatalogChannel = "POS" | "FLOOR" | "ONLINE" | "DELIVERY";

export type LocalIngredientOption = { id: string; name: string; priceDelta: number; active: boolean };
export type LocalIngredientGroup = { id: string; productId: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: LocalIngredientOption[] };

export type LocalCatalogProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  channels: LocalCatalogChannel[];
  active: boolean;
  imageUrl: string | null;
  ingredientGroups: LocalIngredientGroup[];
};

type LocalCatalogRecord = Omit<LocalCatalogProduct, "price" | "channels" | "ingredientGroups"> & {
  offerings: Map<string, { price: number; channels: LocalCatalogChannel[] }>;
  ingredientGroups: LocalIngredientGroup[];
};

const defaultEstablishments = ["parque-aeroporto", "anexo", "cavaleiros", "lagomar"];
const catalogProducts: LocalCatalogRecord[] = [
  { id: "p1", name: "X-Burger da Casa", category: "Lanches", active: true, imageUrl: null, offerings: new Map(defaultEstablishments.map(id => [id, { price: 28.9, channels: ["POS", "FLOOR"] }])), ingredientGroups: [] },
  { id: "p2", name: "Batata rústica", category: "Porções", active: true, imageUrl: null, offerings: new Map(defaultEstablishments.map(id => [id, { price: 19.5, channels: ["POS", "FLOOR", "DELIVERY"] }])), ingredientGroups: [] },
  { id: "p3", name: "Coca-Cola", category: "Bebidas", active: true, imageUrl: null, offerings: new Map(defaultEstablishments.map(id => [id, { price: 7, channels: ["POS", "FLOOR", "ONLINE", "DELIVERY"] }])), ingredientGroups: [] },
];

export function listLocalCatalog(establishmentId: string) {
  return catalogProducts.map(product => {
    const offering = product.offerings.get(establishmentId);
    return { id: product.id, name: product.name, category: product.category, active: product.active, imageUrl: product.imageUrl, price: offering?.price ?? 0, channels: [...(offering?.channels ?? [])], ingredientGroups: product.ingredientGroups.map(group => ({ ...group, options: [...group.options] })) };
  });
}

export function createLocalCatalogProduct(establishmentId: string, input: { name: string; category: string; price: number; channels: LocalCatalogChannel[]; imageUrl?: string }) {
  if (catalogProducts.some(product => product.name.toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR"))) return null;
  const product: LocalCatalogRecord = { id: `local-product-${randomUUID()}`, name: input.name, category: input.category, active: true, imageUrl: input.imageUrl ?? null, offerings: new Map([[establishmentId, { price: input.price, channels: [...input.channels] }]]), ingredientGroups: [] };
  catalogProducts.push(product);
  return { id: product.id, name: product.name, category: product.category, active: true, imageUrl: product.imageUrl, price: input.price, channels: [...input.channels], ingredientGroups: [] };
}

export function updateLocalCatalogProduct(establishmentId: string, productId: string, input: { price: number; channels: LocalCatalogChannel[]; imageUrl?: string | null }) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return null;
  product.offerings.set(establishmentId, { price: input.price, channels: [...input.channels] });
  if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl;
  return { id: product.id, name: product.name, category: product.category, active: product.active, imageUrl: product.imageUrl, price: input.price, channels: [...input.channels], ingredientGroups: product.ingredientGroups };
}

export function listLocalIngredientGroups(productId: string) {
  const product = catalogProducts.find(item => item.id === productId);
  return product ? product.ingredientGroups.map(group => ({ ...group, options: [...group.options] })) : null;
}

export function createLocalIngredientGroup(productId: string, input: { name: string; minSelections: number; maxSelections: number }) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return null;
  const group: LocalIngredientGroup = { id: `local-group-${randomUUID()}`, productId, name: input.name, minSelections: input.minSelections, maxSelections: input.maxSelections, active: true, options: [] };
  product.ingredientGroups.push(group);
  return group;
}

export function updateLocalIngredientGroup(productId: string, groupId: string, input: { name: string; minSelections: number; maxSelections: number; active: boolean }) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.ingredientGroups.find(item => item.id === groupId);
  if (!group) return null;
  group.name = input.name; group.minSelections = input.minSelections; group.maxSelections = input.maxSelections; group.active = input.active;
  return { ...group, options: [...group.options] };
}

export function deleteLocalIngredientGroup(productId: string, groupId: string) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return false;
  const index = product.ingredientGroups.findIndex(item => item.id === groupId);
  if (index === -1) return false;
  product.ingredientGroups.splice(index, 1);
  return true;
}

export function createLocalIngredientOption(productId: string, groupId: string, input: { name: string; priceDelta: number }) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.ingredientGroups.find(item => item.id === groupId);
  if (!group) return null;
  const option: LocalIngredientOption = { id: `local-option-${randomUUID()}`, name: input.name, priceDelta: input.priceDelta, active: true };
  group.options.push(option);
  return option;
}

export function updateLocalIngredientOption(productId: string, groupId: string, optionId: string, input: { name: string; priceDelta: number; active: boolean }) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.ingredientGroups.find(item => item.id === groupId);
  const option = group?.options.find(item => item.id === optionId);
  if (!option) return null;
  option.name = input.name; option.priceDelta = input.priceDelta; option.active = input.active;
  return { ...option };
}

export function deleteLocalIngredientOption(productId: string, groupId: string, optionId: string) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.ingredientGroups.find(item => item.id === groupId);
  if (!group) return false;
  const index = group.options.findIndex(item => item.id === optionId);
  if (index === -1) return false;
  group.options.splice(index, 1);
  return true;
}
