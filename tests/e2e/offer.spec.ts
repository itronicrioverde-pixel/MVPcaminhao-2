import { expect, test, type Page } from "@playwright/test";

// Caso do documento de cálculos: 120 km vazios a 3 km/L, 600 km carregados a 2 km/L,
// diesel a R$ 6,79, pedágio R$ 450, R$ 1,50/km do caminhão, comissão 13%, meta 20%.
// Resultados esperados conferidos com o motor (lib/offer.ts):
//   R$ 10.060 compensa (R$ 4.913,60 / 48,84%), R$ 5.000 abaixo da meta, R$ 4.000 prejuízo.
//   Frete mínimo para empatar R$ 4.412,18; para a meta de 20% R$ 5.729,25.

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

async function openOffer(page: Page, mode: "quick" | "detailed" = "detailed", opts: { keepFuel?: boolean } = {}) {
  // as medições agora ficam no banco, que dura entre os testes: cada teste começa sem nenhuma
  if (!opts.keepFuel) expect((await page.request.delete("/api/fuel?all=true")).ok()).toBe(true);
  await page.goto("/");
  const nav = isMobile(page)
    ? page.getByRole("navigation", { name: "Navegação mobile" })
    : page.getByRole("navigation", { name: "Navegação principal" });
  const button = nav.getByRole("button", { name: isMobile(page) ? "Frete" : "Analisar frete", exact: true });
  const heading = page.getByRole("heading", { name: "Analisar frete", exact: true });
  // um clique feito antes de a página terminar de carregar se perde: repete até a tela abrir
  await expect(async () => {
    await button.click();
    await expect(heading).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  const toggle = page.getByRole("button", { name: mode === "quick" ? "Rápido" : "Detalhado", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}

async function fill(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
}

async function fillTrip(page: Page, opts: { skipToll?: boolean } = {}) {
  await fill(page, "Km até a coleta (vazio)", "120");
  await fill(page, "Km carregado", "600");
  await fill(page, "Consumo vazio (km/L)", "3");
  await fill(page, "Consumo carregado (km/L)", "2");
  await fill(page, "Preço do diesel (R$/L)", "6,79");
  if (!opts.skipToll) await fill(page, "Pedágio (R$)", "450");
  await fill(page, "Custo por km do caminhão (R$/km)", "1,50");
  await fill(page, "Custo fixo por dia (R$/dia)", "0");
  await fill(page, "Comissão do motorista (%)", "13");
  await fill(page, "Margem que você quer (%)", "20");
}

const result = (page: Page) => page.getByTestId("offer-result");

test("frete por tonelada do documento compensa, com todos os números", async ({ page }) => {
  await openOffer(page);
  await page.getByRole("button", { name: "Por tonelada", exact: true }).click();
  await fill(page, "Valor por tonelada (R$)", "200");
  await fill(page, "Peso carregado (kg)", "50.300");
  await fillTrip(page);

  const card = result(page);
  await expect(card).toContainText("Compensa");
  await expect(card).toContainText("R$ 10.060,00");
  await expect(card).toContainText("R$ 4.913,60");
  await expect(card).toContainText("48,84%");
  await expect(card).toContainText("R$ 4.412,18");
  await expect(card).toContainText("R$ 5.729,25");
  await expect(card).toContainText("340 L");
  await expect(card).not.toContainText("Resultado provisório");
});

test("o mesmo trajeto muda de decisão conforme o valor do frete", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");
  await expect(result(page)).toContainText("Compensa");

  await fill(page, "Valor do frete (R$)", "5.000");
  await expect(result(page)).toContainText("Abaixo da sua meta");
  await expect(result(page)).toContainText("10,23%");
  await expect(result(page)).toContainText("Faltam R$ 729,25 para a sua meta");

  await fill(page, "Valor do frete (R$)", "4.000");
  await expect(result(page)).toContainText("Dá prejuízo");
  await expect(result(page)).toContainText("-R$ 358,60");
  await expect(result(page)).toContainText("-8,97%");
});

test("sem o frete a tela pede o valor em vez de mostrar uma decisão", async ({ page }) => {
  await openOffer(page);
  await expect(result(page)).toContainText("Informe o frete");
  await expect(result(page)).not.toContainText("Compensa");
});

test("dado que falta aparece como pendência e deixa o resultado provisório", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page, { skipToll: true });
  await fill(page, "Valor do frete (R$)", "10.060");

  const card = result(page);
  await expect(card).toContainText("Resultado provisório");
  await expect(card).toContainText("O pedágio ainda não foi conferido");

  await page.getByLabel("Esta rota não tem pedágio").check();
  await expect(card).not.toContainText("Resultado provisório");
  await expect(card).not.toContainText("O pedágio ainda não foi conferido");

  await page.getByLabel("Esta rota não tem pedágio").uncheck();
  await fill(page, "Consumo carregado (km/L)", "");
  await expect(card).toContainText("Falta o consumo (km/L) de um trecho");
  await expect(card).toContainText("Resultado provisório");
});

test("número digitado errado é apontado e nada é calculado", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");
  await fill(page, "Pedágio (R$)", "abc");

  await expect(page.getByText("Use só números, por exemplo 1.234,56.")).toBeVisible();
  await expect(page.getByLabel("Pedágio (R$)", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(result(page)).toContainText("Corrija os campos em vermelho");
  await expect(result(page)).not.toContainText("Compensa");

  await fill(page, "Pedágio (R$)", "450");
  await expect(result(page)).toContainText("Compensa");
});

test("preço do litro com ponto é lido como decimal, nunca como milhar", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");
  await fill(page, "Preço do diesel (R$/L)", "6.790");
  await expect(result(page)).toContainText("R$ 4.913,60");
});

test("consumo, diesel e custo por km do caminhão ficam guardados neste aparelho", async ({ page }) => {
  await openOffer(page);
  await fill(page, "Consumo vazio (km/L)", "3");
  await fill(page, "Consumo carregado (km/L)", "2");
  await fill(page, "Preço do diesel (R$/L)", "6,79");
  await fill(page, "Custo por km do caminhão (R$/km)", "1,50");
  await fill(page, "Custo fixo por dia (R$/dia)", "500");
  await fill(page, "Comissão do motorista (%)", "13");
  await fill(page, "Margem que você quer (%)", "20");
  await fill(page, "Km carregado", "600");
  await fill(page, "Valor do frete (R$)", "10.060");

  await page.reload();
  await openOffer(page);
  await expect(page.getByLabel("Consumo vazio (km/L)", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Consumo carregado (km/L)", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Preço do diesel (R$/L)", { exact: true })).toHaveValue("6,79");
  await expect(page.getByLabel("Custo por km do caminhão (R$/km)", { exact: true })).toHaveValue("1,50");
  await expect(page.getByLabel("Custo fixo por dia (R$/dia)", { exact: true })).toHaveValue("500");
  await expect(page.getByLabel("Comissão do motorista (%)", { exact: true })).toHaveValue("13");
  await expect(page.getByLabel("Margem que você quer (%)", { exact: true })).toHaveValue("20");
  // o que é da oferta (frete e quilômetros) não é guardado
  await expect(page.getByLabel("Km carregado", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Valor do frete (R$)", { exact: true })).toHaveValue("");
});

test("a tela funciona mesmo quando os dados da conta não carregam", async ({ page }) => {
  await page.route("**/api/records", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sua sessão expirou ou esta conta não possui acesso. Entre novamente.", code: "SESSION_EXPIRED" }),
    }),
  );
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");
  await expect(result(page)).toContainText("Compensa");
});

test("opções avançadas: comissão sobre o frete menos descontos", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");
  await page.getByText("Mais opções", { exact: true }).click();
  await fill(page, "Descontos já combinados (R$)", "300");
  await page.getByLabel("Base da comissão", { exact: true }).selectOption("net");
  // comissão de 13% sobre 9.760 = 1.268,80 ; resultado 10.060 - 300 - 2.308,60 - 450 - 1.080 - 1.268,80
  await expect(result(page)).toContainText("R$ 4.652,60");
});

test("a tela cabe no aparelho e o resumo fica à vista no celular", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "não pode haver rolagem horizontal").toBeLessThanOrEqual(1);

  if (isMobile(page)) {
    const bar = page.getByTestId("offer-summary-bar");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Compensa");
    await expect(bar).toContainText("R$ 4.913,60");
    const box = await bar.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    // o resumo não cobre a navegação de baixo
    const navBox = await page.getByRole("navigation", { name: "Navegação mobile" }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(navBox!.y + 1);
  } else {
    await expect(page.getByTestId("offer-summary-bar")).toBeHidden();
  }
});

test("o menu de baixo do celular mostra todos os itens inteiros, sem rolar", async ({ page }) => {
  test.skip(!isMobile(page), "menu de baixo só existe no celular");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navegação mobile" });
  const buttons = await nav.getByRole("button").evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      return { label: el.textContent, left: box.left, right: box.right, clipped: el.scrollWidth > el.clientWidth };
    }),
  );
  const width = page.viewportSize()!.width;
  expect(buttons.map((b) => b.label)).toEqual(["Painel", "Frete", "Viagens", "Financeiro", "Rotas", "Clientes", "Admin"]);
  for (const b of buttons) {
    expect(b.left, `${b.label} cortado à esquerda`).toBeGreaterThanOrEqual(0);
    expect(b.right, `${b.label} cortado à direita`).toBeLessThanOrEqual(width);
    expect(b.clipped, `texto de ${b.label} cortado`).toBe(false);
  }
});


async function readyOffer(page: Page, freight = "10.060") {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", freight);
}

test("custo fixo por dia em branco só avisa: o dono ainda não sabe e a análise não trava", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Custo fixo por dia (R$/dia)", "");
  await fill(page, "Valor do frete (R$)", "10.060");
  const card = result(page);
  await expect(card).toContainText("Custo fixo por dia não informado");
  await expect(card).toContainText("ainda não entrou na conta");
  await expect(card).not.toContainText("Resultado provisório");
  await expect(card).toContainText("Compensa");
  await fill(page, "Custo fixo por dia (R$/dia)", "0");
  await expect(card).not.toContainText("Custo fixo por dia não informado");
});

test("custo fixo por dia entra pelos dias da viagem e mostra o resultado por dia", async ({ page }) => {
  await readyOffer(page);
  await fill(page, "Custo fixo por dia (R$/dia)", "500");
  await expect(result(page)).toContainText("Falta a duração da viagem em dias");
  await fill(page, "Duração prevista (dias)", "1,5");
  const card = result(page);
  await expect(card).not.toContainText("Falta a duração");
  await expect(card).toContainText("R$ 4.163,60");
  await expect(card).toContainText("R$ 750,00");
  await expect(card).toContainText("R$ 2.775,73");
});

test("vale-pedágio do contratante não é custo seu e pede conferência", async ({ page }) => {
  await readyOffer(page);
  await expect(result(page)).toContainText("R$ 4.913,60");
  await page.getByLabel("Quem paga o pedágio?", { exact: true }).selectOption("contractor");
  const card = result(page);
  await expect(card).toContainText("R$ 5.363,60");
  await expect(card).toContainText("Confira se o valor cobre a rota inteira");
  await fill(page, "Pedágio (R$)", "");
  await expect(card).not.toContainText("O pedágio ainda não foi conferido");
  await expect(card).not.toContainText("Resultado provisório");
});

test("ARLA 32 só entra quando o caminhão usa e pede consumo e preço", async ({ page }) => {
  await readyOffer(page);
  await expect(page.getByLabel("ARLA 32: consumo (% do diesel)", { exact: true })).toBeHidden();
  await page.getByLabel("Meu caminhão usa ARLA 32", { exact: true }).check();
  await expect(result(page)).toContainText("Falta o consumo ou o preço do ARLA 32");
  await fill(page, "ARLA 32: consumo (% do diesel)", "5");
  await fill(page, "Preço do ARLA 32 (R$/L)", "3,5");
  const card = result(page);
  await expect(card).not.toContainText("Falta o consumo ou o preço do ARLA 32");
  await expect(card).toContainText("R$ 4.854,10");
  await expect(card).toContainText("R$ 59,50");
  await expect(card).toContainText("17 L");
});

test("piso da ANTT com os coeficientes informados compara com o frete", async ({ page }) => {
  await readyOffer(page);
  await expect(result(page)).toContainText("Piso mínimo da ANTT não calculado");
  await page.getByText("Mais opções", { exact: true }).click();
  await fill(page, "CCD do piso ANTT (R$/km)", "5,2177");
  await expect(page.getByText("Informe o CC junto com o CCD.")).toBeVisible();
  await fill(page, "CC do piso ANTT (R$)", "541,86");
  const card = result(page);
  await expect(card).not.toContainText("Piso mínimo da ANTT não calculado");
  await expect(card).toContainText("R$ 3.672,48");
  await expect(card).toContainText("R$ 6.387,52 acima do piso");
  await fill(page, "Valor do frete (R$)", "3.000");
  await expect(card).toContainText("abaixo do piso mínimo da ANTT");
  await expect(card).toContainText("R$ 672,48 abaixo do piso");
});

test("folga do diesel mostra até quanto ele pode subir", async ({ page }) => {
  await readyOffer(page);
  const card = result(page);
  await expect(card).toContainText("R$ 15,32");
  await expect(card).toContainText("mais 126%");
  await expect(card).toContainText("R$ 21,24");
  await expect(card).toContainText("mais 213%");
  await fill(page, "Valor do frete (R$)", "5.000");
  await expect(card).toContainText("Já não cumpre a sua meta");
  await expect(card).toContainText("R$ 8,29");
  await expect(card).toContainText("mais 22%");
  await fill(page, "Valor do frete (R$)", "3.000");
  await expect(card).not.toContainText("mais 22%");
});

test("adiantamento e prazo mostram o dinheiro seu necessário e o custo de esperar", async ({ page }) => {
  await readyOffer(page);
  await expect(result(page)).toContainText("O adiantamento cobre as despesas da estrada");
  await page.getByText("Mais opções", { exact: true }).click();
  await expect(page.getByLabel("Adiantamento (%)", { exact: true })).toHaveValue("80");
  await expect(page.getByLabel("Prazo para receber o saldo (dias)", { exact: true })).toHaveValue("0");
  await fill(page, "Adiantamento (%)", "0");
  await expect(result(page)).toContainText("R$ 2.758,60");
  await fill(page, "Adiantamento (%)", "20");
  await fill(page, "Prazo para receber o saldo (dias)", "30");
  await fill(page, "Custo do seu dinheiro (% ao mês)", "3");
  const card = result(page);
  await expect(card).toContainText("R$ 746,60");
  await expect(card).toContainText("R$ 8.048,00");
  await expect(card).toContainText("R$ 241,44");
  await expect(card).toContainText("R$ 4.672,16");
  await fill(page, "Prazo para receber o saldo (dias)", "");
  await expect(card).toContainText("Falta o prazo para receber o saldo");
});

test("compensa, mas o prazo de pagamento tira a margem da meta", async ({ page }) => {
  await readyOffer(page, "6.000");
  await page.getByText("Mais opções", { exact: true }).click();
  await fill(page, "Adiantamento (%)", "0");
  await fill(page, "Prazo para receber o saldo (dias)", "60");
  await fill(page, "Custo do seu dinheiro (% ao mês)", "3");
  const card = result(page);
  await expect(card).toContainText("Compensa");
  await expect(card).toContainText("depois do custo de esperar o saldo");
  await expect(card).toContainText("17,02%");
});


// ---------- modo rápido: poucos números, consumo médio e custo por km que já inclui tudo ----------
// Frete R$ 10.060, 600 km carregado + 120 km vazio, 2,12 km/L, diesel R$ 6,79, pedágio R$ 450,
// custo do caminhão R$ 2,00/km (tudo incluso), comissão 13%, meta 20%, custos 10% maiores no pior caso.

async function fillQuick(page: Page, freight = "10.060") {
  await fill(page, "Valor do frete (R$)", freight);
  await fill(page, "Km carregado", "600");
  await fill(page, "Km vazio (até a coleta e na volta)", "120");
  await fill(page, "Consumo médio (km/L)", "2,12");
  await fill(page, "Preço do diesel (R$/L)", "6,79");
  await fill(page, "Pedágio (R$)", "450");
  await fill(page, "Custo do caminhão por km, tudo incluso (R$/km)", "2");
  await fill(page, "Comissão do motorista (%)", "13");
  await fill(page, "Margem que você quer (%)", "20");
}

test("quem chega agora começa no modo rápido, com poucos campos", async ({ page }) => {
  await page.goto("/");
  const nav = isMobile(page)
    ? page.getByRole("navigation", { name: "Navegação mobile" })
    : page.getByRole("navigation", { name: "Navegação principal" });
  const button = nav.getByRole("button", { name: isMobile(page) ? "Frete" : "Analisar frete", exact: true });
  await expect(async () => {
    await button.click();
    await expect(page.getByRole("heading", { name: "Analisar frete", exact: true })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Rápido", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Consumo vazio (km/L)", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Custo fixo por dia (R$/dia)", { exact: true })).toBeHidden();
  await expect(page.getByText("Mais opções", { exact: true })).toBeHidden();
});

test("modo rápido: frete que compensa com folga mostra o pior caso", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page);
  const card = result(page);
  await expect(card).toContainText("Compensa");
  await expect(card).toContainText("R$ 4.556,16");
  await expect(card).toContainText("45,29%");
  await expect(card).not.toContainText("Resultado provisório");
  await expect(card).toContainText("Com folga");
  await expect(card).toContainText("custos 10% maiores");
  await expect(card).toContainText("R$ 4.136,56");
  await expect(card).toContainText("41,12%");
  await expect(card).toContainText("R$ 4.823,03");
  await expect(card).toContainText("R$ 6.262,75");
});

test("modo rápido: compensa, mas apertado quando os custos subindo 10% derrubam a margem", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "6.500");
  const card = result(page);
  await expect(card).toContainText("Compensa");
  await expect(card).toContainText("22,45%");
  await expect(card).toContainText("Apertado");
  await expect(card).toContainText("Compensa, mas fica apertado se os custos subirem");
  await expect(card).toContainText("15,99%");
  await expect(card).toContainText("R$ 1.039,36");
  await fill(page, "Valor do frete (R$)", "6.900");
  await expect(card).toContainText("Com folga");
});

test("modo rápido: abaixo da meta e prejuízo, sempre com o pior caso à vista", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "5.000");
  await expect(result(page)).toContainText("Abaixo da sua meta");
  await expect(result(page)).toContainText("-R$ 265,64");
  await fill(page, "Valor do frete (R$)", "3.000");
  await expect(result(page)).toContainText("Dá prejuízo");
  await expect(result(page)).toContainText("-R$ 1.586,04");
  await expect(result(page)).not.toContainText("Com folga");
  await expect(result(page)).not.toContainText("Apertado");
});

test("modo rápido: o que falta vira pendência, não zero", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page);
  await fill(page, "Consumo médio (km/L)", "");
  await expect(result(page)).toContainText("Falta o consumo (km/L) de um trecho");
  await expect(result(page)).toContainText("Resultado provisório");
  await fill(page, "Consumo médio (km/L)", "2,12");
  await fill(page, "Custo do caminhão por km, tudo incluso (R$/km)", "");
  await expect(result(page)).toContainText("O custo por km do caminhão");
  await expect(result(page)).toContainText("Resultado provisório");
});

test("modo rápido: ajuda para descobrir o custo por km a partir do ano", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page);
  await page.getByText("Não sei meu custo por km", { exact: true }).click();
  await fill(page, "Gasto no ano com parcela, seguro, IPVA, pneus e manutenção (R$)", "150.000");
  await fill(page, "Km rodados no ano", "100.000");
  await expect(page.getByText("R$ 1,50 por km", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Usar esse valor", exact: true }).click();
  await expect(page.getByLabel("Custo do caminhão por km, tudo incluso (R$/km)", { exact: true })).toHaveValue("1,50");
});

test("os dois modos não se misturam e o modo escolhido fica guardado", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page);
  const card = result(page);
  await expect(card).toContainText("R$ 4.556,16");

  // no detalhado há outros campos; o que se preenche lá não mexe no rápido
  await page.getByRole("button", { name: "Detalhado", exact: true }).click();
  await expect(page.getByLabel("Consumo vazio (km/L)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toBeHidden();
  await fill(page, "Custo fixo por dia (R$/dia)", "500");
  await fill(page, "Duração prevista (dias)", "3");
  await page.getByRole("button", { name: "Rápido", exact: true }).click();
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toHaveValue("2,12");
  await expect(card).toContainText("R$ 4.556,16");

  // o modo e os números do caminhão ficam guardados neste aparelho
  await page.getByRole("button", { name: "Detalhado", exact: true }).click();
  await page.reload();
  await openOffer(page, "quick");
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toHaveValue("2,12");
  await expect(page.getByLabel("Custo do caminhão por km, tudo incluso (R$/km)", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Km carregado", { exact: true })).toHaveValue("");
});

test("modo rápido: vale-pedágio e rota sem pedágio", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page);
  await page.getByLabel("Quem paga o pedágio?", { exact: true }).selectOption("contractor");
  await expect(result(page)).toContainText("R$ 5.006,16");
  await expect(result(page)).toContainText("Confira se o valor cobre a rota inteira");
});

test("o resumo fixo do celular também avisa quando compensa mas está apertado", async ({ page }) => {
  test.skip(!isMobile(page), "o resumo fixo só existe no celular");
  await openOffer(page, "quick");
  await fillQuick(page, "6.500");
  const bar = page.getByTestId("offer-summary-bar");
  await expect(bar).toContainText("apertado");
  await expect(bar).toContainText("R$ 1.458,96");
  await fill(page, "Valor do frete (R$)", "6.900");
  await expect(bar).not.toContainText("apertado");
});

// ---------- comentários: simples de usar, mas explicando o que gera dúvida ----------

test("o app explica o que é o frete, em palavras simples", async ({ page }) => {
  await openOffer(page, "quick");
  const help = page.locator("details", { hasText: "Entenda o frete" });
  await help.getByText("Entenda o frete", { exact: true }).click();
  await expect(help).toContainText("o valor que o contratante paga");
  await expect(help).toContainText("por tonelada");
  await expect(help).toContainText("valor fechado");
  await expect(help).toContainText("peso carregado");
  await expect(help).toContainText("peso que vale para cobrar");
  await expect(help).toContainText("80%");
  await expect(help).toContainText("20% na descarga");
  await expect(help).toContainText("O frete tem que pagar");
  await expect(help).toContainText("Se a volta é vazia");
  await expect(help).toContainText("vale-pedágio");
});

test("modo rápido: comentário do que entra no custo por km", async ({ page }) => {
  await openOffer(page, "quick");
  const help = page.locator("details", { hasText: "O que entra no custo por km?" });
  await help.getByText("O que entra no custo por km?", { exact: true }).click();
  await expect(help).toContainText("parcela, seguro, IPVA, pneus e manutenção");
  await expect(help).toContainText("Não entra");
  await expect(help).toContainText("diesel");
  await expect(help).toContainText("comissão");
});

test("modo detalhado: comentário do que é o custo fixo e como achar o valor por dia", async ({ page }) => {
  await openOffer(page);
  const help = page.locator("details", { hasText: "O que é o custo fixo?" });
  await help.getByText("O que é o custo fixo?", { exact: true }).click();
  await expect(help).toContainText("mesmo com o caminhão parado");
  await expect(help).toContainText("parcela");
  await expect(help).toContainText("depreciação");
  await expect(help).toContainText("Não entra");
  await expect(help).toContainText("pneus e manutenção");
  await expect(help).toContainText("dias do mês em que o caminhão trabalha");
});

test("a margem e os números do resultado vêm explicados", async ({ page }) => {
  await openOffer(page, "quick");
  await expect(page.getByText("Quem define é o dono.", { exact: false })).toBeVisible();
  await fillQuick(page, "10.060");
  const card = result(page);
  await expect(card).toContainText("frete ÷ todos os km, vazio e carregado");
  await expect(card).toContainText("o que sobra depois de todos os custos");
  await expect(card).toContainText("O menor frete em que você não perde dinheiro");
  await expect(card).toContainText("O frete que deixa a margem que você quer");
});

test("a volta vazia pesa no resultado e o app mostra isso", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "10.060");
  await expect(result(page)).toContainText("R$ 4.556,16");
  await fill(page, "Km vazio (até a coleta e na volta)", "720");
  await expect(result(page)).toContainText("R$ 1.434,46");
  await expect(result(page)).toContainText("Abaixo da sua meta");
});


// ---------- pagamento: 80% logo no início e 20% na descarga ----------

test("modo rápido: 80% do frete cai no início e o adiantamento cobre as despesas da estrada", async ({ page }) => {
  await openOffer(page, "quick");
  await expect(page.getByLabel("Adiantamento (%)", { exact: true })).toHaveValue("80");
  await fillQuick(page, "10.060");
  const card = result(page);
  await expect(card).toContainText("R$ 8.048,00");
  await expect(card).toContainText("R$ 2.012,00");
  await expect(card).toContainText("na descarga");
  await expect(card).toContainText("O adiantamento cobre as despesas da estrada");
  // o pagamento não muda o lucro, só o dinheiro que sai do bolso
  await expect(card).toContainText("R$ 4.556,16");
});

test("modo rápido: sem adiantamento o dono banca diesel e pedágio", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "10.060");
  await fill(page, "Adiantamento (%)", "0");
  const card = result(page);
  await expect(card).toContainText("R$ 2.756,04");
  await expect(card).not.toContainText("O adiantamento cobre as despesas da estrada");
  await fill(page, "Adiantamento (%)", "20");
  await expect(card).toContainText("R$ 744,04");
  await expect(card).toContainText("R$ 2.012,00");
  await expect(card).toContainText("R$ 8.048,00");
  await expect(card).toContainText("R$ 4.556,16");
});

test("o adiantamento escolhido fica guardado neste aparelho", async ({ page }) => {
  await openOffer(page, "quick");
  await fill(page, "Adiantamento (%)", "50");
  await page.reload();
  await openOffer(page, "quick");
  await expect(page.getByLabel("Adiantamento (%)", { exact: true })).toHaveValue("50");
});

// ---------- eixos do conjunto e referência da ANTT ----------

test("eixos: o padrão é 9 e a referência da ANTT acompanha o número de eixos", async ({ page }) => {
  await openOffer(page, "quick");
  const axles = page.getByLabel("Eixos do conjunto", { exact: true });
  await expect(axles).toHaveValue("9");
  await expect(page.getByRole("button", { name: "Usar a referência da ANTT (1,70 km/L)", exact: true })).toBeVisible();
  for (const [value, text] of [["6", "2,10"], ["7", "1,90"], ["3", "3,50"], ["2", "4,50"]] as const) {
    await axles.selectOption(value);
    await expect(page.getByRole("button", { name: `Usar a referência da ANTT (${text} km/L)`, exact: true })).toBeVisible();
  }
  // a ANTT não tem referência para 8 eixos: o app não inventa
  await axles.selectOption("8");
  await expect(page.getByRole("button", { name: /Usar a referência da ANTT/ })).toBeHidden();
  await expect(page.getByText("A ANTT não tem referência para 8 eixos", { exact: false })).toBeVisible();
});

test("eixos: a referência preenche o consumo, com o aviso de que não é o consumo do caminhão", async ({ page }) => {
  await openOffer(page, "quick");
  await expect(page.getByText("pesquisa de 2019", { exact: false })).toBeVisible();
  await expect(page.getByText("não é o consumo do seu caminhão", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Usar a referência da ANTT (1,70 km/L)", exact: true }).click();
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toHaveValue("1,70");
});

test("eixos, modo detalhado: a referência vai só para o carregado; o vazio fica para medir", async ({ page }) => {
  await openOffer(page);
  await page.getByRole("button", { name: "Usar a referência da ANTT (1,70 km/L)", exact: true }).click();
  await expect(page.getByLabel("Consumo carregado (km/L)", { exact: true })).toHaveValue("1,70");
  await expect(page.getByLabel("Consumo vazio (km/L)", { exact: true })).toHaveValue("");
  await expect(page.getByText("Para o trecho vazio, meça o seu consumo", { exact: false })).toBeVisible();
});

test("o número de eixos escolhido fica guardado neste aparelho", async ({ page }) => {
  await openOffer(page, "quick");
  await page.getByLabel("Eixos do conjunto", { exact: true }).selectOption("7");
  await page.reload();
  await openOffer(page, "quick");
  await expect(page.getByLabel("Eixos do conjunto", { exact: true })).toHaveValue("7");
});


// ---------- medir o consumo pelo odômetro ----------

async function openMeasure(page: Page) {
  await page.getByText("Medir meu consumo (odômetro e litros)", { exact: true }).click();
  await expect(page.getByLabel("Odômetro (km)", { exact: true })).toBeVisible();
}

async function addFuel(page: Page, odometer: string, liters: string, full: boolean, state: "loaded" | "empty") {
  await fill(page, "Odômetro (km)", odometer);
  await fill(page, "Litros abastecidos", liters);
  const box = page.getByLabel("Encheu o tanque até o máximo", { exact: true });
  if (full) await box.check();
  else await box.uncheck();
  await page.getByLabel("Como foi o trecho até aqui", { exact: true }).selectOption(state);
  await page.getByRole("button", { name: "Adicionar abastecimento", exact: true }).click();
}

// 4 ciclos de tanque cheio a tanque cheio: 2 carregados (1.200 km, 630 L), 1 vazio (600 km, 240 L), 1 misto (600 km, 220 L)
async function addExampleFuel(page: Page) {
  await addFuel(page, "100.000", "400", true, "loaded");
  await addFuel(page, "100.600", "300", true, "loaded");
  await addFuel(page, "101.000", "160", false, "empty");
  await addFuel(page, "101.200", "80", true, "empty");
  await addFuel(page, "101.800", "330", true, "loaded");
  await addFuel(page, "102.100", "100", false, "loaded");
  await addFuel(page, "102.400", "120", true, "empty");
}

const measured = (page: Page) => page.getByTestId("consumption-report");

test("medir consumo: explica como fazer e não inventa nada sem dois tanques cheios", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  const box = page.locator("details", { hasText: "Medir meu consumo (odômetro e litros)" });
  await expect(box).toContainText("tanque até o máximo");
  await expect(measured(page)).toContainText("Ainda não dá para medir");
  await addFuel(page, "100.000", "400", true, "loaded");
  await expect(measured(page)).toContainText("Ainda não dá para medir");
});

test("medir consumo: carregado, vazio e misto separados, a partir do odômetro e dos litros", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addExampleFuel(page);
  const report = measured(page);
  await expect(report).toContainText("Carregado");
  await expect(report).toContainText("1,90 km/L");
  await expect(report).toContainText("2 ciclos");
  await expect(report).toContainText("1.200 km");
  await expect(report).toContainText("Vazio");
  await expect(report).toContainText("2,50 km/L");
  await expect(report).toContainText("1 ciclo");
  await expect(report).toContainText("Misto");
  await expect(report).toContainText("2,73 km/L");
  await expect(report).toContainText("Geral");
  await expect(report).toContainText("2,20 km/L");
});

test("medir consumo, modo detalhado: usa o carregado e o vazio medidos", async ({ page }) => {
  await openOffer(page);
  await openMeasure(page);
  await addExampleFuel(page);
  await page.getByRole("button", { name: "Usar no cálculo", exact: true }).click();
  await expect(page.getByLabel("Consumo carregado (km/L)", { exact: true })).toHaveValue("1,90");
  await expect(page.getByLabel("Consumo vazio (km/L)", { exact: true })).toHaveValue("2,50");
});

test("medir consumo, modo rápido: média da viagem com o vazio e o carregado do jeito que ela é", async ({ page }) => {
  await openOffer(page, "quick");
  await fill(page, "Km carregado", "600");
  await fill(page, "Km vazio (até a coleta e na volta)", "120");
  await openMeasure(page);
  await addExampleFuel(page);
  await page.getByRole("button", { name: "Usar no cálculo", exact: true }).click();
  // 600 km a 1,90 e 120 km a 2,50: 720 km em 363,8 L = 1,98 km/L
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toHaveValue("1,98");
  await expect(page.getByText("Média desta viagem", { exact: false })).toBeVisible();
});

test("medir consumo, modo rápido sem a distância da viagem usa a média geral", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addExampleFuel(page);
  await page.getByRole("button", { name: "Usar no cálculo", exact: true }).click();
  await expect(page.getByLabel("Consumo médio (km/L)", { exact: true })).toHaveValue("2,20");
  await expect(page.getByText("Média geral das suas medidas", { exact: false })).toBeVisible();
});

test("medir consumo: números errados são recusados com aviso", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addFuel(page, "100.000", "400", true, "loaded");
  await addFuel(page, "100.000", "300", true, "loaded");
  await expect(page.getByText("mesmo odômetro", { exact: false })).toBeVisible();
  await fill(page, "Odômetro (km)", "100.500");
  await fill(page, "Litros abastecidos", "");
  await page.getByRole("button", { name: "Adicionar abastecimento", exact: true }).click();
  await expect(page.getByText("Informe o odômetro e os litros", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(1);
});

test("medir consumo: rendimento fora do normal é avisado", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addFuel(page, "100.000", "400", true, "loaded");
  await addFuel(page, "100.600", "1", true, "loaded");
  await expect(measured(page)).toContainText("fora do normal");
});

test("medir consumo: dá para remover um abastecimento e os registros ficam guardados neste aparelho", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addExampleFuel(page);
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(7);
  await page.getByRole("button", { name: "Remover abastecimento 7", exact: true }).click();
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(6);
  await expect(measured(page)).not.toContainText("Misto");

  await page.reload();
  await openOffer(page, "quick");
  await openMeasure(page);
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(6);
  await expect(measured(page)).toContainText("1,90 km/L");
});

// ---------- medições guardadas no banco ----------

test("medir consumo: as medições ficam no banco e voltam mesmo sem nada guardado no aparelho", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addExampleFuel(page);
  await expect(page.getByTestId("fuel-status")).toContainText("Salvo na sua conta");
  const saved = await (await page.request.get("/api/fuel")).json();
  expect(saved.records).toHaveLength(7);

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await openOffer(page, "quick", { keepFuel: true });
  await openMeasure(page);
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(7);
  await expect(measured(page)).toContainText("1,90 km/L");
});

test("medir consumo: remover tira também do banco", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addExampleFuel(page);
  await expect(page.getByTestId("fuel-status")).toContainText("Salvo na sua conta");
  await page.getByRole("button", { name: "Remover abastecimento 7", exact: true }).click();
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(6);
  await expect.poll(async () => (await (await page.request.get("/api/fuel")).json()).records.length).toBe(6);
});

test("medir consumo: sem conexão com o banco guarda no aparelho, avisa e envia depois", async ({ page }) => {
  await page.route("**/api/fuel", (route) => route.abort());
  await openOffer(page, "quick");
  await openMeasure(page);
  await addFuel(page, "100.000", "400", true, "loaded");
  await addFuel(page, "100.600", "300", true, "loaded");
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(2);
  await expect(page.getByTestId("fuel-status")).toContainText("só neste aparelho");
  expect((await (await page.request.get("/api/fuel")).json()).records).toHaveLength(0);

  await page.unroute("**/api/fuel");
  await page.reload();
  await openOffer(page, "quick", { keepFuel: true });
  await openMeasure(page);
  await expect(page.getByTestId("fuel-status")).toContainText("Salvo na sua conta");
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(2);
  expect((await (await page.request.get("/api/fuel")).json()).records).toHaveLength(2);
});

test("medir consumo: se não deu para apagar no banco, o abastecimento continua na lista", async ({ page }) => {
  await openOffer(page, "quick");
  await openMeasure(page);
  await addFuel(page, "100.000", "400", true, "loaded");
  await expect(page.getByTestId("fuel-status")).toContainText("Salvo na sua conta");
  await page.route("**/api/fuel?id=*", (route) => route.abort());
  await page.getByRole("button", { name: "Remover abastecimento 1", exact: true }).click();
  await expect(page.getByText("Não consegui apagar agora")).toBeVisible();
  await expect(page.getByRole("button", { name: /Remover abastecimento/ })).toHaveCount(1);
});

// ---------- perfil fiscal e retenções estimadas ----------
// Autônomo (pessoa física) contratado por empresa: INSS 11% e SEST/SENAT 2,5%, ambos sobre 20% do frete bruto (2,7%).

test("retenções: por padrão aparecem como estimativa e não mudam o resultado", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "10.060");
  const card = result(page);
  await expect(card).toContainText("Retenções estimadas");
  await expect(card).toContainText("R$ 271,62");
  await expect(card).toContainText("R$ 221,32");
  await expect(card).toContainText("R$ 50,30");
  await expect(card).toContainText("Se a empresa reter INSS e SEST/SENAT");
  await expect(card).toContainText("o resultado seria R$ 4.284,54");
  await expect(card).toContainText("42,59%");
  await expect(card).toContainText("R$ 4.556,16");
  await expect(card).toContainText("45,29%");
});

test("retenções: contar no resultado muda o resultado, o frete mínimo e o aviso", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "10.060");
  await page.getByLabel("Contar as retenções estimadas no resultado", { exact: true }).check();
  const card = result(page);
  await expect(card).toContainText("R$ 4.284,54");
  await expect(card).toContainText("42,59%");
  await expect(card).toContainText("R$ 4.977,51");
  await expect(card).toContainText("R$ 6.525,72");
  await expect(card).toContainText("Já está contado no resultado");
  await expect(card).not.toContainText("Se a empresa reter INSS e SEST/SENAT");
});

test("retenções: contar pode mudar a decisão do frete", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "6.500");
  await expect(result(page)).toContainText("Compensa");
  await expect(result(page)).toContainText("22,45%");
  await page.getByLabel("Contar as retenções estimadas no resultado", { exact: true }).check();
  await expect(result(page)).toContainText("Abaixo da sua meta");
  await expect(result(page)).toContainText("19,75%");
  await page.getByLabel("Contar as retenções estimadas no resultado", { exact: true }).uncheck();
  await expect(result(page)).toContainText("Compensa");
});

test("perfil: pessoa física paga, MEI e empresa não ganham estimativa inventada", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "10.060");
  await page.getByLabel("Quem paga o frete", { exact: true }).selectOption("pessoa_fisica");
  await expect(result(page)).toContainText("Frete pago por pessoa física: não há retenção");
  await expect(result(page)).not.toContainText("Retenções estimadas");
  await page.getByLabel("Quem paga o frete", { exact: true }).selectOption("empresa");
  await page.getByLabel("Você é", { exact: true }).selectOption("mei");
  await expect(result(page)).toContainText("MEI: não encontramos regra de retenção");
  await expect(result(page)).not.toContainText("Retenções estimadas");
  await page.getByLabel("Você é", { exact: true }).selectOption("empresa");
  await expect(result(page)).toContainText("Empresa: as retenções dependem do regime");
  await expect(result(page)).not.toContainText("R$ 271,62");
  await expect(result(page)).toContainText("R$ 4.556,16");
});

test("perfil: vale também no modo detalhado e fica guardado neste aparelho", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Valor do frete (R$)", "10.060");
  await expect(page.getByLabel("Você é", { exact: true })).toHaveValue("autonomo");
  await expect(result(page)).toContainText("Retenções estimadas");
  await page.getByLabel("Você é", { exact: true }).selectOption("mei");
  await page.getByLabel("Contar as retenções estimadas no resultado", { exact: true }).check();
  await page.reload();
  await openOffer(page);
  await expect(page.getByLabel("Você é", { exact: true })).toHaveValue("mei");
  await expect(page.getByLabel("Contar as retenções estimadas no resultado", { exact: true })).toBeChecked();
});

test("retenções contadas entram no passo a passo do resultado", async ({ page }) => {
  await openOffer(page, "quick");
  await fillQuick(page, "10.060");
  await page.getByLabel("Contar as retenções estimadas no resultado", { exact: true }).check();
  const steps = page.locator("div", { hasText: "Como chegamos nesse resultado" }).last();
  await expect(steps).toContainText("Retenções estimadas");
  await expect(steps).toContainText("R$ 271,62");
});
