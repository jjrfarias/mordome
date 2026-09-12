# Identidade visual do Mordomê

## Conceito

**Hospitalidade sob controle.** O sistema combina a precisão de uma ferramenta operacional com o calor de um estabelecimento brasileiro. A interface evita o azul corporativo, excesso de gradientes e cartões indistintos comuns em painéis genéricos.

## Assinatura

A marca provisória usa um monograma “M” editorial envolvido por um arco. O arco combina três referências: porta aberta, bandeja e mesa vista de frente. Uma base dourada sustenta o monograma e o pequeno ponto terracota representa um pedido concluído. “by JCS” permanece apenas em contextos institucionais.

## Fundamentos

- Verde garrafa `#163c32`: confiança, operação e foco.
- Areia `#f3f0e8`: fundo acolhedor, reduz fadiga em turnos longos.
- Terracota `#d86f45`: ação, atenção e calor sem aparência de alerta permanente.
- Tinta `#20231f`: texto principal; cinzas esverdeados para hierarquia secundária.
- Fraunces/serif editorial em títulos e marca; DM Sans em controles e dados.
- Bordas finas, cantos entre 10 e 18 px e sombras baixas. Elevação indica interação, não decoração.
- Números operacionais usam maior peso e contraste; rótulos são curtos e discretos.

## Componentes persistentes

`components/ui.tsx` concentra marca, item de navegação, KPI e métrica. Estados compartilhados (`active`, `disabled`, `hover`, vazio e sucesso) usam tokens globais de `app/globals.css`. Novos módulos devem reutilizar esses componentes e tokens antes de criar variantes locais.

Elementos de formulário nativos (`<select>`) têm estilo global em `app/globals.css` (regra base `select{...}` logo após o reset, com o comentário que explica a regra) — todo `<select>` do sistema nasce com borda, raio de 9px, fundo creme e foco dourado automaticamente, sem precisar de uma classe ou wrapper específico. Um componente novo nunca deve redefinir `border`/`border-radius`/`background` de um select; se precisar de um tamanho diferente, sobrescreva só `width`/`min-height`/`padding` com um seletor mais específico. Esse é o padrão a seguir para qualquer elemento nativo repetido pelo sistema (select, e no futuro outros): estilizar uma vez na base global em vez de depender de cada tela lembrar de aplicar a classe certa — foi assim que a fila de preparo (`Configurações → Filas de preparo`) escapou do padrão visual até ser corrigida.

A barra lateral possui três zonas: marca fixa, navegação central rolável e rodapé fixo com unidade ativa e usuário. O menu principal recebe apenas áreas de trabalho de primeiro nível; páginas de estabelecimentos, usuários, perfis e demais cadastros devem ser organizadas dentro de **Configurações**, evitando crescimento indefinido da navegação lateral.

## Diretrizes de produto

- Uma ação primária por região da tela.
- PDV privilegia toque e velocidade; Salão privilegia leitura espacial; KDS privilegia tempo e status.
- Não depender apenas de cor para estado: sempre combinar cor, texto e, quando necessário, ícone.
- Áreas tocáveis mínimas de 40 px em fluxos operacionais.
