# ADR 0064 — Convite com primeira senha

Data: 06/11/2026.

O administrador cadastra nome, usuário, e-mail, unidades e perfis sem conhecer a senha. O servidor ignora qualquer senha fornecida no cadastro, grava um hash de valor aleatório criptográfico e cria a associação como INVITED. O e-mail contém o nome de usuário e um link para aceitar o convite, confirmar o endereço e definir a primeira senha.

ACCEPT_INVITE é uma finalidade independente: token em fragmento, hash no banco, validade de 24 horas, uso único, vínculo à credencial e ao endereço pendente. A transação trava a identidade, exige convite pendente e confirma e-mail, grava senha e ativa a associação atomicamente. Convite suspenso, usado, expirado ou substituído não ativa acesso. Reenvio autorizado por users.invite e limitado por empresa autenticada e rate limit; nova emissão invalida a anterior. Administrador não pode ativar diretamente ou definir senha de convite pendente. Contas já criadas pelo fluxo antigo continuam com confirmação e recuperação existentes.

Migração aditiva amplia o CHECK de finalidade dos tokens, sem modificar dados existentes; é compatível com a versão anterior. Reversão de código pode manter a constraint ampliada.

Validação: testes PostgreSQL de finalidade, renovação, suspensão, concorrência (somente um aceite), senha escolhida, confirmação e ativação; navegador com SMTP TLS local percorreu cadastro sem senha, recebimento, divergência de senhas, aceite, login e recusa de reuso. Interface desktop e mobile inspecionada, sem overflow no celular. Testes unitários e build registrados no PR.

Regras corporativas: 03_SECURITY_STANDARDS — autorização no servidor, isolamento e segredos; 04_ARCHITECTURE_STANDARDS — transação e migração versionada; 05_AI_AGENT_RULES — validar interface em execução. Nenhum cliente real foi criado ou alterado nos testes.
