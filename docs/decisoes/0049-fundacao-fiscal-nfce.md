# ADR 0049: Fundação fiscal — emissão de NFC-e

- Estado: aceito
- Data: 2026-09-17

## Contexto

Item 7 da lista de pendências: emissão de nota fiscal (NFC-e). Diferente das fatias anteriores
desta sessão, esta é uma funcionalidade nativa do SaaS (qualquer estabelecimento pode usar), não
uma integração feita sob medida para um cliente específico.

Investigado antes de desenhar: como a Saipos resolve isso (fontes: `saipos.com/fiscal/nf/nfce`,
`meajuda.saipos.com` — Módulo Fiscal, `saipos.com/nota-fiscal/credenciamento-nfc-e`). A Saipos
**não elimina a burocracia fiscal** — ela só dá um lugar para configurar o que já foi resolvido
fora do sistema: Inscrição Estadual (SEFAZ do estado), certificado digital A1 (comprado de uma
Autoridade Certificadora) e CSC — Código de Segurança do Contribuinte (emitido pela SEFAZ). Por
trás, a Saipos fala com a SEFAZ através de algum provedor/gateway fiscal — o lojista nunca vê essa
parte.

## Decisão

**Fundação (v1) implementada nesta fatia**, sem uma emissão real testada de ponta a ponta (sem
credenciais de um provedor fiscal disponíveis no momento desta fatia — ver "Não testado" abaixo).

### Por que Focus NFe, e por que o certificado NUNCA fica no Mordomê

Entre os provedores fiscais pesquisados (Focus NFe, eNotas, PlugNotas), a Focus NFe tem
documentação pública completa e verificável (`doc.focusnfe.com.br`), incluindo um endpoint de
"cadastro de empresas" pensado exatamente para uma plataforma SaaS gerenciar várias contas de
clientes. O modelo adotado:

- **Cada estabelecimento traz sua PRÓPRIA conta na Focus NFe**, com seu próprio certificado A1 e
  CSC configurados diretamente no painel deles — nunca no Mordomê. O Mordomê só guarda o TOKEN de
  API dessa conta (`FiscalConfig.providerApiToken`), que é um credential de portador (revogável a
  qualquer momento pelo estabelecimento), não uma chave privada.
- Essa decisão evita que o Mordomê precise armazenar/manusear um arquivo de certificado digital
  (chave privada com senha) — uma responsabilidade de segurança e conformidade bem maior do que
  guardar um token de API, e que o produto não estava preparado para assumir nesta fatia (não há
  infraestrutura de segredo cifrado em repouso além do hash de senha de login).
- Efeito colateral aceito: o cliente final passa por um cadastro em DOIS lugares (Focus NFe direto,
  e Mordomê) em vez de um só. Uma evolução futura possível é o Mordomê virar revendedor/parceiro da
  Focus NFe e criar a conta da empresa via API em nome do cliente — fora de escopo aqui.

### Contrato de emissão (verificado, não inventado)

O corpo exato enviado ao Focus NFe (`lib/fiscal/payload.ts`, `buildFocusNfcePayload`, função pura)
segue o contrato documentado em `doc.focusnfe.com.br/reference/emitir_nfce` (verificado em
2026-09-17): `POST /v2/nfce?ref={saleId}`, autenticação HTTP Basic (token como usuário, senha em
branco), corpo com `items[]` (NCM, CFOP, CST/CSOSN, origem, unidade, valores) e
`formas_pagamento[]`. NFC-e é processada de forma SÍNCRONA pelo Focus NFe — a própria resposta do
POST já diz se foi autorizada ou rejeitada, sem precisar de webhook/polling, o que simplifica
bastante a integração (não precisa de fila/job assíncrono nesta fatia).

`ref={saleId}` (o próprio `Sale.id`) identifica a emissão de forma idempotente do lado do
provedor — reenviar a mesma `ref` (ex.: ao reemitir depois de um erro) nunca duplica a nota.

Cancelamento (`DELETE /v2/nfce/{ref}`) e sua janela de 30 minutos após a emissão também vêm do
contrato documentado (`doc.focusnfe.com.br/reference/cancelar_nfce`).

**Fora de escopo desta fatia**: inutilização de faixa de numeração (o endpoint específico não foi
encontrado/verificado na documentação pública durante a pesquisa) — item "Inutilização de notas
fiscais" do menu de referência fica pendente para uma fatia futura, quando o contrato for
confirmado diretamente com a Focus NFe.

### Modelo de dados

- `FiscalConfig` (1:1 com `Establishment`): `active`, `provider` (hoje sempre `"FOCUS_NFE"`,
  campo livre para um provedor futuro), `providerApiToken`, `environment`
  (`HOMOLOGACAO`/`PRODUCAO`), `stateRegistration`, `taxRegime`. Opt-in: sem configuração nenhuma,
  a unidade opera exatamente como antes desta fatia — zero mudança de comportamento perceptível.
- `Product.ncm/cfop/icmsCst/icmsOrigin/unitOfMeasure`: direto no modelo (mesmo padrão de
  `imageUrl`, ADR 0032 — não um modelo satélite), todos opcionais. `icmsCst` guarda tanto CST
  (Lucro Presumido/Real) quanto CSOSN (Simples Nacional) — a API usa o mesmo campo
  (`icms_situacao_tributaria`) para os dois, e é o regime tributário do estabelecimento (não do
  produto) que determina qual dos dois códigos é o correto ali.
- `FiscalDocument` (1:1 com `Sale`, `@@unique([saleId])`): histórico da tentativa de emissão mais
  recente daquela venda — `status` (`PENDING`/`AUTHORIZED`/`REJECTED`/`CANCELLED`/`ERROR`),
  `accessKey`/`number`/`series` (só quando autorizada), `statusMessage` (sempre, inclusive erro).

### Emissão: automática, nunca bloqueia a venda

Ao concluir qualquer venda (PDV/Salão/Delivery), se a unidade tiver o módulo fiscal ativo e um
token configurado, a emissão acontece automaticamente logo após a transação da venda ser
confirmada no banco — nunca dentro dela (chamada de rede não pode segurar uma transação Prisma
aberta) e nunca capaz de derrubar a resposta da venda: uma falha na emissão vira um
`FiscalDocument` com `status: ERROR` e uma mensagem clara, reemitível depois pela tela de Notas
fiscais — o caixa sempre consegue cobrar o cliente, problema fiscal vira pendência administrativa,
não trava operação.

Produto sem NCM/CFOP/CST/origem/unidade cadastrados faz a validação (`buildFocusNfcePayload`)
recusar a emissão ANTES de qualquer chamada de rede, com uma mensagem que identifica o produto —
evita gastar uma tentativa de emissão (cobrada pelo provedor) com dado que a SEFAZ rejeitaria de
qualquer forma.

### Modo local: provedor simulado, nunca uma rede real

`lib/fiscal/mock-provider.ts` autoriza instantaneamente (chave de acesso fake, prefixo
"SIMULADO"), sem nenhuma chamada HTTP — mas reaproveita a MESMA validação pura
(`buildFocusNfcePayload`) do provedor real, então um produto sem dados fiscais falha da mesma
forma que falharia de verdade. Isso permite demonstrar o fluxo inteiro (config → produto → venda →
nota emitida → tela de Notas fiscais) sem nenhuma credencial real, mas nunca finge que uma emissão
de verdade aconteceu — a mensagem de status sempre deixa claro "(simulação)".

## Permissão

Uma permissão granular nova, `fiscal.manage`, controlando as três telas novas (Dados fiscais,
Dados fiscais dos produtos, Notas fiscais) — mesmo padrão de módulo simples com uma permissão só
(`catalog.manage`, `customers.manage`).

## Não testado (importante)

Esta fatia foi construída e validada com o **provedor simulado** (mock) — typecheck, lint, testes
automatizados (função pura de payload + provedor simulado) e o fluxo completo pela interface
(configurar → cadastrar NCM num produto → vender → ver a nota "autorizada" na tela). **A chamada
real ao Focus NFe (`lib/fiscal/focus-nfe.ts`) nunca foi exercitada contra a API de verdade** — não
havia uma conta/token de homologação disponível no momento desta fatia. O contrato foi verificado
contra a documentação pública, não contra uma resposta real do servidor. Antes de qualquer unidade
usar isso em produção, é necessário: (1) criar uma conta de teste na Focus NFe, (2) rodar uma
emissão de homologação de ponta a ponta, (3) ajustar o que a documentação não cobriu perfeitamente
(mensagens de erro reais da SEFAZ variam por estado, por exemplo).

## Fora de escopo desta fatia

- Inutilização de faixa de numeração (contrato não verificado).
- Vínculo de NFC-e com PDV/Salão/Delivery além do já existente `Sale` — não há emissão de NF-e
  modelo 55 (B2B/interestadual), só NFC-e (varejo/consumidor final), coerente com o negócio de um
  restaurante/lanchonete.
- Qualquer fluxo de "Mordomê como revendedor Focus NFe" (criar a conta do cliente via API) — cada
  estabelecimento cria a própria conta manualmente por enquanto.
