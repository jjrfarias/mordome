import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "../../.tools/video-runner/node_modules/playwright-core/index.mjs";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const root = path.resolve("artifacts", "videos");
const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

const cards = [
  { variant:"saas", file:"00-marca", eyebrow:"GESTÃO PARA HOSPITALIDADE", title:"Toda a operação.<br>Em um só lugar.", body:"Balcão, salão, cozinha, delivery e administração conectados.", chips:["PDV", "Salão", "Cozinha", "Delivery", "Gestão"] },
  { variant:"saas", file:"01-primeiro-acesso", eyebrow:"COMECE COM SEGURANÇA", title:"Da contratação<br>à primeira venda.", body:"Convite protegido, configuração guiada e operação pronta para começar.", flow:["Contratação", "Primeiro acesso", "Empresa e unidades", "Equipe", "Operação"] },
  { variant:"saas", file:"02-multiunidade", eyebrow:"UMA EMPRESA. QUANTAS UNIDADES PRECISAR.", title:"Visão local.<br>Controle consolidado.", body:"Cardápios, preços, estoques, caixas, equipes e resultados separados por estabelecimento.", metrics:[["04","unidades ativas"],["128","vendas hoje"],["R$ 8,4 mil","faturamento"]] },
  { variant:"saas", file:"03-canais", eyebrow:"UM CATÁLOGO PARA TODOS OS CANAIS", title:"Venda onde o<br>cliente estiver.", body:"Balcão, mesas, retirada, cardápio digital, delivery próprio e plataformas externas.", chips:["Balcão", "Salão", "Retirada", "Menu online", "Delivery"] , future:true},
  { variant:"saas", file:"04-financeiro", eyebrow:"OPERAÇÃO E FINANCEIRO CONECTADOS", title:"Do pagamento<br>à conciliação.", body:"Pix, cartões, TEF, emissão fiscal, sangrias, suprimentos e reembolsos em um fluxo rastreável.", chips:["Pix", "Cartões", "TEF", "Fiscal", "Conciliação"], future:true },
  { variant:"saas", file:"05-offline-local", eyebrow:"INTERNET INDISPONÍVEL", title:"Operação local ativa.", body:"PDV, salão, cozinha, caixa e impressão continuam funcionando pela rede interna.", status:"12 operações aguardando sincronização", state:"warn", future:true },
  { variant:"saas", file:"06-offline-sync", eyebrow:"CONEXÃO RESTABELECIDA", title:"Sincronizando…", body:"As operações locais são confirmadas na nuvem com segurança e rastreabilidade.", status:"7 de 12 operações sincronizadas", state:"sync", future:true },
  { variant:"saas", file:"07-offline-ok", eyebrow:"UNIDADE E NUVEM", title:"Tudo sincronizado.", body:"A administração volta a acompanhar os dados em tempo real.", status:"Sincronizado agora", state:"ok", future:true },
  { variant:"saas", file:"99-encerramento", eyebrow:"MORDOMÊ", title:"Controle para quem administra.<br>Agilidade para quem atende.", body:"Online ou offline. Toda a operação em um só lugar.", end:true },
  { variant:"betao", file:"00-marca", eyebrow:"MORDOMÊ PARA FAMÍLIA BETÃO", title:"Tradição para servir.<br>Tecnologia para crescer.", body:"Uma experiência feita para o ritmo da Família Betão.", logo:true },
  { variant:"betao", file:"01-canais", eyebrow:"UMA OPERAÇÃO, TODAS AS UNIDADES", title:"O mesmo cardápio.<br>Todos os canais.", body:"Balcão, mesas, retirada, delivery próprio e plataformas externas.", chips:["Balcão", "Salão", "Retirada", "Delivery"], future:true },
  { variant:"betao", file:"02-offline", eyebrow:"INTERNET INDISPONÍVEL", title:"A casa continua<br>atendendo.", body:"Operação local ativa. Quando a conexão volta, o Mordomê sincroniza tudo.", status:"12 operações aguardando sincronização", state:"warn", future:true, logo:true },
  { variant:"betao", file:"99-encerramento", eyebrow:"MORDOMÊ PARA FAMÍLIA BETÃO", title:"Tradição para servir.<br>Tecnologia para crescer.", body:"Toda a operação em um só lugar — mesmo sem internet.", end:true, logo:true },
];

function html(card) {
  const betao = card.variant === "betao";
  const primary = betao ? "#a90012" : "#163c32";
  const deep = betao ? "#76000d" : "#0e2c25";
  const accent = betao ? "#f1ba18" : "#d86f45";
  const mark = card.logo
    ? `<img class="logo" src="http://localhost:3000/clientes/betao/logo-recriada-v1.png">`
    : `<div class="monogram">M</div><div class="wordmark">Mordomê</div>`;
  const chips = card.chips ? `<div class="chips">${card.chips.map((x) => `<span>${x}</span>`).join("")}</div>` : "";
  const flow = card.flow ? `<div class="flow">${card.flow.map((x,i) => `<span><b>${String(i+1).padStart(2,"0")}</b>${x}</span>`).join("<i>→</i>")}</div>` : "";
  const metrics = card.metrics ? `<div class="metrics">${card.metrics.map(([n,l]) => `<span><b>${n}</b><small>${l}</small></span>`).join("")}</div>` : "";
  const status = card.status ? `<div class="status ${card.state}"><i></i><span>${card.status}</span></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:#f3f0e8;color:#20231f;font-family:"Segoe UI",Arial,sans-serif}
    .page{position:relative;width:1920px;height:1080px;padding:70px 92px;background:linear-gradient(125deg,#f8f5ed 0%,#f3f0e8 63%,${primary}14 100%);overflow:hidden}
    .ring{position:absolute;width:820px;height:820px;border:1px solid ${accent}66;border-radius:50%;right:-210px;top:-330px;box-shadow:0 0 0 90px ${primary}08,0 0 0 180px ${primary}07}
    header{display:flex;align-items:center;gap:18px;position:relative;z-index:2}.monogram{display:grid;place-items:center;width:64px;height:64px;border-radius:19px;background:${primary};color:#fff;font:700 36px Georgia,serif}.wordmark{font:700 35px Georgia,serif;color:${primary}}
    .logo{width:156px;height:156px;object-fit:contain;filter:drop-shadow(0 12px 18px #0002)}
    main{position:absolute;left:92px;right:92px;top:285px}.eyebrow{font-size:16px;letter-spacing:.25em;font-weight:800;color:${accent};margin-bottom:26px}.title{font:700 72px/1.05 Georgia,serif;letter-spacing:-.035em;color:${primary};max-width:1250px}.body{font-size:26px;line-height:1.45;color:#5e625c;max-width:1050px;margin-top:28px}
    .chips,.flow,.metrics{display:flex;gap:16px;align-items:stretch;margin-top:58px}.chips span{padding:17px 25px;border:1px solid ${primary}33;border-radius:999px;background:#fff;color:${primary};font-weight:700;font-size:19px;box-shadow:0 10px 28px #0000000c}
    .flow span{display:flex;flex-direction:column;gap:8px;min-width:205px;padding:23px 25px;border:1px solid ${primary}22;border-radius:20px;background:#fff;font-weight:700;color:${primary}}.flow b{font-size:13px;color:${accent};letter-spacing:.18em}.flow i{align-self:center;color:${accent};font-style:normal;font-size:25px}
    .metrics span{display:flex;flex-direction:column;min-width:250px;padding:25px 28px;border-left:3px solid ${accent};background:#fff;border-radius:0 18px 18px 0}.metrics b{font:700 41px Georgia,serif;color:${primary}}.metrics small{font-size:16px;margin-top:6px;color:#6c706a}
    .status{display:flex;align-items:center;gap:16px;margin-top:55px;width:max-content;padding:21px 30px;background:#fff;border:1px solid ${primary}22;border-radius:16px;font-size:21px;font-weight:750;color:${primary};box-shadow:0 16px 35px #0001}.status i{width:14px;height:14px;border-radius:50%;background:#e4a319;box-shadow:0 0 0 8px #e4a31922}.status.sync i{background:#4c82c3;box-shadow:0 0 0 8px #4c82c322}.status.ok i{background:#43a77a;box-shadow:0 0 0 8px #43a77a22}
    .future{position:absolute;right:92px;bottom:64px;color:#777d76;font-size:13px;letter-spacing:.17em;font-weight:800}.end main{top:330px}.end .title{font-size:67px}.end .body{color:${primary}}
  </style></head><body><div class="page ${card.end ? "end" : ""}"><div class="ring"></div><header>${mark}</header><main><div class="eyebrow">${card.eyebrow}</div><div class="title">${card.title}</div><div class="body">${card.body}</div>${chips}${flow}${metrics}${status}</main>${card.future ? '<div class="future">VISÃO COMPLETA DA PLATAFORMA</div>' : ""}</div></body></html>`;
}

for (const card of cards) {
  const dir = path.join(root, card.variant, "cards");
  await mkdir(dir, { recursive: true });
  await page.setContent(html(card), { waitUntil:"load" });
  await page.waitForTimeout(250);
  await page.screenshot({ path:path.join(dir, `${card.file}.png`) });
  process.stdout.write(`${card.variant}/${card.file}\n`);
}

await browser.close();
