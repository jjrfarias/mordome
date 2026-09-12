# ADR 0008 — Mordomê Continuidade local e nuvem

## Status

Proposto para amadurecimento. Não implementar nem tratar como arquitetura definitiva sem nova validação.

## Motivação

O Mordomê atende operações que não podem parar apenas porque o acesso à internet ou o provedor de nuvem ficou indisponível. Ao mesmo tempo, nem todos os clientes precisam ou desejam manter infraestrutura local. O recurso deve ser opcional e configurável por estabelecimento.

## Experiência pretendida

Cada estabelecimento poderá operar em um dos modos:

- **Somente nuvem:** terminais acessam diretamente o Mordomê Cloud.
- **Nuvem + local:** os terminais operam contra um servidor na rede do estabelecimento, que sincroniza continuamente com a nuvem.

Uma organização poderá combinar modos diferentes em suas unidades. A contratação ou ativação local não será obrigatória para todas elas.

## Comportamento esperado

### Internet e nuvem disponíveis

1. A operação é confirmada primeiro no servidor local.
2. O servidor local envia o evento imediatamente para a nuvem.
3. O painel remoto do administrador recebe a atualização em poucos segundos, preferencialmente por canal em tempo real.
4. O evento guarda tanto o horário em que ocorreu na unidade quanto o horário em que foi recebido pela nuvem.

### Internet ou nuvem indisponível

1. PDV, caixa, salão, comandas, cozinha, impressão local, estoque e auditoria continuam funcionando na rede interna.
2. As operações ficam em uma fila local durável e ordenada.
3. O painel remoto mostra que a unidade está offline e que os dados podem estar desatualizados desde a última comunicação.
4. A nuvem não deve inventar quantidade de pendências enquanto não conseguir contato com a unidade.
5. Quando a conexão retornar, os eventos são enviados automaticamente, sem duplicação e preservando ator e horário original.

### Servidor local indisponível

Não permitir failover automático de escrita para a nuvem enquanto outros terminais puderem continuar usando uma cópia local. Isso criaria duas fontes de verdade. O failover deverá ser explícito, guiado e auditado, depois de verificar a situação da fila local.

## Princípios preliminares

- O servidor local é a autoridade operacional da unidade que ativou o modo híbrido.
- A nuvem é a visão consolidada da organização e recebe eventos continuamente.
- Toda operação recebe identificador global, unidade, dispositivo, operador, sequência local, versão da entidade e horários local/nuvem.
- Reenvios são seguros por idempotência; a mesma operação nunca vira duas vendas ou dois movimentos.
- A sincronização usa eventos/comandos imutáveis e confirmações da nuvem, não cópia cega de tabelas.
- Conflitos nunca são descartados silenciosamente e podem exigir conferência administrativa.
- Transferências entre unidades e outras operações multiunidade precisam de regra especial e poderão exigir conexão.
- Dados locais devem ser criptografados, copiados e monitorados.
- A ausência de energia poderá interromper a operação, conforme premissa atual; nobreak continua recomendável para desligamento seguro e oscilações.

## Instalação e administração desejadas

O cliente não deverá configurar Docker, banco, portas ou arquivos manualmente. A experiência pretendida é um instalador, por exemplo `Instalar Mordomê Local.exe`, com código temporário de pareamento gerado no painel da unidade.

O instalador deverá:

- validar sistema, armazenamento e rede;
- instalar banco e serviços necessários;
- registrar inicialização automática;
- configurar acesso apenas na rede local;
- gerar identidade e chaves do servidor;
- baixar o primeiro snapshot da unidade;
- testar comunicação local e com a nuvem;
- configurar atualização, backup, diagnóstico e recuperação;
- permitir troca ou desativação somente com a fila completamente sincronizada.

O painel deve usar linguagem simples: estado do servidor, última comunicação, última sincronização confirmada, operações pendentes conhecidas, versão instalada e ações de diagnóstico/teste offline.

## Tecnologias e soluções a pesquisar

Nenhuma escolha abaixo está aprovada ainda. Realizar provas de conceito comparáveis antes da decisão.

### Execução local

- serviço Windows nativo ou aplicação empacotada;
- Next.js em modo standalone com serviço supervisor;
- runtime Node.js embarcado;
- alternativa de agente local em Go ou Rust;
- Linux/appliance para instalações dedicadas;
- Docker/Podman apenas como detalhe interno se puder ser totalmente ocultado do cliente.

### Persistência local

- PostgreSQL local para máxima compatibilidade com o domínio atual;
- SQLite/libSQL para instalação e recuperação mais simples;
- log local append-only separado do banco de leitura;
- criptografia em repouso, backup incremental e verificação de integridade.

### Sincronização

- padrão transactional outbox/inbox;
- event log por unidade e sequência monotônica;
- idempotência e versionamento otimista;
- WebSocket ou Server-Sent Events para atualização quase imediata do painel;
- NATS, RabbitMQ, Redis Streams ou serviço gerenciado somente se trouxer benefício comprovado;
- mecanismos de compactação, reenvio, confirmação, quarentena e resolução de conflito.

### Rede e descoberta

- descoberta por mDNS/hostname local;
- QR Code de pareamento dos terminais;
- DNS local ou endereço estável;
- estratégia de HTTPS e identidade dos terminais na rede interna;
- impressão local e descoberta segura de impressoras.

### Instalação, atualização e observabilidade

- instalador Windows assinado;
- atualização atômica com rollback;
- serviço watchdog e reinício automático;
- métricas de saúde sem expor dados do cliente;
- diagnóstico exportável para suporte;
- teste automatizado de queda de internet, reinício, disco cheio e sincronização atrasada.

## Questões que ainda precisam ser decididas

- Qual sistema operacional será oficialmente suportado no primeiro lançamento?
- O cliente fornecerá o computador ou haverá equipamento homologado pelo Mordomê?
- Quantas horas ou dias de operação offline devem ser suportados?
- Quais meios de pagamento podem ser confirmados offline?
- Como validar Pix, TEF e maquininhas independentes?
- Quais operações administrativas serão bloqueadas offline?
- Como resolver alterações simultâneas na mesma mesa em terminais desconectados do servidor local?
- Qual será a política de retenção, backup, restauração e perda do equipamento?
- Como executar failover e retorno à operação local sem criar split-brain?
- Qual custo e modelo comercial do Mordomê Continuidade por unidade?

## Critérios mínimos antes de produção

- teste real com múltiplos terminais na mesma rede sem internet;
- nenhuma perda ou duplicação após reinício durante sincronização;
- fechamento de caixa e estoque reconciliáveis;
- painel remoto identifica claramente dados atrasados;
- atualizações e rollback testados;
- recuperação documentada para perda do servidor;
- auditoria preserva operador, dispositivo, horário da operação e horário de sincronização;
- revisão de segurança, capacidade e suporte operacional.
