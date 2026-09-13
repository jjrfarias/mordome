# Roteiros dos vídeos de apresentação

> Produção concluída em 12 de setembro de 2026. Os vídeos finais e seus materiais editáveis estão em `artifacts/videos/`. Consulte `artifacts/videos/README.md` para formatos, estrutura e comandos de reprodução.

## Objetivo

Produzir duas peças independentes:

1. **Mordomê — visão completa do SaaS:** vídeo institucional genérico com até 3 minutos.
2. **Mordomê para Família Betão:** vídeo personalizado com até 1 minuto.

Os vídeos apresentam a visão completa do produto, inclusive funcionalidades planejadas. Recursos que ainda não estiverem disponíveis no sistema deverão ser representados por mockups coerentes com a interface e identificados discretamente como **“Visão completa da plataforma”**. Essa indicação evita confundir apresentação conceitual com disponibilidade comercial imediata.

## Regra de identidade visual

### Vídeo Mordomê SaaS

- Usar exclusivamente a identidade visual padrão do Mordomê.
- Paleta: verde-garrafa `#163c32`, areia `#f3f0e8`, terracota `#d86f45` e tinta `#20231f`.
- Títulos com caráter editorial e controles objetivos, conforme `IDENTIDADE-VISUAL.md`.
- Não usar cores, logo, fotografias ou linguagem da Família Betão.
- O vídeo deve parecer aplicável a bares, lanchonetes e restaurantes de diferentes perfis.

### Vídeo Família Betão

- Usar a personalização criada na branch `cliente/betao`.
- Paleta predominante: vermelho, creme e dourado.
- Usar a assinatura **“Mordomê para Família Betão”**.
- Usar provisoriamente `public/clientes/betao/logo-recriada-v1.png` e `public/clientes/betao/simbolo-compacto-v1.png` até a marca fornecer os arquivos oficiais.
- Destacar hot dogs, bebidas, porções, balcão, salão, cozinha e crescimento entre unidades.
- O Mordomê continua sendo o produto; Betão é a operação personalizada do cliente.

## Vídeo 1 — Mordomê: visão completa do SaaS

**Duração-alvo:** 2min50s a 3min.

**Conceito:** Da venda à gestão, tudo conectado.

**Tom:** profissional, próximo, seguro e objetivo.

| Tempo | Imagem e ação | Locução |
| --- | --- | --- |
| 0:00–0:15 | Logo Mordomê. Cortes rápidos entre balcão, salão, cozinha, delivery e gestão. | “Um restaurante funciona em muitos lugares ao mesmo tempo. No balcão, nas mesas, na cozinha, no delivery e na administração. O Mordomê conecta tudo em uma única plataforma.” |
| 0:15–0:32 | Contratação, convite de primeiro acesso e configuração guiada. | “Após a contratação, o proprietário recebe seu acesso, configura a empresa, cria as unidades e prepara a operação de forma simples e guiada.” |
| 0:32–0:48 | Seletor de unidades e visão consolidada. | “Cada cliente pode administrar vários estabelecimentos, com cardápios, preços, estoques, caixas, equipes e resultados separados por unidade.” |
| 0:48–1:05 | Venda completa no PDV. | “No PDV, a venda acontece em poucos toques. Produtos, adicionais, observações, descontos autorizados, identificação do cliente e diferentes formas de pagamento.” |
| 1:05–1:22 | Mapa do salão, abertura de comanda e fechamento da conta. | “No salão, as mesas são organizadas por área e responsável. O atendente abre comandas, lança pedidos, acompanha rodadas, transfere mesas e divide ou fecha a conta.” |
| 1:22–1:38 | Pedido separado entre praças e impressão. | “Os pedidos seguem automaticamente para cada praça de preparo. A cozinha acompanha prioridades e etapas, enquanto impressoras locais recebem comandas e comprovantes.” |
| 1:38–1:55 | Cardápio público, retirada, delivery próprio e integrações externas. | “O mesmo catálogo alimenta o cardápio digital, pedidos para retirada, delivery próprio e integrações com plataformas externas, sem duplicar cadastros.” |
| 1:55–2:12 | Ficha técnica e baixa de ingredientes. | “Cada venda pode consumir automaticamente ingredientes, bebidas e embalagens. Fichas técnicas controlam quantidades, rendimento, perdas, custos e produção em lote.” |
| 2:12–2:27 | Entrada, inventário, alerta e transferência entre unidades. | “Entradas, inventários, estoque mínimo e transferências entre unidades mantêm a operação abastecida e totalmente rastreável.” |
| 2:27–2:40 | Caixa, pagamentos, fiscal e conciliação. | “Caixa, Pix, cartões, TEF, emissão fiscal, sangrias, suprimentos, reembolsos e conciliação financeira trabalham de forma integrada.” |
| 2:40–2:53 | Queda de internet; operação local continua; sincronização retorna. | “E se a internet cair? Com o modo Nuvem mais Local, o PDV, o salão, a cozinha, o caixa e a impressão continuam funcionando pela rede interna. Quando a conexão volta, tudo é sincronizado automaticamente.” |
| 2:53–3:00 | Painel, auditoria e encerramento na marca. | “Controle para quem administra. Agilidade para quem atende. Online ou offline. Mordomê. Toda a operação em um só lugar.” |

### Textos curtos na tela

- Uma empresa. Quantas unidades precisar.
- PDV rápido e completo.
- Salão conectado à cozinha.
- Um cardápio para todos os canais.
- Venda realizada. Estoque atualizado.
- Acessos sob medida.
- Histórico de cada ação.
- **A internet caiu. Sua operação, não.**
- Mordomê — Toda a operação em um só lugar.

## Cena obrigatória de continuidade offline

A demonstração deve respeitar a arquitetura decidida no ADR 0008:

1. O indicador de conexão muda para **“Internet indisponível”**.
2. O sistema mostra **“Operação local ativa”**.
3. PDV, salão, cozinha, caixa e impressão continuam funcionando pela rede interna.
4. A interface mostra operações aguardando envio, por exemplo: **“12 operações aguardando sincronização”**.
5. A internet retorna e o estado muda para **“Sincronizando”**.
6. O encerramento mostra **“Tudo sincronizado”**.

Os três estados visuais são:

- **Online:** unidade e nuvem sincronizadas.
- **Operação local:** unidade funcionando sem internet externa.
- **Sincronizando:** conexão restabelecida e operações sendo confirmadas na nuvem.

O modo offline é opcional e depende da instalação do servidor local na unidade. Não representar escrita simultânea independente em dois servidores, pois isso contrariaria a estratégia contra conflitos e `split-brain` registrada no ADR 0008.

## Vídeo 2 — Mordomê para Família Betão

**Duração-alvo:** 55 a 60 segundos.

**Conceito:** A tradição do Betão preparada para crescer.

| Tempo | Imagem e ação | Locução |
| --- | --- | --- |
| 0:00–0:08 | Logo Betão combinado à assinatura Mordomê. | “Uma história construída em família merece uma operação preparada para continuar crescendo.” |
| 0:08–0:17 | Entrada personalizada em vermelho, creme e dourado. | “Por isso, o Mordomê ganhou uma experiência exclusiva para a Família Betão, com identidade, cores e linguagem próprias.” |
| 0:17–0:28 | Venda de hot dogs, bebidas, porções e adicionais no PDV. | “No balcão, hot dogs, bebidas, porções e adicionais ficam prontos para uma venda rápida, organizada e segura.” |
| 0:28–0:39 | Mesa, atendente e pedido seguindo para Lanches, Bebidas e Porções. | “No salão, cada pedido conecta mesa, atendente e cozinha, seguindo diretamente para a praça responsável.” |
| 0:39–0:49 | Cardápio, retirada, delivery e troca de unidade. | “O mesmo cardápio atende balcão, mesas, retirada, delivery próprio e plataformas externas em todas as unidades.” |
| 0:49–0:56 | Queda da internet; atendimento continua e sincroniza depois. | “Mesmo sem internet, a Família Betão continua vendendo e atendendo. Quando a conexão volta, o Mordomê sincroniza tudo.” |
| 0:56–1:00 | Logo e assinatura final. | “Mordomê para Família Betão. Tradição para servir. Tecnologia para crescer.” |

### Tela final personalizada

> **Mordomê para Família Betão**  
> Tradição para servir. Tecnologia para crescer.

### Alternativa de encerramento com offline

> **Mordomê para Família Betão**  
> Tradição para servir. Tecnologia para crescer — mesmo sem internet.

## Diretrizes de produção

- Priorizar capturas reais do produto nas funcionalidades existentes.
- Criar mockups apenas para funcionalidades futuras, mantendo o mesmo sistema de cores, tipografia, espaçamento e componentes.
- Não misturar a paleta padrão do SaaS com a personalização Betão.
- Não exibir senhas, tokens, documentos, telefones ou dados pessoais reais.
- Usar dados demonstrativos coerentes e marcar operações de gravação como demonstração.
- Evitar transições genéricas, excesso de brilho, hologramas e estética artificial de vídeo de tecnologia.
- Usar movimentos de câmera discretos, aproximações sobre ações importantes e cortes guiados pelo fluxo operacional.
- A trilha não deve competir com a locução; efeitos sonoros podem reforçar venda concluída, pedido recebido e sincronização restaurada.

## Funcionalidades representadas na visão completa

- Contratação e primeiro acesso SaaS.
- Multiempresa e multiunidade.
- PDV, descontos, troco e pagamento dividido.
- Salão, áreas, mesas, comandas e responsáveis.
- Cozinha, praças, etapas e impressão.
- Cardápio digital, retirada, delivery próprio e plataformas externas.
- Produtos, adicionais e preços por canal/unidade.
- Estoque, fichas técnicas, produção, custos e transferências.
- Caixa, reembolso, fiscal, TEF e conciliação.
- Usuários, perfis e permissões personalizadas.
- Indicadores, visão consolidada e auditoria completa.
- Operação opcional Nuvem + Local com continuidade offline e sincronização posterior.
