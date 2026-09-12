# ADR 0005 — Gestão de estabelecimentos (foco nome + status)

- Status: implementado
- Data: 12/09/2026

## Contexto

Próxima fatia da área de `Establishment` já estava priorizada no plano, com foco em nome e status para evitar abrir produto/documento/telefone antes da decisão.

## Decisão

Neste ciclo, a tela de configuração passa a permitir:

- listar estabelecimentos vinculados ao usuário logado dentro da organização ativa;
- criar novo estabelecimento (nome + slug automático);
- editar nome;
- ativar e desativar (sem permitir desativar o último ativo da organização);
- impedir desativar a unidade ativa do operador sem troca prévia;
- registrar auditoria de criação e atualização.
- restringir a gestão à permissão de sistema `establishments.manage`, inicialmente vinculada somente ao perfil **Proprietário**.

## Limitação nesta etapa

- Documento e telefone já existem no modelo, mas não aparecem na UI ainda (decisão de interface adiada).
- O modo local permite testar criação e edição em memória; as alterações são descartadas quando o servidor local reinicia.
- Administradores comuns não recebem `establishments.manage` nesta etapa. A delegação dessa capacidade será tratada junto da gestão de perfis.

## Próximos passos

- Expandir UI para documento/telefone;
- Expandir UI para documento/telefone somente após decisão funcional;
- adicionar testes de integração com PostgreSQL para isolamento entre organizações e concorrência na desativação.
