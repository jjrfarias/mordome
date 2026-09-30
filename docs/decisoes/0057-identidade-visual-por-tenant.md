# ADR 0057: Identidade visual por tenant com co-branding Mordomê

## Decisão

Cada organização pode definir uma logo, uma cor principal e uma cor de destaque. A configuração pertence ao tenant e só pode ser alterada por quem possui permissão de gestão de estabelecimentos.

A marca Mordomê permanece sempre visível no menu lateral. A logo do cliente aparece como co-branding, separada da marca da plataforma. Sem configuração, o sistema usa a paleta padrão do Mordomê.

As cores aceitam somente valores hexadecimais completos. A logo é comprimida no navegador, armazenada como data URL com limite de tamanho e nunca é carregada de uma URL externa. Toda alteração gera evento de auditoria sem copiar o conteúdo da imagem para o log.
