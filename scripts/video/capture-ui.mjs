import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import dotenv from "dotenv";
import { chromium } from "../../.tools/video-runner/node_modules/playwright-core/index.mjs";

dotenv.config({ path: path.resolve(".env.local"), quiet: true });

const baseUrl = process.env.VIDEO_BASE_URL || "http://localhost:3000";
const username = process.env.LOCAL_AUTH_USERNAME;
const password = process.env.LOCAL_AUTH_PASSWORD;
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!username || !password) {
  throw new Error("LOCAL_AUTH_USERNAME e LOCAL_AUTH_PASSWORD precisam existir em .env.local.");
}

const root = path.resolve("artifacts", "videos");
await mkdir(path.join(root, "saas", "stills"), { recursive: true });
await mkdir(path.join(root, "betao", "stills"), { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--font-render-hinting=none"],
});

const genericCss = `
  body { --brand-primary:#163c32 !important; --brand-deep:#0e2c25 !important; --brand-accent:#d86f45 !important; }
  body, .app-shell, .auth-shell { background-color:#f3f0e8 !important; }
  .sidebar, aside { background:#163c32 !important; }
  .betao-login-art { background:radial-gradient(circle at 80% 20%,#2b6554 0,transparent 35%),linear-gradient(145deg,#163c32,#102d26) !important; }
  .betao-login-panel { background:#fdfcf8 !important; }
  .betao-enter { background:#163c32 !important; box-shadow:0 9px 22px rgba(22,60,50,.16) !important; }
  .betao-stamp { display:none !important; }
  .betao-family { color:#e8b06d !important; }
  .betao-client-mark img, .betao-login-logo, img[src*="clientes/betao"], img[src*="clientes%2Fbetao"] { display:none !important; }
  .video-generic-mark { display:grid; place-items:center; width:58px; height:58px; border:1px solid rgba(255,255,255,.45); border-radius:18px; color:#f3f0e8; font:700 31px Georgia,serif; background:#0e2c25; box-shadow:0 12px 28px rgba(0,0,0,.2); }
`;

async function genericize(page) {
  await page.evaluate(({ css }) => {
    document.body.classList.remove("betao-theme");
    if (!document.getElementById("video-generic-css")) {
      const style = document.createElement("style");
      style.id = "video-generic-css";
      style.textContent = css;
      document.head.appendChild(style);
    }
    const replacements = [
      [/Administrador Betão/gi, "Administrador"],
      [/Betão Hot Dog/gi, "Mordomê"],
      [/Família Betão/gi, "Sua operação"],
      [/Operação Betão/gi, "Gestão integrada"],
      [/Parque Aeroporto/gi, "Unidade Centro"],
      [/Cavaleiros/gi, "Unidade Orla"],
      [/Lagomar/gi, "Unidade Sul"],
      [/Anexo/gi, "Unidade Norte"],
      [/@betao/gi, "@administrador"],
      [/Sua operação · MACAÉ/gi, "MORDOMÊ · GESTÃO"],
      [/A casa está pronta\.\s*Pode entrar\./gi, "Sua operação começa aqui."],
      [/Salão, balcão, cozinha e caixa no mesmo ritmo\./gi, "Todos os canais conectados no mesmo ritmo."],
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let value = node.nodeValue || "";
      for (const [pattern, replacement] of replacements) value = value.replace(pattern, replacement);
      node.nodeValue = value;
    }
    document.querySelectorAll(".betao-client-mark, .betao-login-logo").forEach((source) => {
      const host = source.classList.contains("betao-client-mark") ? source : source.parentElement;
      if (host && !host.querySelector(".video-generic-mark")) {
        const mark = document.createElement("span");
        mark.className = "video-generic-mark";
        mark.textContent = "M";
        host.prepend(mark);
      }
    });
  }, { css: genericCss });
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(900);
}

async function clickText(page, text) {
  const target = page.getByText(text, { exact: true }).first();
  if (await target.count()) {
    await target.click();
    await settle(page);
    return true;
  }
  return false;
}

async function shot(page, variant, name, generic = false) {
  if (generic) await genericize(page);
  await page.screenshot({
    path: path.join(root, variant, "stills", `${name}.png`),
    fullPage: false,
  });
  process.stdout.write(`${variant}/${name}\n`);
}

async function runVariant(variant) {
  const generic = variant === "saas";
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "pt-BR",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await settle(page);
  await shot(page, variant, "01-login", generic);

  const userInput = page.getByLabel(/usuário/i).first();
  const passwordInput = page.getByLabel(/senha/i).first();
  await userInput.fill(username);
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForFunction(() => !document.body.innerText.match(/entrar na opera[cç][aã]o/i), null, { timeout: 15000 });
  await settle(page);
  await shot(page, variant, "02-salao", generic);

  const routes = [
    ["PDV rápido", "03-pdv"],
    ["Cozinha", "04-cozinha"],
    ["Caixa", "05-caixa"],
    ["Resumo", "06-resumo"],
    ["Histórico", "07-historico"],
    ["Configurações", "08-configuracoes"],
  ];
  for (const [label, file] of routes) {
    if (await clickText(page, label)) await shot(page, variant, file, generic);
  }

  await clickText(page, "Configurações");
  const settings = [
    ["Cardápio", "09-cardapio"],
    ["Estoque", "10-estoque"],
    ["Fichas técnicas", "11-fichas-tecnicas"],
    ["Estabelecimentos", "12-estabelecimentos"],
    ["Equipe e perfis", "13-equipe-perfis"],
    ["Integrações", "14-integracoes"],
  ];
  for (const [label, file] of settings) {
    if (await clickText(page, label)) await shot(page, variant, file, generic);
  }

  await context.close();
}

try {
  const requestedVariant = process.env.VIDEO_VARIANT;
  if (!requestedVariant || requestedVariant === "betao") await runVariant("betao");
  if (!requestedVariant || requestedVariant === "saas") await runVariant("saas");
} finally {
  await browser.close();
}
