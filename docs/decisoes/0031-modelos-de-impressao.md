# ADR 0031: Modelos de impressão

- Estado: aceito
- Data: 2026-09-16

## Contexto

O recibo de venda impresso hoje (`lib/integrations/print-client.ts`, `printReceipt`) é um HTML fixo de 280px (~80mm): nome do estabelecimento, título (canal/mesa), itens, total, forma de pagamento e data/hora. Chamado em `app/page.tsx` (PDV e reimpressão no Resumo) e em `components/operations/FloorManagement.tsx` (fechamento de mesa). O dono quer personalizar a aparência (endereço/telefone no topo, mensagem de despedida no rodapé, CNPJ opcional, largura de papel 58mm/80mm) sem mexer em código — pensando na Família Betão hoje e em clientes futuros do Mordomê amanhã.

Fora de escopo (explicitamente): `printKitchenOrder` e o fluxo de impressão da cozinha — são comandas operacionais internas, não um documento voltado ao cliente, e não fazem parte desta fatia.

## Decisões

1. **Um único template por estabelecimento, não uma lista.** `model PrintTemplate` com `establishmentId @unique`. Diferente de cadastros como `CancellationReason` (múltiplos itens reutilizáveis), aqui não existe "escolher entre vários modelos" — é a aparência única do recibo daquela unidade. Simplifica a UI (não precisa de lista/seleção) e a API (upsert único, sem lista/exclusão).

2. **Quatro campos, todos opcionais/com padrão seguro:** `headerText` (texto livre, ex. endereço/telefone), `footerText` (texto livre, ex. mensagem de despedida), `showDocument` (booleano, default `false` — reaproveita `Establishment.document`, que já existe, sem duplicar o dado), `paperWidth` (`58` ou `80`, default `80`, mapeado para largura em pixels do HTML gerado — hoje fixo em 280px que equivale a 80mm; 58mm vira 200px). Nenhuma lógica de itens/total muda — é personalização puramente visual.

3. **Comportamento padrão idêntico ao recibo atual (zero regressão).** `printReceipt`/`buildReceiptHtml` (`lib/integrations/print-client.ts`) aceitam um parâmetro `template` opcional. Quando omitido, ou quando os campos vêm todos vazios/padrão (o que acontece para toda unidade que nunca configurou nada), a saída é byte a byte a mesma estrutura de antes: 280px, sem parágrafos extra de cabeçalho/rodapé/documento. Testado explicitamente em `tests/print-templates.test.ts`.

4. **Template embutido na sessão, sem chamada de rede extra por impressão.** `printReceipt` é chamado no momento de finalizar uma venda (PDV) ou fechar uma mesa — pontos sensíveis a latência e a falhas de rede intermitentes. Em vez de buscar o template numa rota separada a cada impressão, ele é resolvido uma vez em `getCurrentSession`/`getLocalSession` (mesmo padrão já usado para `printerDriver`) e devolvido como `session.printTemplate` (inclui `establishmentDocument`, lido de `Establishment.document`, para já vir raso e pronto no ponto de impressão). `app/page.tsx` e `FloorManagement.tsx` passam `session.printTemplate` adiante para `printReceipt`. A tela de configuração (`IntegrationsManagement.tsx`) usa uma rota dedicada `GET/PUT /api/admin/print-templates` só quando o dono está de fato editando o template — não no caminho de vendas.

5. **Permissão reaproveitada: `integrations.manage`.** É a mesma permissão que já controla o driver de impressora em `IntegrationsManagement.tsx` — conceitualmente é "configuração de impressão" de ponta a ponta. Evita criar uma permissão nova para uma fatia de escopo pequeno. Sujeito a revisão se o produto quiser separar "aparência do recibo" de "driver da impressora" no futuro.

6. **UI como sub-seção dentro de `IntegrationsManagement.tsx`**, ao lado da configuração de driver de impressora já existente, com formulário dos 4 campos e prévia ao vivo do recibo renderizada num `<iframe>` via `srcDoc` usando a mesma função `buildReceiptHtml` (extraída de `printReceipt`, que agora só orquestra o HTML + o `print()` do navegador). A prévia atualiza a cada tecla digitada, sem precisar imprimir de verdade para ver o resultado.

7. **Migração manual.** Como nas fatias anteriores, a migração `20260924090000_modelos_de_impressao` foi escrita manualmente seguindo o padrão de `20260923090000_turnos`, e deve ser aplicada com `npx prisma migrate deploy` antes de liberar a tela em produção. `npx prisma generate` foi executado com sucesso apontando para o `DATABASE_URL` local.

8. **Modo local segue o adaptador em memória.** `lib/local-print-templates.ts` guarda um único registro por `establishmentId` (get/upsert), no mesmo estilo simples de `lib/local-integrations.ts`. `GET /api/admin/print-templates` em modo local retorna `establishmentDocument: null` (o cadastro local de estabelecimentos não tem campo de documento hoje) — o campo `showDocument` funciona normalmente em produção (Postgres), e em modo local exibe um aviso na UI quando ligado sem documento disponível.

## Consequências

- O recibo pode ganhar identidade visual do cliente (endereço, mensagem de despedida, CNPJ, largura de papel) sem qualquer alteração de código — só preenchendo o formulário em Integrações.
- Nenhuma unidade que não configurar nada sofre qualquer mudança visual no recibo — comportamento padrão testado explicitamente.
- Nenhuma chamada de rede adicional foi introduzida no caminho crítico de finalizar venda/fechar mesa: o template chega junto com a sessão, do mesmo jeito que `printerDriver` já chegava.
- `printKitchenOrder`/comandas de cozinha continuam exatamente como estavam — fora de escopo.
- Se o produto quiser múltiplos modelos por unidade (ex. um para delivery, outro para salão) no futuro, o `@unique([establishmentId])` precisa ser revisto — decisão consciente de manter simples nesta fatia.
