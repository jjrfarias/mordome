# ADR 0073 — Observação por item e adicionais compactos

No salão, tocar em um produto abre a personalização, inclusive sem adicionais. A observação opcional aceita até 300 caracteres e é gravada em TabItem.notes. A cozinha, reimpressão e agente térmico mostram OBS junto ao item. Preço e seleção obrigatória continuam validados no servidor; observações não modificam preço nem composição de estoque.

Itens com observação são linhas separadas e não se agregam aos itens comuns. Aumentar a quantidade de uma linha mantém a observação daquela linha. Não há edição retroativa de observações já enviadas. O modal aguarda a gravação, impede envio duplicado durante a requisição e mantém o texto se houver falha.

O seletor compartilhado usa linhas compactas com controles nativos de 18px e área de toque de pelo menos 44px. A observação está habilitada no salão; demais canais preservam seus fluxos.
