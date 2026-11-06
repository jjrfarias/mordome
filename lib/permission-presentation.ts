export const permissionLabels: Record<string, string> = {
  "establishments.manage": "Gerenciar estabelecimentos", "catalog.manage": "Gerenciar cardápio",
  "recipes.manage": "Gerenciar fichas técnicas", "stock.manage": "Gerenciar estoque", "stock.adjust": "Ajustar estoque e registrar perdas",
  "pos.sell": "Vender no PDV", "pos.cancel_sale": "Cancelar vendas concluídas", "sale.refund": "Registrar reembolsos",
  "discount.apply": "Aplicar descontos", "discount.override": "Autorizar descontos acima do limite",
  "floor.operate": "Operar o salão", "floor.manage": "Configurar mesas, áreas e garçons",
  "delivery.operate": "Operar o delivery", "delivery.deliver": "Fazer entregas", "tabs.cancel_item": "Cancelar itens enviados à cozinha",
  "cash.open": "Abrir caixa", "cash.move": "Registrar suprimentos e sangrias", "cash.close": "Fechar caixa", "cash.history.view": "Consultar histórico de caixa",
  "audit.view": "Consultar histórico de auditoria", "finance.summary.view": "Consultar resumo financeiro",
  "finance.manage": "Configurar o financeiro", "finance.entries.manage": "Gerenciar lançamentos financeiros", "finance.cashflow.view": "Consultar fluxo de caixa",
  "settlements.manage": "Gerenciar acertos de garçons e entregadores", "users.view": "Consultar usuários e acessos", "users.invite": "Cadastrar usuários",
  "users.disable": "Suspender e reativar usuários", "users.password.reset": "Redefinir senhas de usuários", "roles.manage": "Criar e editar perfis",
  "integrations.manage": "Configurar integrações", "print.reprint": "Reimprimir pedidos e comprovantes", "customers.manage": "Gerenciar clientes", "fiscal.manage": "Gerenciar notas e configurações fiscais",
  "reports.sales_by_period.view": "Vendas por período", "reports.revenue_by_day.view": "Faturamento por dia", "reports.performance_by_staff.view": "Desempenho da equipe",
  "reports.payment_methods.view": "Vendas por forma de pagamento", "reports.sales_by_delivery_area.view": "Vendas por área de entrega", "reports.items_sold.view": "Itens vendidos",
  "reports.items_consumed.view": "Itens consumidos", "reports.production_time.view": "Tempo de produção", "reports.time_by_status.view": "Tempo por etapa do pedido",
  "reports.dre.view": "Demonstrativo de resultado (DRE)", "reports.coupons_generated.view": "Cupons gerados",
  "dashboards.sales_tracking.view": "Acompanhar vendas", "dashboards.multi_store_tracking.view": "Comparar vendas entre unidades",
  "dashboards.channels.view": "Vendas por canal", "dashboards.sales_by_hour.view": "Vendas por horário",
};
export const moduleLabels: Record<string, string> = {
  establishments: "Estabelecimentos", catalog: "Cardápio", recipes: "Fichas técnicas", stock: "Estoque", pos: "PDV", sale: "Reembolsos", discount: "Descontos",
  floor: "Salão", tabs: "Comandas", delivery: "Delivery", cash: "Caixa", finance: "Financeiro", settlements: "Acertos da equipe", audit: "Auditoria",
  users: "Usuários", roles: "Perfis de acesso", integrations: "Integrações", print: "Impressão", customers: "Clientes", fiscal: "Fiscal", reports: "Relatórios", dashboards: "Indicadores",
};
export type PresentedPermission = { key: string; module: string; description: string };
export function permissionLabel(permission: PresentedPermission) {
  return permissionLabels[permission.key] ?? (permission.description !== permission.key ? permission.description : "Permissão adicional");
}
export function permissionModule(permission: PresentedPermission) {
  return moduleLabels[permission.key.split(".")[0]] ?? "Outros acessos";
}
