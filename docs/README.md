# Documentação do Mordomê

Esta pasta é a fonte de verdade funcional e técnica do produto. Toda mudança relevante deve atualizar o documento correspondente no mesmo conjunto de alterações do código.

## Índice

| Documento | Finalidade |
| --- | --- |
| [PRODUTO.md](PRODUTO.md) | Visão, público, princípios, escopo e métricas |
| [FUNCOES.md](FUNCOES.md) | Catálogo dos módulos e regras funcionais |
| [ARQUITETURA.md](ARQUITETURA.md) | Arquitetura técnica, tenancy, segurança e integrações |
| [DOMINIO.md](DOMINIO.md) | Entidades, relacionamentos, invariantes e eventos |
| [AUTORIZACAO.md](AUTORIZACAO.md) | Perfis personalizados e cálculo de permissões |
| [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md) | Método, padrões, testes e definição de pronto |
| [IMPLANTACAO.md](IMPLANTACAO.md) | Ambientes, serviços, deploy, banco e operação |
| [HANDOFF-GPT-5.3.md](HANDOFF-GPT-5.3.md) | Estado completo, restrições e próxima tarefa para continuidade por outro modelo |
| [IDENTIDADE-VISUAL.md](IDENTIDADE-VISUAL.md) | Marca, tokens e regras de interface |
| [decisoes/](decisoes/) | Registros de decisões arquiteturais (ADRs) |

## Estados usados nos documentos

- **Implementado:** existe no código e foi validado.
- **Decidido:** regra aprovada, ainda que a implementação não esteja concluída.
- **Planejado:** direção esperada, sujeita a detalhamento.
- **Fora do MVP:** não deve ser implementado nesta fase.

## Regra de manutenção

Uma funcionalidade não é considerada concluída sem: regra documentada, autorização definida, validação de entrada, teste proporcional ao risco e tratamento de carregamento, vazio, erro e sucesso.
