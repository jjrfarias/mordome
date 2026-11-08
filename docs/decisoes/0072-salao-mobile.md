# ADR 0072 — Operação do salão no celular

Até 760px, catálogo e comanda ocupam telas alternadas por Produtos/Comanda. Mesa e nome ficam visíveis no cabeçalho; Trocar comanda leva ao seletor existente. O resumo fixo mostra quantidade, total com serviço e pendências de envio sem sobrepor a lista. A comanda tem área de rolagem completa e ação de envio/pagamento acima da navegação inferior.

Busca por nome ou categoria ignora acentos e espaços nas extremidades. O seletor de categoria no celular mostra todas as opções e a quantidade de produtos. Produtos indicam a quantidade já lançada na comanda; botões, campos e controles de quantidade têm tamanho adequado ao toque. Busca vazia tem ação de limpar filtros.

Desktop preserva catálogo e comanda lado a lado. Endpoints, permissões, preço, serviço e fluxo de impressão/pagamento permanecem os mesmos. Validação visual em resoluções móveis e desktop, mais build/lint/tipos e suíte existente.
