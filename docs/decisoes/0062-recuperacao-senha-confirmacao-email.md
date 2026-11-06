# ADR 0062 — Recuperação de senha e confirmação de e-mail

Data: 06/11/2026. Primeira etapa do pacote de segurança, solicitada pelo responsável.

## Contrato e transição

- Login continua por usuário e senha. Contas existentes não recebem e-mails inventados nem são bloqueadas pela migração.
- Todos os usuários operacionais podem acessar `/minha-conta`, sem depender de permissão de administrador. O servidor deriva a identidade da sessão e exige a senha atual para cadastrar, trocar ou reenviar o e-mail.
- O endereço confirmado é único entre contas globais. Endereços são normalizados com trim/lowercase, sem remover pontos ou aliases. Endereço pendente não substitui o confirmado até a prova de posse.
- `/recuperar-senha` só entrega links para contas ativas com e-mail confirmado. Contas inexistentes, inativas, não verificadas e limitadas recebem a mesma resposta. O processamento após a resposta evita usar o tempo de SMTP/consulta da conta como indicador de existência.
- Esta etapa não torna e-mail obrigatório para usar o PDV. Obrigatoriedade para proprietários, convites, MFA, painel de sessões e recuperação de `SystemAdmin` são próximas etapas. Conta de consumidor por WhatsApp permanece separada.

## Controles

- Tokens de 256 bits, apenas SHA-256 no banco, finalidades separadas. Reset: 30 minutos; confirmação: 24 horas. Novo envio invalida o anterior da mesma finalidade.
- Links usam exclusivamente `AUTH_PUBLIC_URL`, nunca Host/Forwarded-Host recebido. Token no fragmento, removido do endereço pelo navegador e enviado apenas no corpo de POST. GET e scanners de e-mail não consomem o link.
- Confirmação exige clique explícito; reset exige nova senha. Páginas sem indexação e com no-referrer. Respostas de API no-store.
- Consumo e emissão serializados por lock da conta no PostgreSQL. O token também é vinculado ao hash da credencial vigente, invalidando-o após alteração administrativa da senha.
- Reset e confirmação/troca de e-mail invalidam todos os links anteriores e revogam todas as sessões da conta. O usuário precisa entrar novamente. Login concorrente confere a credencial sob o mesmo lock antes de criar sessão.
- Rate limit persistente e atômico por origem, identidade e cota global; identificadores armazenados como HMAC com `AUTH_RATE_SECRET`. O IP é apenas defesa adicional, nunca prova de identidade.
- Auditoria de segurança é global por usuário, sem senha, token, endereço de e-mail ou dados do tenant. Não é exposta nas APIs de administração de empresas.
- TLS obrigatório no SMTP, certificados verificados, timeout e logs sem payload. Nenhum envio real ocorre sem configuração do SMTP contratado.

## Operação e limites

Configurar `AUTH_PUBLIC_URL`, `AUTH_RATE_SECRET` (32 caracteres aleatórios ou mais), `SMTP_HOST`, `SMTP_PORT` (465 ou 587), `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` (endereço simples). Usar variáveis secretas, nunca arquivos versionados. Validar remetente, SPF/DKIM/DMARC com o provedor contratado.

SMTP roda via `after` do Next.js. Não é uma fila durável: uma parada do processo pode interromper entrega; o usuário pode solicitar novo envio. Falha de envio invalida o token emitido e registra apenas código de evento. Sucesso na solicitação não garante recebimento. Avisos de troca de senha e troca de endereço são enviados sem links de acesso. Uma fila durável com retentativas é evolução separada.

Tokens são efêmeros: remover expirados/consumidos com mais de 7 dias; remover buckets expirados com mais de 24 horas. Eventos de segurança: retenção operacional inicial de 180 dias, a ser revisada pelo responsável conforme obrigações de retenção. O script de manutenção exige `--execute` para executar; sem isso apenas conta registros elegíveis. Não executar automaticamente contra produção durante desenvolvimento.

Sem SMTP/configuração de rate limit, as mutações devolvem indisponibilidade; nunca retornam links ou tokens ao frontend. Cadastros antigos sem e-mail confirmado continuam dependendo do administrador para recuperar senha.

## Validação e implantação

Executar lint, tipos, testes, build, migrações num PostgreSQL local isolado e `npm run test:account-security:postgres` com `TEST_DATABASE_URL` local terminada em `_test`. Testar UI desktop/mobile, tokens expirados/reutilizados e respostas HTTP sem enumerar contas. SMTP real só pode ser validado depois da configuração e de destinatário de teste autorizado.

Migration aditiva, sem preenchimento retroativo. Rollback de aplicação pode manter as tabelas/colunas; não executar DROP em produção. Seguir revisão/PR antes de deploy.

Regras aplicadas: `AI_RULES/03_SECURITY_STANDARDS.md` (autenticação, segredos, rate limit e migrations), `04_ARCHITECTURE_STANDARDS.md` (transações, testes e revisão) e `05_AI_AGENT_RULES.md` (UI em execução). Referências: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) e [SMTP do Nodemailer](https://nodemailer.com/smtp). Dependências novas: nodemailer (MIT-0) e @types/nodemailer (MIT).

## Evidências locais — 06/11/2026

- 315 testes unitários aprovados; TypeScript, validação Prisma e build de produção aprovados. Lint sem erros (23 avisos existentes).
- As 63 migrações foram aplicadas em PostgreSQL 16 local isolado. Teste específico aprovou consumo concorrente de token, finalidade, prazo, troca de endereço, credencial alterada, conta inativa, unicidade, revogação isolada de sessões e rate limit atômico. Não equivale à validação do PostgreSQL 18 de produção.
- Fluxo HTTP/browser com SMTP TLS local e certificado confiado apenas pelo processo de teste: envio de confirmação, senha atual incorreta, confirmação e reuso, recuperação, confirmação de senha divergente, reset e reuso, login antigo negado/novo aceito, revogação de sessão e rejeição de origens ausentes/externas. Nenhum e-mail real foi enviado.
- UI conferida em 1365x900 e 390x844; sem erro JavaScript ou transbordamento horizontal na tela mobile verificada. Reabertura de link na mesma aba também tratada.
- Next.js/eslint-config-next atualizados para 16.4.5; DOMPurify atualizado no lockfile. Auditoria de dependências de produção após atualização: 0 críticos, 31 altos e 1 moderado. Os alertas remanescentes precisam de triagem própria; esta entrega não representa certificação de segurança completa.
- Produção, SMTP contratado e entrega em caixa postal real permanecem sem alteração/validação nesta etapa.
