# Briefing inicial — Betão Hot Dog

- Branch: `cliente/betao`
- Coleta inicial: 12/09/2026
- Fonte principal: <https://linktr.ee/betaohotdog.oficial>

## Informações confirmadas pela marca

- Nome público: **Betão Hot Dog**.
- Posicionamento publicado: **“+ de 25 anos fazendo o melhor Hot Dog da região!”**.
- A marca usa a expressão **“Família Betão”** para apresentar suas lojas.
- Operação com delivery e retirada.
- Canais de pedido divulgados: delivery próprio para Parque Aeroporto e iFood para Parque Aeroporto/Anexo, Cavaleiros e Costa Azul.

## Unidades divulgadas

| Unidade | Endereço público |
| --- | --- |
| Dog do Betão — Parque Aeroporto | R. Tancredo Neves, 701 — Parque Aeroporto, Macaé/RJ |
| Betão Hot Dog — Anexo | R. Silas Fontes Caetano, 67 — Parque Aeroporto, Macaé/RJ |
| Betão Hot Dog — Cavaleiros | R. Lindolfo Color, 79 — Cavaleiros, Macaé/RJ |
| Dog do Betão — Lagomar | Av. dos Bandeirantes, 4 — Lagomar, Macaé/RJ |

## Direção inicial para o sistema

- O cliente deve nascer como uma organização com múltiplos estabelecimentos, não como uma instalação de unidade única.
- O seletor de estabelecimento deve ser visível e rápido para usuários com acesso a mais de uma loja.
- **Implementado na branch:** seletor persistente em card no menu lateral, validação de acesso no servidor e estado local separado por unidade.
- PDV simples, retirada e delivery são fluxos centrais; salão pode variar por unidade.
- A visão consolidada da organização precisa conviver com a operação individual de cada loja.
- A nomenclatura da interface pode adotar “Família Betão” em pontos institucionais sem substituir a marca do produto Mordomê.

## Identidade visual observada, ainda não aprovada

- Fotografias públicas mostram uso marcante de amarelo na fachada do Anexo.
- O segmento e a comunicação têm caráter popular, direto, familiar e energético.
- Não foi possível obter do Linktree um arquivo confiável do logotipo em resolução adequada.
- Uma recriação raster provisória baseada na referência fornecida foi salva em `public/clientes/betao/logo-recriada-v1.png`. Ela precisa de aprovação do cliente e não substitui o arquivo oficial da marca.
- O símbolo compacto sem texto está em `public/clientes/betao/simbolo-compacto-v1.png` e foi aplicado provisoriamente ao cabeçalho de marca, favicon e tema da branch.

Não criar uma identidade definitiva apenas a partir das fotografias públicas. Solicitar logo oficial, paleta ou materiais de cardápio antes de alterar marca, ícones e cores estruturais do sistema.

## Vídeo personalizado

O roteiro institucional específico está em `docs/ROTEIROS-VIDEOS.md`. O vídeo **Mordomê para Família Betão** deve usar somente a personalização vermelha, creme e dourada desta branch. O vídeo genérico do SaaS deve permanecer na identidade visual padrão verde, areia e terracota do Mordomê, sem elementos da marca Betão.

A apresentação personalizada inclui PDV, salão, cozinha, unidades, canais de venda e a mensagem de continuidade **“A internet caiu. Sua operação, não.”**. Funcionalidades ainda planejadas são apresentadas como visão completa por meio de mockups consistentes com o produto.

## Dados que precisam de confirmação do cliente

- Nome jurídico e documentos de cada unidade.
- Quais das quatro unidades estão ativas e participarão da implantação inicial.
- Endereços completos e telefones/WhatsApp oficiais.
- Horários atuais por unidade.
- Logo em SVG, PDF ou PNG de alta resolução e paleta oficial.
- Unidade piloto e usuários iniciais.
- Operação de cada loja: balcão, mesas, retirada, delivery próprio e iFood.
- Se Costa Azul é uma unidade da mesma organização ou apenas um canal/parceiro.

## Fontes auxiliares

- Linktree de localização: <https://linktr.ee/betaohotdogoficial.localizacao>
- Linktree de entregas: <https://linktr.ee/Betaohotdog.entregas>

Diretórios e páginas de avaliações foram usados somente para confronto preliminar. Horários, telefones, avaliações e dados cadastrais encontrados fora dos canais da marca não são considerados confirmados.
