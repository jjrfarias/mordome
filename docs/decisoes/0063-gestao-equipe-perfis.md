# ADR 0063 — Gestão da equipe e perfis

Data: 06/11/2026.

## Problema

A tela exibia simultaneamente cadastro de perfil, todas as permissões de todos os perfis, cadastro de usuário e todos os acessos. Chaves técnicas apareciam sem tradução. O acesso à segurança da conta foi duplicado no cabeçalho e rodapé, e o cadastro de usuário não coletava e-mail.

## Comportamento

- Abas Usuários e Perfis, com busca, situação do usuário, lista resumida e edição de um item por vez. Formulários só aparecem por ação explícita.
- Unidades, perfis, situação e confirmação de e-mail visíveis na listagem. Permissões e exceções avançadas ficam recolhidas.
- Permissões com nomes em português, busca, contagem e seleção por grupo. Perfil Proprietário continua protegido e apenas consultável.
- Um único acesso pessoal, Minha conta, integrado às ações do cabeçalho e disponível no celular com rótulo acessível. Removidos os dois links sem estilo.
- Novo usuário exige e-mail, perfil e unidade no cliente e servidor. O e-mail fica pendente; somente o link de uso único pode confirmá-lo. A solicitação de envio ocorre após a criação, pelo SMTP existente, com limite persistente. Nenhum endereço é marcado como confirmado pelo administrador.
- Dados antigos não são alterados. E-mail da conta existente continua sendo alterado pelo próprio titular em Minha conta, com senha atual. Não há alteração nas permissões concedidas ou no isolamento entre empresas.
- Sem configuração de envio, o cadastro real retorna indisponibilidade antes de criar o usuário. Falha posterior de SMTP é registrada pelo mecanismo da ADR 0062; a conta é criada, com e-mail pendente, e o titular pode solicitar reenvio em Minha conta. Modo local informa explicitamente que não enviou e-mail.

## Validação

Typecheck aprovado; 317 testes aprovados, incluindo cobertura dos nomes de todas as permissões e validação obrigatória de e-mail/perfil/unidade; lint sem erros (23 avisos preexistentes); build e validação Prisma aprovados.

Validação visual e integração do novo cadastro com SMTP ainda pendentes: o ambiente de desenvolvimento sofreu recarregamento contínuo, e duas tentativas de iniciar o servidor local com o build foram bloqueadas pela revisão automática (sem motivo específico fornecido). Não houve alteração em produção. O PR permanece em rascunho até validar cadastro, confirmação, busca, edição, proteção do proprietário, permissões insuficientes, isolamento entre empresas e layout desktop/mobile.

Regras relevantes: segurança e autorização no servidor (`AI_RULES/03_SECURITY_STANDARDS.md`); requisitos e testes de negócio (`04_ARCHITECTURE_STANDARDS.md`); interface em execução (`05_AI_AGENT_RULES.md`). Não há migração de banco nesta alteração.
