# Transmissão da programação para Google TV / Android TV

O fluxo principal foi simplificado para [TV pelo navegador](TV-WEB.md).
O botão Cast foi retirado do painel; o código e as APIs abaixo permanecem para
compatibilidade, sem serem necessários para ativar uma TV pelo QR code.

A implementação Cast usa Google Cast Web Sender para abrir o seletor nativo de dispositivos.
O servidor Railway não procura dispositivos na rede local. O Chrome do operador
e a TV devem estar na mesma rede, com descoberta Google Cast disponível.

O receptor customizado mantém o player de fotos e vídeos, a identidade da loja
e a atualização da programação. O Default Media Receiver não substitui esse
receptor: ele é voltado a áudio/vídeo, sem a galeria/layout do Mordomê.

## Configuração externa necessária

1. No https://cast.google.com/publish/, cadastrar um **Custom Receiver**.
2. Nome: **Mordomê TV**.
3. URL do receptor: `https://mordome.jordaoconsultoria.com/tv/receiver`.
4. Desabilitar suporte a dispositivos somente de áudio e relay casting.
5. Copiar o Application ID de oito caracteres hexadecimais para a variável
   `TV_CAST_APP_ID` do serviço web no Railway e publicar a aplicação.
6. Para receptor ainda não publicado no Google, registrar a TV de teste no
   console usando o número de série de software Cast (não necessariamente o
   número de série da etiqueta TCL), aguardar a liberação e reiniciar a TV.
7. Abrir o painel no Chrome e usar **Transmitir para TV**.

Referência: https://developers.google.com/cast/docs/registration

Sem ID válido, a interface informa que a transmissão está em configuração,
sem anunciar que uma TV foi localizada ou transmitir para outro aplicativo.
Não há dependência da autorização do Instagram.

## Autorização e ciclo de vida

O operador precisa de `integrations.manage` e acesso à unidade. Depois da escolha
da TV, o painel cria um acesso revogável pelo endpoint de displays já existente.
O token vai pelo canal Cast customizado, não por URL, query, log ou localStorage.
O receptor troca o token pelo cookie HttpOnly limitado àquela TV no próprio
domínio. Playlist e mídia preservam os controles de unidade e revogação existentes.

O painel aguarda confirmação de pareamento do receptor. Isso confirma o acesso,
não a decodificação física do primeiro vídeo. Em falha, tenta revogar o acesso
recém-criado; se a rede impedir essa limpeza, ele continua visível na lista de
TVs para revogação manual. Cada transmissão cria uma entrada própria.

Revogar o display bloqueia novas requisições de mídia e a próxima atualização
da playlist. Conteúdo já carregado pode permanecer até essa atualização.
O receptor não depende de manter o painel aberto após receber a programação;
o comportamento ao desconectar o emissor deve ser confirmado na TV real.

## Validação

`tests/tv-cast.test.ts` valida os formatos de credencial, rejeição de URLs externas,
configuração ausente, correlação da confirmação e falhas de transporte/receptor.
Executar também `npm run build` e a suíte HTTP existente de TV.

A validação física exige Application ID registrado e a TCL acessível na rede:
selecionar a TV, verificar imagem/vídeo em loop, atualização de programação,
recusa de acesso revogado e nova transmissão. Não considerar testes simulados
como evidência de descoberta/reprodução numa TV física.
