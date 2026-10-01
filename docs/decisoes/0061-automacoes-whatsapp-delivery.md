# ADR 0061: Automações do WhatsApp para delivery

Estado: implementado localmente; ativação por unidade pendente de pareamento do WhatsApp.

Data: 01/10/2026.

## Decisão

As mensagens automáticas do delivery são configuradas por unidade em Configurações → Integrações → Automações do delivery. A unidade pode ligar ou desligar e editar, com até 500 caracteres, os textos de: pedido recebido, início do preparo, saída para entrega, pedido concluído e convite para criar conta. Os textos aceitam somente `{{nome}}`, `{{pedido}}` e `{{estabelecimento}}`.

Os eventos são disparados no backend depois da mudança de estado confirmada. Assim, o preparo pode começar pela cozinha ou pelo delivery e a conclusão pode ocorrer pelo recebimento da venda sem perder o vínculo. Um registro único por pedido e tipo de evento evita duplicidade em reenvios da requisição. Falha de conexão ou de entrega é registrada sem telefone, mensagem ou credencial nos logs.

As quatro mensagens operacionais começam desligadas. O convite de conta começa ligado, mas só é enviado a pedido online de visitante que marcou, antes de finalizar, o aceite específico para receber no WhatsApp esse convite e futuras informações de programa da loja. O aceite é persistido no pedido; uma conta autenticada nunca recebe o convite. O convite não equivale a inscrição automática em programa de fidelidade.

## Privacidade e operação

O WhatsApp já é a integração escolhida para o login por código no ADR 0060. Esta expansão usa a mesma conexão pareada da unidade, sem nova API externa, credencial ou serviço. Cada consulta e escrita administrativa deriva a unidade da sessão autorizada, exige `integrations.manage` e gera evento de auditoria. Eventos de envio possuem `establishmentId` e referências obrigatórias ao pedido da mesma unidade.

O checkbox de aceite fica desmarcado por padrão, informa a finalidade antes do pedido e o convite pode ser desativado pela unidade. A gestão de preferências e programas de fidelidade propriamente ditos será uma etapa posterior; até ela existir, o texto não deve prometer benefício, prazo ou condição específica.

Baileys continua sendo uma integração não oficial e não garante a entrega. A unidade deve usar número de atendimento e manter a conexão pareada. Antes de ativar mensagens operacionais ou o convite em produção, o responsável deve revisar os textos e testar com telefone autorizado.

Regras corporativas aplicadas: `AI_RULES/02_COMPLIANCE_LEGAL.md` seção 1 (finalidade e consentimento), `03_SECURITY_STANDARDS.md` seções 1, 3 e 6 (autorização por unidade, segredos e logs) e `04_ARCHITECTURE_STANDARDS.md` seções 3, 5 e 7 (isolamento, migration e regra no backend).
