# ADR 0004 — Ativação por convite após licenciamento

- Status: decidido; implementação adiada
- Data: 12/09/2026

## Contexto

O Mordomê será oferecido como SaaS. Permitir que qualquer visitante do domínio público crie a primeira organização não representa o fluxo comercial desejado.

## Decisão

Após a compra da licença, a plataforma criará o cliente e enviará um link de ativação para o e-mail informado na contratação. Esse link será temporário, de uso único e associado à organização licenciada. Na ativação, o proprietário definirá seu nome de usuário e senha.

O e-mail será usado para compra, convite e recuperação de acesso; o login cotidiano continuará sendo feito por **usuário e senha**, conforme solicitado.

## Estado transitório

A automação comercial do SaaS será construída posteriormente. O primeiro cliente, Betão, será trabalhado isoladamente na branch `cliente/betao`. O fluxo aberto de configuração inicial existente é provisório e não deve ser considerado o onboarding definitivo.

Antes de uso público real, o endpoint de configuração inicial deverá ser substituído ou protegido por convite emitido pelo servidor. A personalização do cliente não deve ser incorporada à linha principal sem avaliação explícita do que é reutilizável no produto.

## Consequências

- Compra e provisionamento ficam separados da autenticação diária.
- Links de ativação não armazenam tokens em texto puro e expiram após uso ou prazo definido.
- Cada ativação deve gerar auditoria e impedir reutilização.
- Customizações exclusivas permanecem em branches de cliente até decisão de produto.
