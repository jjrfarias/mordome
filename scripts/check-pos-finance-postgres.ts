import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { businessDay, addDays } from "../lib/finance-ledger.ts";

const url = process.env.TEST_DATABASE_URL;
const base = process.env.TEST_APP_URL ?? "http://127.0.0.1:3022";
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use somente aplicação e banco local isolado terminado em _test.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const orgs: string[] = [], users: string[] = [];
const token = randomBytes(32).toString("base64url"), stamp = randomUUID();
const today = businessDay();
async function request(path: string, method = "GET", body?: object, authenticated = true) {
  const response = await fetch(base + path, { method, headers: { Origin: base, "Content-Type": "application/json", ...(authenticated ? { Cookie: `mordome_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
try {
  const organization = await db.organization.create({ data: { name: "Finance QA", slug: `finance-${stamp}` } }); orgs.push(organization.id);
  const otherOrg = await db.organization.create({ data: { name: "Other Finance QA", slug: `finance-other-${stamp}` } }); orgs.push(otherOrg.id);
  const unit = await db.establishment.create({ data: { organizationId: organization.id, name: "Finance QA", slug: `finance-${stamp}` } });
  const otherUnit = await db.establishment.create({ data: { organizationId: otherOrg.id, name: "Other", slug: `other-${stamp}` } });
  const sibling = await db.establishment.create({ data: { organizationId: organization.id, name: "Sibling", slug: `sibling-${stamp}` } });
  const user = await db.user.create({ data: { username: `finance-${stamp}`, name: "Finance QA", passwordHash: "not-a-login-credential" } }); users.push(user.id);
  const permissions = await db.permission.findMany({ where: { key: { in: ["finance.manage", "finance.entries.manage", "finance.cashflow.view", "pos.sell", "pos.cancel_sale", "sale.refund", "reports.dre.view"] } } }); assert.equal(permissions.length, 7);
  const role = await db.customRole.create({ data: { organizationId: organization.id, name: "Finance QA", permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
  await db.organizationMembership.create({ data: { organizationId: organization.id, userId: user.id, status: "ACTIVE", accesses: { create: { establishmentId: unit.id } }, roles: { create: { roleId: role.id } } } });
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000), activeEstablishmentId: unit.id } });

  const bank = await db.bankAccount.create({ data: { establishmentId: unit.id, name: "Recebimentos", bank: "Teste", initialBalance: "0", balanceAsOf: new Date(addDays(today, -365)) } });
  const foreign = await db.bankAccount.create({ data: { establishmentId: otherUnit.id, name: "Other", bank: "Teste" } });
  const siblingBank = await db.bankAccount.create({ data: { establishmentId: sibling.id, name: "Sibling", bank: "Teste" } });
  await db.cashSession.create({ data: { establishmentId: unit.id, openedById: user.id, openingAmount: "0" } });
  const product = await db.product.create({ data: { organizationId: organization.id, name: "Produto teste", slug: stamp, variants: { create: { name: "Padrão", isDefault: true, offerings: { create: { establishmentId: unit.id, channel: "POS", price: "100.00" } } } } } });
  const rule = { method: "CREDIT_CARD", name: "Ton teste", bankAccountId: bank.id, feeRate: "2.99", settlementDays: 30, businessDays: false, holidays: [], active: true };
  assert.equal((await request("/api/admin/finance/pos-integration", "GET", undefined, false)).status, 403);
  for (const id of [foreign.id, siblingBank.id]) assert.equal((await request("/api/admin/finance/pos-integration", "PATCH", { ...rule, bankAccountId: id })).status, 409);
  assert.equal((await request("/api/admin/finance/pos-integration", "PATCH", { ...rule, feeRate: "2.999" })).status, 400);
  assert.equal((await request("/api/admin/finance/pos-integration", "PATCH", rule)).status, 200);
  assert.equal((await request("/api/admin/finance/pos-integration", "PATCH", { ...rule, method: "CASH", feeRate: "0", settlementDays: 0 })).status, 200);
  await assert.rejects(db.posReceiptRule.create({ data: { organizationId: organization.id, establishmentId: unit.id, method: "PIX", name: "Cross tenant", bankAccountId: foreign.id, feeRate: "0", settlementDays: 0 } }));
  const saleInput = { action: "COMPLETE", channel: "POS", items: [{ productId: product.id, quantity: 1 }], payments: [{ method: "Cartão de crédito", amount: 60 }, { method: "Dinheiro", amount: 40, receivedAmount: 50 }], idempotencyKey: randomUUID() };
  const sold = await request("/api/operations/sales", "POST", saleInput); assert.equal(sold.status, 201, JSON.stringify(sold));
  const saleId = sold.data.sale.id;
  const entries = await db.financialEntry.findMany({ where: { sourcePayment: { saleId } }, include: { sourcePayment: true } }); assert.equal(entries.length, 2);
  const card = entries.find(e => e.sourcePayment?.method === "CREDIT_CARD")!, cash = entries.find(e => e.sourcePayment?.method === "CASH")!;
  await assert.rejects(db.financialEntry.update({where:{id:card.id},data:{amount:"999"}}));
  assert.equal(card.amount.toString(), "58.21"); assert.equal(card.feeAmount?.toString(), "1.79"); assert.equal(card.status, "PENDING"); assert.equal(card.dueDate.toISOString().slice(0,10), addDays(today,30));
  assert.equal(cash.amount.toString(), "40"); assert.equal(cash.status, "PAID");
  assert.equal((await request("/api/operations/sales", "POST", saleInput)).status, 200);
  assert.equal(await db.financialEntry.count({ where: { sourcePayment: { saleId } } }), 2);
  const overview = await request("/api/admin/finance/overview?days=60"); assert.equal(overview.data.balanceCents,4000); assert.equal(overview.data.projectedBalanceCents,9821);
  assert.equal((await request("/api/admin/finance/entries", "PATCH", { entryId: card.id, amount: "1000" })).status,409);
  assert.equal((await request("/api/admin/finance/pos-integration", "PATCH", { ...rule, feeRate: "5", settlementDays: 1 })).status,200);
  assert.equal((await db.financialEntry.findUniqueOrThrow({where:{id:card.id}})).feeAmount?.toString(),"1.79");
  const dre = await request(`/api/admin/reports/dre?from=${today}&to=${today}`); assert.equal(dre.status,200); assert.equal(dre.data.otherIncome,0); assert.equal(dre.data.operatingExpenses,1.79);
  const cancelInput = { action: "CANCEL", saleId, reason: "Teste cancelamento", idempotencyKey: randomUUID() };
  assert.equal((await request("/api/operations/sales","POST",cancelInput)).status,200);
  assert.equal((await request("/api/operations/sales","POST",cancelInput)).status,200);
  assert.ok((await db.financialEntry.findUniqueOrThrow({where:{id:card.id}})).voidedAt);
  assert.equal(await db.financialEntry.count({where:{reversalOfId:cash.id}}),1);
  assert.equal((await request("/api/admin/finance/entries","PATCH",{entryId:cash.id,status:"PENDING"})).status,409);
  assert.equal((await request("/api/admin/finance/overview?days=60")).data.projectedBalanceCents,0);
  assert.equal((await request("/api/admin/finance/entries","PATCH",{entryId:card.id,status:"PAID",bankAccountId:bank.id,paidDate:today})).status,409);
  // A new debit sale without a rule is held explicitly; replay is concurrent/idempotent.
  const debitSale = await request("/api/operations/sales","POST",{...saleInput,payments:[{method:"Cartão de débito",amount:100}],idempotencyKey:randomUUID()}); assert.equal(debitSale.status,201,JSON.stringify(debitSale));
  assert.equal((await request("/api/admin/finance/overview")).data.unconfiguredPosPayments,1);
  // Legacy sale is deliberately never pulled in by replay.
  await db.sale.create({data:{organizationId:organization.id,establishmentId:unit.id,operatorId:user.id,channel:"POS",subtotal:"100",total:"100",idempotencyKey:randomUUID(),payments:{create:{method:"DEBIT_CARD",amount:"100"}}}});
  assert.equal((await request("/api/admin/finance/pos-integration","PATCH",{...rule,method:"DEBIT_CARD",feeRate:"1.50",settlementDays:1})).status,200);
  const replays=await Promise.all([request("/api/admin/finance/pos-integration","POST"),request("/api/admin/finance/pos-integration","POST")]); assert.ok(replays.every(r=>r.status===200),JSON.stringify(replays));
  assert.equal(await db.financialEntry.count({where:{sourcePayment:{saleId:debitSale.data.sale.id}}}),1);
  assert.equal((await request("/api/admin/finance/overview")).data.unconfiguredPosPayments,0);
  const debitEntry=await db.financialEntry.findFirstOrThrow({where:{sourcePayment:{saleId:debitSale.data.sale.id}}}); assert.equal(debitEntry.amount.toString(),"98.5");
  const refund={action:"REFUND",saleId:debitSale.data.sale.id,amount:30,payments:[{method:"Cartão de débito",amount:30}],reason:"Devolução teste",idempotencyKey:randomUUID()};
  const refunded=await request("/api/operations/sales","POST",refund); assert.equal(refunded.status,201,JSON.stringify(refunded));
  assert.equal((await request("/api/operations/sales","POST",refund)).status,201);
  const refundEntries=await db.financialEntry.findMany({where:{sourceRefundPayment:{refund:{saleId:debitSale.data.sale.id}}}});assert.equal(refundEntries.length,1);assert.equal(refundEntries[0].amount.toString(),"30");assert.equal(refundEntries[0].status,"PENDING");assert.equal(refundEntries[0].dueDate.toISOString(),debitEntry.dueDate.toISOString());
  const end=await request("/api/admin/finance/overview?days=60");assert.equal(end.data.projectedBalanceCents,6850);
  const fullRefund=await request("/api/operations/sales","POST",{...refund,amount:70,payments:[{method:"Cartão de débito",amount:70}],idempotencyKey:randomUUID()});assert.equal(fullRefund.status,201,JSON.stringify(fullRefund));
  assert.equal((await request("/api/admin/finance/overview?days=60")).data.projectedBalanceCents,-150);
  const fullDre=await request(`/api/admin/reports/dre?from=${today}&to=${today}`);assert.equal(fullDre.data.operatingExpenses,1.5);assert.equal(fullDre.data.otherIncome,0);
  // Cashier may sell but cannot alter settlement rules; foreign sale cannot be reversed.
  assert.equal((await request("/api/operations/sales","POST",{...cancelInput,saleId:"foreign-or-missing"})).status,404);
  await db.rolePermission.deleteMany({where:{roleId:role.id,permission:{key:"finance.manage"}}});
  assert.equal((await request("/api/admin/finance/pos-integration","PATCH",rule)).status,403);
  assert.equal((await request("/api/admin/finance/pos-integration","POST")).status,403);
  assert.ok(await db.auditEvent.count({where:{organizationId:organization.id,entityType:"PosReceiptRule"}}));
  console.log("PASS: venda real PDV, pagamentos divididos/troco, taxas e prazos, saldo/previsão, snapshot, DRE sem duplicidade, cancelamento/estorno, reembolso, replay concorrente, legado preservado e isolamento/autorização.");
} finally {
  const scope={organizationId:{in:orgs}};
  await db.financialEntry.deleteMany({where:{...scope,reversalOfId:{not:null}}});
  await db.financialEntry.deleteMany({where:scope});
  await db.posReceiptRule.deleteMany({where:scope});
  await db.refund.deleteMany({where:{sale:scope}});
  await db.order.deleteMany({where:{tab:{establishment:scope}}});
  await db.tab.deleteMany({where:{establishment:scope}});
  await db.sale.deleteMany({where:scope});
  await db.cashSession.deleteMany({where:{establishment:scope}});
  await db.auditEvent.deleteMany({where:scope});
  await db.organization.deleteMany({where:{id:{in:orgs}}});
  await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
}
