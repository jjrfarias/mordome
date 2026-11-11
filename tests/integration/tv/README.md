# Integração da TV com o Mordomê

Teste manual de ponta a ponta das APIs, usando o login, as rotas, o Prisma e as
migrations reais do projeto. O teste cria seu próprio PostgreSQL local e o
descarta ao terminar; ele não utiliza `DATABASE_URL` do ambiente do usuário.

## Executar

Use Node.js 22 ou superior, com as dependências do projeto já instaladas. As
dependências deste teste ficam isoladas nesta pasta e não fazem parte da
instalação da aplicação.

```sh
npm --prefix tests/integration/tv ci
node tests/integration/tv/smoke.mjs
```

Execute como usuário comum, sem privilégios de root. As portas locais 47620,
47621 e 47622 precisam estar livres. Encerre `next dev` neste checkout antes do
teste, ou use um checkout separado: o script recusa um lock de desenvolvimento
existente e não remove locks nem encerra processos de terceiros. Também recusa
`NODE_ENV=production`.

O script aplica todas as migrations em um banco novo, gera o cliente Prisma e
inicia o Next em desenvolvimento. Cria duas organizações, três unidades e
usuários com diferentes permissões. Ao finalizar, encerra os serviços que
iniciou e remove os dados do PostgreSQL. Logs e um `result.json` ficam em uma
pasta temporária `mordome-tv-test-*`; em caso de falha, o caminho é mostrado.

## O que é verificado

- Login real, permissão de integração, isolamento entre organizações e unidades,
  rejeição de origem externa e fixação da TV à unidade quando outra aba troca
  o estabelecimento ativo.
- Token de TV armazenado somente como hash, cookie HttpOnly com caminho próprio,
  respostas sem segredos e revogação de acesso à playlist, à mídia e ao
  pareamento. Unidades ou organizações desativadas também bloqueiam a TV.
- Upload pelo SDK S3, integridade dos bytes, requisições HEAD, intervalos HTTP
  206/416, assinatura do arquivo, exclusão e limite de arquivos sob concorrência.
- Descoberta de contas Instagram com paginação por cursor, validação da leitura
  de Stories antes de salvar, criptografia do token e filtragem de URLs e stories
  expirados. Uma conta ambígua ou uma autorização inválida não é gravada.
- Preservação do cache durante falha externa, uma única consulta sob refresh
  concorrente e limpeza da conexão ao desconectar.

A Meta e o armazenamento S3 são simulados localmente. O teste comprova o
comportamento da aplicação; a autorização real do Instagram e as credenciais do
provedor de armazenamento precisam ser verificadas no ambiente em que forem
configuradas. O adaptador `mock-graph.mjs` só é carregado nos processos deste
teste e exige seu diretório temporário dedicado.

Os testes rápidos de formato de mídia, intervalos e expiração estão em
`tests/tv-media.test.ts` e rodam com `npm test` na raiz.
