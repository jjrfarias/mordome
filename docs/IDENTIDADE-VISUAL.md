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

A barra lateral possui três zonas: marca fixa, navegação central rolável e rodapé fixo com unidade ativa e usuário. O menu principal recebe apenas áreas de trabalho de primeiro nível; páginas de estabelecimentos, usuários, perfis e demais cadastros devem ser organizadas dentro de **Configurações**, evitando crescimento indefinido da navegação lateral.

## Diretrizes de produto

- Uma ação primária por região da tela.
- PDV privilegia toque e velocidade; Salão privilegia leitura espacial; KDS privilegia tempo e status.
- Não depender apenas de cor para estado: sempre combinar cor, texto e, quando necessário, ícone.
- Áreas tocáveis mínimas de 40 px em fluxos operacionais.
