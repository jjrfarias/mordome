-- ADR 0044: PDV rápido passa a enviar o pedido para a cozinha.
-- Adiciona a marcação de "mesa virtual" (Balcão) usada para rotear vendas do PDV pelo mesmo
-- pipeline de Comanda/Pedido (Tab/Order) já usado pelo Salão, sem misturar com as mesas reais.
ALTER TABLE "DiningTable" ADD COLUMN "isCounter" BOOLEAN NOT NULL DEFAULT false;
