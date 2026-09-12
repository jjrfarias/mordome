# ADR 0006 — Catálogo, receitas, estoque e canais

- Status: aprovado; implementação iniciada
- Data: 12/09/2026

## Contexto

O mesmo catálogo deve alimentar PDV, salão, menu online e delivery. Uma venda pode consumir itens de estoque diretamente ou por meio de uma ficha técnica. Também existem materiais controlados apenas por movimentação manual, sem vínculo com vendas.

## Linguagem do domínio

- **Produto de venda:** item apresentado ao cliente ou operador, com nome, categoria, preço, imagem e disponibilidade.
- **Item de estoque:** matéria-prima, bebida, embalagem ou material cuja quantidade física é controlada.
- **Receita/ficha técnica:** composição necessária para produzir uma unidade ou uma porção de um produto de venda.
- **Oferta por unidade:** preço, disponibilidade, horários e canais nos quais o produto é vendido em cada estabelecimento.
- **Movimento de estoque:** entrada, consumo, perda, ajuste, transferência ou estorno. O histórico é imutável.

Produto e receita não são tipos concorrentes. Um produto de venda pode:

1. possuir uma receita com vários itens de estoque;
2. consumir diretamente uma unidade de estoque, como uma lata de refrigerante;
3. não controlar estoque nesta fase, se a política permitir.

Um item de estoque pode existir sem ser vendido ou consumido automaticamente, como material de limpeza com baixa manual.

## Decisão proposta

### Catálogo compartilhado e operação por unidade

O produto pertence à organização para evitar cadastros duplicados. Cada estabelecimento possui uma oferta própria, contendo preço, disponibilidade, canais habilitados e eventuais substituições de receita. Estoque, saldo e movimentos pertencem sempre ao estabelecimento.

Os canais iniciais serão:

- `POS`: venda rápida no balcão;
- `FLOOR`: salão/comanda;
- `ONLINE`: menu público online;
- `DELIVERY`: pedidos para entrega.

O delivery atenderá dois modelos no futuro: operação própria e integrações com plataformas externas. O núcleo de pedidos deverá preservar uma origem extensível (`OWN`, `IFOOD` e outras), o identificador externo e o canal de venda, sem acoplar o catálogo a uma plataforma específica.

Os canais devem ser configurados na oferta do produto, não no item de estoque. O estoque é consumido porque o produto vendido possui uma composição; dessa forma, a mesma receita funciona em qualquer canal habilitado sem regras duplicadas.

### Unidades de medida

Cada item possui uma unidade-base de controle:

- massa: grama (`g`);
- volume: mililitro (`ml`);
- contagem: unidade (`un`).

Entradas podem usar embalagens e unidades de compra com fator de conversão. Exemplo: uma entrada de `1 kg` de milho gera `1.000 g` no saldo. Se a receita de um cachorro-quente simples usar `200 g`, uma venda registra consumo de `200 g` e deixa `800 g` disponíveis.

Conversões só ocorrem dentro da mesma dimensão: kg/g, L/ml e caixa/pacote/unidade quando houver fator de embalagem cadastrado. Não converter massa em volume automaticamente.

### Formas de consumo

- **Por receita:** a venda consome as quantidades de todos os componentes.
- **Direto:** um produto vendido consome uma quantidade do item correspondente, como `1 un` de refrigerante.
- **Manual:** nenhuma venda altera o saldo; baixa, perda ou ajuste exige lançamento explícito.

### Variações e adicionais

Variações podem trocar rendimento, preço e composição. Adicionais também podem acrescentar consumo. Exemplo: “milho extra” adiciona preço e mais `50 g` de milho; “sem milho” remove os `200 g` da composição daquela unidade vendida.

A composição efetiva deve ser registrada como snapshot no pedido. Alterar uma receita amanhã não pode mudar o custo ou o consumo histórico de uma venda de hoje.

### Momento da baixa

Proposta inicial:

- PDV: consumir ao finalizar a venda;
- salão e delivery: consumir quando o item for enviado/confirmado para produção;
- cancelamento antes da produção: gerar movimento inverso;
- cancelamento depois de iniciado o preparo: não devolver automaticamente; exigir decisão entre reaproveitamento e perda.

Nunca apagar movimentos. Correções são novos movimentos inversos com ator, motivo e referência ao movimento original.

### Saldo e disponibilidade

O saldo é calculado pelos movimentos e pode ter uma projeção materializada para leitura rápida. Estoque mínimo gera alerta. A política de permitir ou bloquear venda com saldo insuficiente será configurável por estabelecimento após decisão do responsável pelo produto.

## Estrutura conceitual

```text
Organization
├── CatalogProduct
│   ├── ProductVariant
│   ├── ModifierGroup / ModifierOption
│   └── Recipe
│       └── RecipeComponent → InventoryItem + quantidade-base
└── Establishment
    ├── ProductOffering → preço + canais + disponibilidade
    ├── EstablishmentInventoryItem → política + mínimo
    └── StockMovement → entrada/consumo/perda/ajuste/estorno
```

## Requisitos de integridade

- Nenhuma receita pode referenciar item de outra organização.
- Nenhuma oferta, saldo ou movimento pode atravessar estabelecimentos.
- Quantidades usam `Decimal`, nunca ponto flutuante.
- Alterações de receita, conversão, custo e ajuste de estoque são auditadas.
- Venda e movimentos automáticos de estoque são gravados na mesma transação.
- Repetição da mesma requisição não pode consumir estoque duas vezes.
- Produtos inativos permanecem no histórico e deixam de aparecer nos canais.

## Decisões pendentes antes da implementação

1. **Decidido:** saldo negativo permitido inicialmente, com alerta operacional.
2. **Decidido:** menu online começa como vitrine; recebimento de pedidos fica para etapa posterior.
3. **Decidido:** delivery próprio e plataformas externas. Gestão logística e integrações ficam fora da primeira etapa do Cardápio.
4. **Decidido:** custo médio móvel desde a primeira versão de estoque.
5. **Decidido:** fichas técnicas suportam produção em lote e rendimento desde a fundação.

## Implementação iniciada

- Catálogo organizacional com categoria, produto e variante padrão.
- Oferta por estabelecimento e canal, com preço e disponibilidade próprios.
- Itens de estoque em `g`, `ml` ou `un`, conversões de entrada e política de saldo negativo.
- Movimentos imutáveis com chave de idempotência.
- Receitas de venda e pré-preparo, rendimento, perda técnica e componentes.
- Primeira tela administrativa de Cardápio para produto, categoria, preço e canais.
- Tela de Estoque para cadastro, ativação por unidade e entrada convertida para unidade-base, com custo e idempotência.
- Tela de Fichas técnicas para compor um produto vendido com múltiplos itens, quantidade-base e perda técnica.
- Cardápio, ficha técnica, configuração e saldo são apresentados no contexto explícito da unidade ativa.
- Transferência entre unidades implementada como operação atômica, idempotente e auditada, com bloqueio de saldo insuficiente.
- Ligação do catálogo persistido ao PDV e salão, baixa automática transacional, snapshot e estorno permanecem para a próxima fatia.

## Escopo adiado de delivery

Não implementar nesta fatia:

- integração com APIs de marketplaces;
- aceite e sincronização de pedidos externos;
- áreas, distância e taxa de entrega;
- cadastro e despacho de entregadores;
- roteirização e acompanhamento;
- conciliação de taxas e repasses das plataformas.

O Cardápio implementará apenas a disponibilidade e o preço do produto no canal `DELIVERY`, mantendo o modelo pronto para receber essas capacidades depois.
