import { expect, test, type Page } from "@playwright/test";

// Caso do documento de cálculos: 120 km vazios a 3 km/L, 600 km carregados a 2 km/L,
// diesel a R$ 6,79, pedágio R$ 450, R$ 1,50/km do caminhão, comissão 13%, meta 20%.
// Resultados esperados conferidos com o motor (lib/offer.ts):
//   R$ 10.060 compensa (R$ 4.913,60 / 48,84%), R$ 5.000 abaixo da meta, R$ 4.000 prejuízo.
//   Frete mínimo para empatar R$ 4.412,18; para a meta de 20% R$ 5.729,25.

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

async function openOffer(page: Page) {
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
  await fill(page, "Peso faturável (kg)", "50.300");
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

test("sem custo fixo informado o resultado fica provisório; zero conta como informado", async ({ page }) => {
  await openOffer(page);
  await fillTrip(page);
  await fill(page, "Custo fixo por dia (R$/dia)", "");
  await fill(page, "Valor do frete (R$)", "10.060");
  await expect(result(page)).toContainText("O custo fixo por dia");
  await expect(result(page)).toContainText("Resultado provisório");
  await fill(page, "Custo fixo por dia (R$/dia)", "0");
  await expect(result(page)).not.toContainText("Resultado provisório");
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
  await expect(result(page)).toContainText("R$ 2.758,60");
  await page.getByText("Mais opções", { exact: true }).click();
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
  await fill(page, "Prazo para receber o saldo (dias)", "60");
  await fill(page, "Custo do seu dinheiro (% ao mês)", "3");
  const card = result(page);
  await expect(card).toContainText("Compensa");
  await expect(card).toContainText("depois do custo de esperar o saldo");
  await expect(card).toContainText("17,02%");
});
