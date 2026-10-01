import test from "node:test";
import assert from "node:assert/strict";
import { fetchRoute, routeInstruction } from "../lib/osrm.ts";

const origin = { lat: -23.55, lng: -46.63 };
const destination = { lat: -23.57, lng: -46.65 };
const payload = { code: "Ok", routes: [{ distance: 2500, duration: 600, geometry: { coordinates: [[-46.63, -23.55], [-46.65, -23.57]] }, legs: [{ steps: [{ name: "Rua A", distance: 200, maneuver: { type: "turn", modifier: "right" } }] }] }] };

test("roteamento mantém ordem das paradas e envia somente coordenadas", async t => {
  let requested = "";
  t.mock.method(globalThis, "fetch", async (url: string) => { requested = url; return Response.json(payload); });
  const route = await fetchRoute(origin, destination, { stops: [{ lat: -23.56, lng: -46.64 }] });
  assert.match(requested, /-46.63,-23.55;-46.64,-23.56;-46.65,-23.57/);
  assert.match(requested, /steps=true/);
  assert.equal(route?.distanceMeters, 2500);
  assert.deepEqual(route?.coordinates[0], origin);
  assert.equal(route?.steps[0].instruction, "Siga à direita em Rua A");
});

test("coordenadas inválidas e excesso de paradas não consultam o provedor", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("não deve chamar"); });
  assert.equal(await fetchRoute({ lat: NaN, lng: 0 }, destination), null);
  assert.equal(await fetchRoute(origin, { lat: 91, lng: 0 }), null);
  assert.equal(await fetchRoute(origin, destination, { stops: Array(24).fill(origin) }), null);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("falha e resposta malformada nunca viram um trajeto válido", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ code: "NoRoute" }));
  assert.equal(await fetchRoute(origin, destination), null);
  mock.mock.mockImplementation(async () => Response.json({ ...payload, routes: [{ ...payload.routes[0], distance: -1 }] }));
  assert.equal(await fetchRoute(origin, destination), null);
  mock.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.equal(await fetchRoute(origin, destination), null);
});

test("traduz chegada, rotatória, retorno e manobra desconhecida", () => {
  assert.equal(routeInstruction("", { type: "arrive" }), "Chegue à parada");
  assert.equal(routeInstruction("", { type: "roundabout", exit: 2 }), "Na rotatória, pegue a 2ª saída");
  assert.equal(routeInstruction("", { type: "turn", modifier: "uturn" }), "Faça o retorno");
  assert.equal(routeInstruction("Rua B", { type: "future", modifier: "left" }), "Siga à esquerda em Rua B");
});
