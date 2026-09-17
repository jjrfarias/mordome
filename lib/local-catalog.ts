import { randomUUID } from "node:crypto";

export type LocalCatalogChannel = "POS" | "FLOOR" | "ONLINE" | "DELIVERY";

export type LocalIngredientOption = { id: string; name: string; priceDelta: number; active: boolean };
export type LocalIngredientGroup = { id: string; productId: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: LocalIngredientOption[] };

// Combos (ADR 0054) — mesma estrutura de LocalIngredientGroup/LocalIngredientOption, mas cada
// opção guarda o `productId` de outro produto do catálogo em vez de nome/preço livres; nome e
// disponibilidade são resolvidos ao vivo a partir de `catalogProducts` (mesmo critério do modo
// Prisma, que faz join com `Product` em vez de duplicar nome/preço).
export type LocalComboGroupOption = { id: string; productId: string; priceDelta: number; active: boolean };
export type LocalComboGroup = { id: string; productId: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: LocalComboGroupOption[] };

// Dados fiscais (ADR 0049) — sempre opcionais, um produto sem eles funciona normalmente em todas
// as vendas; só passam a ser exigidos no momento de emitir a NFC-e, se o módulo fiscal da unidade
// estiver ativo.
export type LocalProductFiscalInfo = { ncm: string | null; cfop: string | null; icmsCst: string | null; icmsOrigin: string | null; unitOfMeasure: string | null };

export type LocalCatalogProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  channels: LocalCatalogChannel[];
  active: boolean;
  imageUrl: string | null;
  ingredientGroups: LocalIngredientGroup[];
  isCombo: boolean;
} & LocalProductFiscalInfo;

type LocalCatalogRecord = Omit<LocalCatalogProduct, "price" | "channels" | "ingredientGroups"> & {
  offerings: Map<string, { price: number; channels: LocalCatalogChannel[] }>;
  ingredientGroups: LocalIngredientGroup[];
  comboGroups: LocalComboGroup[];
};

const emptyFiscalInfo: LocalProductFiscalInfo = { ncm: null, cfop: null, icmsCst: null, icmsOrigin: null, unitOfMeasure: null };

const defaultEstablishments = ["parque-aeroporto", "anexo", "cavaleiros", "lagomar"];
const catalogProducts: LocalCatalogRecord[] = [
  { id: "p1", name: "X-Burger da Casa", category: "Lanches", active: true, imageUrl: null, isCombo: false, ...emptyFiscalInfo, offerings: new Map(defaultEstablishments.map(id => [id, { price: 28.9, channels: ["POS", "FLOOR"] }])), ingredientGroups: [], comboGroups: [] },
  { id: "p2", name: "Batata rústica", category: "Porções", active: true, imageUrl: null, isCombo: false, ...emptyFiscalInfo, offerings: new Map(defaultEstablishments.map(id => [id, { price: 19.5, channels: ["POS", "FLOOR", "DELIVERY"] }])), ingredientGroups: [], comboGroups: [] },
  { id: "p3", name: "Coca-Cola", category: "Bebidas", active: true, imageUrl: null, isCombo: false, ...emptyFiscalInfo, offerings: new Map(defaultEstablishments.map(id => [id, { price: 7, channels: ["POS", "FLOOR", "ONLINE", "DELIVERY"] }])), ingredientGroups: [], comboGroups: [] },
];

// Combos (ADR 0054): grupos de combo viram "grupos de ingrediente" na hora de servir o catálogo
// para o carrinho — cada opção de combo (que aponta pra outro produto) vira uma opção com o nome e
// disponibilidade resolvidos AO VIVO a partir do produto referenciado, nunca duplicados/congelados
// no cadastro do combo. Isso é o que permite reaproveitar IngredientPicker/resolveIngredientSelections
// sem nenhuma mudança neles.
function deriveIngredientGroups(product: LocalCatalogRecord): LocalIngredientGroup[] {
  if (!product.isCombo) return product.ingredientGroups.map(group => ({ ...group, options: [...group.options] }));
  return product.comboGroups.map(group => ({
    id: group.id, productId: product.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: group.active,
    options: group.options.map(option => {
      const optionProduct = catalogProducts.find(candidate => candidate.id === option.productId);
      return { id: option.id, name: optionProduct?.name ?? "Produto removido", priceDelta: option.priceDelta, active: option.active && Boolean(optionProduct?.active) };
    }),
  }));
}

export function listLocalCatalog(establishmentId: string) {
  return catalogProducts.map(product => {
    const offering = product.offerings.get(establishmentId);
    return { id: product.id, name: product.name, category: product.category, active: product.active, imageUrl: product.imageUrl, isCombo: product.isCombo, ncm: product.ncm, cfop: product.cfop, icmsCst: product.icmsCst, icmsOrigin: product.icmsOrigin, unitOfMeasure: product.unitOfMeasure, price: offering?.price ?? 0, channels: [...(offering?.channels ?? [])], ingredientGroups: deriveIngredientGroups(product) };
  });
}

export function updateLocalCatalogProductFiscalInfo(productId: string, data: Partial<LocalProductFiscalInfo>) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return "NOT_FOUND" as const;
  Object.assign(product, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
  return { id: product.id, ncm: product.ncm, cfop: product.cfop, icmsCst: product.icmsCst, icmsOrigin: product.icmsOrigin, unitOfMeasure: product.unitOfMeasure };
}

export function createLocalCatalogProduct(establishmentId: string, input: { name: string; category: string; price: number; channels: LocalCatalogChannel[]; imageUrl?: string; isCombo?: boolean }) {
  if (catalogProducts.some(product => product.name.toLocaleLowerCase("pt-BR") === input.name.toLocaleLowerCase("pt-BR"))) return null;
  const product: LocalCatalogRecord = { id: `local-product-${randomUUID()}`, name: input.name, category: input.category, active: true, imageUrl: input.imageUrl ?? null, isCombo: input.isCombo ?? false, ...emptyFiscalInfo, offerings: new Map([[establishmentId, { price: input.price, channels: [...input.channels] }]]), ingredientGroups: [], comboGroups: [] };
  catalogProducts.push(product);
  return { id: product.id, name: product.name, category: product.category, active: true, imageUrl: product.imageUrl, isCombo: product.isCombo, ...emptyFiscalInfo, price: input.price, channels: [...input.channels], ingredientGroups: [] };
}

export function updateLocalCatalogProduct(establishmentId: string, productId: string, input: { price: number; channels: LocalCatalogChannel[]; imageUrl?: string | null }) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return null;
  product.offerings.set(establishmentId, { price: input.price, channels: [...input.channels] });
  if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl;
  return { id: product.id, name: product.name, category: product.category, active: product.active, imageUrl: product.imageUrl, isCombo: product.isCombo, ncm: product.ncm, cfop: product.cfop, icmsCst: product.icmsCst, icmsOrigin: product.icmsOrigin, unitOfMeasure: product.unitOfMeasure, price: input.price, channels: [...input.channels], ingredientGroups: deriveIngredientGroups(product) };
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

// Combos (ADR 0054) — CRUD espelhado em createLocalIngredientGroup/Option, ver comentário da
// função deriveIngredientGroups acima sobre por que as opções guardam só o productId.
export function listLocalComboOptionCandidates(excludeProductId: string) {
  return catalogProducts.filter(product => product.active && !product.isCombo && product.id !== excludeProductId).map(product => ({ id: product.id, name: product.name }));
}

function serializeComboGroup(group: LocalComboGroup) {
  return { ...group, options: group.options.map(option => ({ ...option, productName: catalogProducts.find(candidate => candidate.id === option.productId)?.name ?? "Produto removido" })) };
}

export function listLocalComboGroups(productId: string) {
  const product = catalogProducts.find(item => item.id === productId);
  return product ? product.comboGroups.map(serializeComboGroup) : null;
}

export function createLocalComboGroup(productId: string, input: { name: string; minSelections: number; maxSelections: number }) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return null;
  const group: LocalComboGroup = { id: `local-combo-group-${randomUUID()}`, productId, name: input.name, minSelections: input.minSelections, maxSelections: input.maxSelections, active: true, options: [] };
  product.comboGroups.push(group);
  return serializeComboGroup(group);
}

export function updateLocalComboGroup(productId: string, groupId: string, input: { name: string; minSelections: number; maxSelections: number; active: boolean }) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.comboGroups.find(item => item.id === groupId);
  if (!group) return null;
  group.name = input.name; group.minSelections = input.minSelections; group.maxSelections = input.maxSelections; group.active = input.active;
  return serializeComboGroup(group);
}

export function deleteLocalComboGroup(productId: string, groupId: string) {
  const product = catalogProducts.find(item => item.id === productId);
  if (!product) return false;
  const index = product.comboGroups.findIndex(item => item.id === groupId);
  if (index === -1) return false;
  product.comboGroups.splice(index, 1);
  return true;
}

export function createLocalComboGroupOption(productId: string, groupId: string, input: { optionProductId: string; priceDelta: number }) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.comboGroups.find(item => item.id === groupId);
  if (!group) return "GROUP_NOT_FOUND" as const;
  if (!catalogProducts.some(candidate => candidate.id === input.optionProductId && candidate.active && !candidate.isCombo)) return "PRODUCT_NOT_FOUND" as const;
  if (group.options.some(option => option.productId === input.optionProductId)) return "DUPLICATE" as const;
  const option: LocalComboGroupOption = { id: `local-combo-option-${randomUUID()}`, productId: input.optionProductId, priceDelta: input.priceDelta, active: true };
  group.options.push(option);
  return { ...option, productName: catalogProducts.find(candidate => candidate.id === option.productId)?.name ?? "" };
}

export function updateLocalComboGroupOption(productId: string, groupId: string, optionId: string, input: { priceDelta: number; active: boolean }) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.comboGroups.find(item => item.id === groupId);
  const option = group?.options.find(item => item.id === optionId);
  if (!option) return null;
  option.priceDelta = input.priceDelta; option.active = input.active;
  return { ...option, productName: catalogProducts.find(candidate => candidate.id === option.productId)?.name ?? "" };
}

export function deleteLocalComboGroupOption(productId: string, groupId: string, optionId: string) {
  const product = catalogProducts.find(item => item.id === productId);
  const group = product?.comboGroups.find(item => item.id === groupId);
  if (!group) return false;
  const index = group.options.findIndex(item => item.id === optionId);
  if (index === -1) return false;
  group.options.splice(index, 1);
  return true;
}
