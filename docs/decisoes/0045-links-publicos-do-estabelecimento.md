# ADR 0045: Expor os links públicos do cardápio e do pedido online

- Estado: aceito
- Data: 2026-09-17

## Contexto

Feedback real do cliente: "não conseguimos identificar o link para simular pedidos delivery".
Investigado no código: as duas páginas públicas já existiam e funcionavam
(`/cardapio/[establishmentId]` — cardápio só para visualização; `/pedido-online/[establishmentId]`
— pedido online completo, com carrinho e endereço de entrega), mas **nenhuma tela do admin exibia
essa URL em lugar nenhum** — o dono precisaria montar o link manualmente sabendo o `id` (cuid) do
estabelecimento, algo que não é visível em nenhuma tela.

## Decisão

1. **Botões "Copiar link" na tela Estabelecimentos** (`components/admin/EstablishmentsManagement.tsx`,
   acessada em Configurações → Estabelecimentos), um por unidade, para os dois links (cardápio e
   pedido online) — essa tela já lista todas as unidades da organização, então é o lugar natural
   para expor "o link de cada uma", sem precisar de uma tela nova.
2. **URL montada no navegador** (`window.location.origin + "/" + kind + "/" + establishmentId`),
   nunca no servidor: evita depender de uma variável de ambiente de domínio público (que hoje não
   existe no projeto) e funciona automaticamente em qualquer ambiente (local, preview, produção)
   sem configuração adicional.
3. **`navigator.clipboard.writeText`**, com mensagem de erro contendo o link por extenso se a
   cópia falhar (navegador sem permissão/API indisponível) — nunca falha silenciosamente.
4. Não foi criada nenhuma rota nova nem alterado o esquema de URL (continua usando o `id` bruto do
   estabelecimento, não um slug amigável) — fora de escopo desta fatia, que é só EXPOR o link já
   existente, não redesenhar como ele é formado.

## Consequências

- Zero mudança de backend: nenhuma rota nova, nenhuma migração. É puramente uma tela exibindo uma
  URL que já funcionava.
- Multilojas: cada unidade tem seu próprio par de links, coerente com o cardápio/catálogo já sendo
  por estabelecimento.
