import assert from "node:assert/strict";
import test from "node:test";
import { mapLiveStorefront } from "../lib/storefront/live-adapter.ts";

test("Entrega online pode ser pausada sem remover retirada ou produtos", () => {
  for (const enabled of [true, false, undefined]) {
    const menu = mapLiveStorefront("unit", {
      establishment: { name: "Loja", logoUrl: null, bannerUrl: "banner.jpg", highlightHeadline: null, highlightProduct: null, onlineDeliveryEnabled: enabled },
      products: [{ id: "p", name: "Pastel", category: "Pastéis", description: null, price: 10, imageUrl: null }],
      deliveryAreas: [],
    });
    assert.equal(menu.onlineDeliveryEnabled, enabled !== false);
    assert.equal(menu.pickupSupported, true);
    assert.equal(menu.products.length, 1);
    if (enabled === false) assert.match(menu.slides[0].description ?? "", /retirada ou consumo no local/);
  }
});
