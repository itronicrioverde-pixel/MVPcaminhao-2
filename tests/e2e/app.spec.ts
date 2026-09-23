import { expect, test, type Page } from "@playwright/test";

const ROUTE_ESTIMATE = {
  km: 480,
  toll: null,
  message: "Rota determinística usada nos testes E2E (sem serviço externo).",
};

const TRIP_A = {
  client: "Cliente E2E A",
  origin: "Rio Verde, GO",
  destination: "Doverlândia, GO",
  date: "2026-09-15",
};

const TRIP_B = {
  client: "Cliente E2E B",
  origin: "Cristalina, GO",
  destination: "Sinop, MT",
  date: "2026-09-16",
};

const INTERNAL_ERROR_BODY = {
  error: "Não foi possível concluir agora. Tente novamente.",
  code: "INTERNAL_ERROR",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/route-estimate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ROUTE_ESTIMATE),
    }),
  );
});

async function expectInViewport(locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  expect(box, "elemento precisa ter caixa delimitadora").not.toBeNull();
  const viewport = locator.page().viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x, "não deve cortar à esquerda").toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, "não deve cortar à direita").toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y, "não deve cortar acima").toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, "não deve cortar abaixo").toBeLessThanOrEqual(viewport!.height + 1);
}

async function navTo(page: Page, label: string) {
  const mobileNav = page.getByRole("navigation", { name: "Navegação mobile" });
  if (await mobileNav.isVisible().catch(() => false)) {
    await mobileNav.getByRole("button", { name: label, exact: true }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button", { name: label, exact: true })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
}

async function openCreateDialog(page: Page) {
  await page.getByRole("button", { name: "Nova viagem" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova viagem" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillTripFields(
  dialog: ReturnType<Page["getByRole"]>,
  trip: { client: string; origin: string; destination: string; date: string },
) {
  await dialog.getByLabel("Data").fill(trip.date);
  await dialog.getByLabel("Cliente").fill(trip.client);
  const origin = dialog.getByLabel("Origem / carregamento", { exact: true });
  await origin.click();
  await origin.fill(trip.origin);
  const destination = dialog.getByLabel("Destino", { exact: true });
  await destination.click();
  await destination.fill(trip.destination);
  await dialog.getByLabel("Valor do frete por tonelada (R$)").fill("250");
  await dialog.getByLabel("Peso carregado (toneladas)").fill("20");
  await dialog.getByLabel("Quilômetros").fill(String(ROUTE_ESTIMATE.km));
  await dialog.getByLabel("Valor total do abastecimento (R$)").fill("1200");
  await dialog.getByLabel("Pedágio (R$)").fill("340");
  await dialog.getByLabel("Óleo (R$)").fill("120");
}

async function saveTripDialog(dialog: ReturnType<Page["getByRole"]>) {
  const save = dialog.getByRole("button", { name: "Salvar viagem" });
  await expect(save).toBeEnabled();
  await save.click();
}

async function createTrip(page: Page, trip: { client: string; origin: string; destination: string; date: string }) {
  const dialog = await openCreateDialog(page);
  await fillTripFields(dialog, trip);
  await saveTripDialog(dialog);
  await expect(dialog).toBeHidden();
}

function metricCard(page: Page, label: string) {
  return page.locator(".metric-card").filter({ hasText: label });
}

function tripRow(page: Page, clientName: string) {
  return page
    .locator("tr:visible, article:visible")
    .filter({ hasText: clientName });
}

async function openEditDialog(page: Page, clientName: string) {
  await navTo(page, "Viagens");
  const row = tripRow(page, clientName);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Editar viagem" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar viagem" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("fluxos financeiros no navegador", () => {
  test("painel autenticado carrega com a identidade local", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await expect(metricCard(page, "Faturamento")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  });

  test("cria uma viagem e ela aparece no histórico", async ({ page }) => {
    await page.goto("/");
    await createTrip(page, { ...TRIP_A, client: "Cliente E2E Criar A" });
    await expect(page.getByText("Viagem cadastrada.")).toBeVisible();
    await navTo(page, "Viagens");
    await expect(
      tripRow(page, "Cliente E2E Criar A"),
    ).toBeVisible();
  });

  test("cria uma segunda viagem sem duplicar a primeira", async ({ page }) => {
    await page.goto("/");
    await createTrip(page, { ...TRIP_A, client: "Cliente E2E Dupla A" });
    await createTrip(page, { ...TRIP_B, client: "Cliente E2E Dupla B" });
    await navTo(page, "Viagens");
    await expect(tripRow(page, "Cliente E2E Dupla A")).toHaveCount(1);
    await expect(tripRow(page, "Cliente E2E Dupla B")).toHaveCount(1);
  });

  test("edita a viagem A e os dados são persistidos", async ({ page }) => {
    const client = "Cliente E2E Editada";
    await page.goto("/");
    await createTrip(page, { ...TRIP_A, client });
    const dialog = await openEditDialog(page, client);
    const clientInput = dialog.getByLabel("Cliente");
    await expect(clientInput).toHaveValue(client);
    await clientInput.fill(`${client} atualizado`);
    await saveTripDialog(dialog);
    await expect(page.getByText("Viagem atualizada.")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(tripRow(page, `${client} atualizado`)).toBeVisible();
  });

  test("alterar campos, cancelar e reabrir mostra os dados persistidos", async ({ page }) => {
    const client = "Cliente E2E Cancelamento";
    await page.goto("/");
    await createTrip(page, { ...TRIP_A, client });
    const dialog = await openEditDialog(page, client);
    await dialog.getByLabel("Cliente").fill("Rascunho descartado");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    const reopened = await openEditDialog(page, client);
    await expect(reopened.getByLabel("Cliente")).toHaveValue(client);
    await expect(reopened.getByLabel("Origem / carregamento")).toHaveValue(TRIP_A.origin);
    await reopened.getByRole("button", { name: "Cancelar" }).click();
  });

  test("alternar para a viagem B não herda dados da viagem A", async ({ page }) => {
    await page.goto("/");
    await createTrip(page, { ...TRIP_A, client: "Cliente E2E Alterna A" });
    await createTrip(page, { ...TRIP_B, client: "Cliente E2E Alterna B" });
    const dialogA = await openEditDialog(page, "Cliente E2E Alterna A");
    await expect(dialogA.getByLabel("Cliente")).toHaveValue("Cliente E2E Alterna A");
    await expect(dialogA.getByLabel("Origem / carregamento")).toHaveValue(TRIP_A.origin);
    await dialogA.getByRole("button", { name: "Cancelar" }).click();
    const dialogB = await openEditDialog(page, "Cliente E2E Alterna B");
    await expect(dialogB.getByLabel("Cliente")).toHaveValue("Cliente E2E Alterna B");
    await expect(dialogB.getByLabel("Origem / carregamento")).toHaveValue(TRIP_B.origin);
    await expect(dialogB.getByLabel("Cliente")).not.toHaveValue("Cliente E2E Alterna A");
    await dialogB.getByRole("button", { name: "Cancelar" }).click();
  });

  test("falha no salvamento mantém o diálogo e o rascunho", async ({ page }) => {
    let postAttempts = 0;
    await page.route("**/api/records*", (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        postAttempts += 1;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify(INTERNAL_ERROR_BODY),
        });
      }
      return route.continue();
    });
    const client = "Cliente E2E Falha";
    await page.goto("/");
    const dialog = await openCreateDialog(page);
    await fillTripFields(dialog, { ...TRIP_A, client });
    await saveTripDialog(dialog);
    await expect(page.getByText(INTERNAL_ERROR_BODY.error)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Cliente")).toHaveValue(client);
    await expect(dialog.getByLabel("Valor do frete por tonelada (R$)")).toHaveValue("250");
    expect(postAttempts).toBe(1);
  });

  test("salva no banco, falha no GET de atualização e retry não duplica", async ({ page }) => {
    let failNextGet = false;
    await page.route("**/api/records*", (route) => {
      const request = route.request();
      if (request.method() === "GET" && failNextGet) {
        failNextGet = false;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify(INTERNAL_ERROR_BODY),
        });
      }
      return route.continue();
    });
    const client = "Cliente E2E Refresh";
    await page.goto("/");
    failNextGet = true;
    await createTrip(page, { ...TRIP_A, client });
    await expect(
      page.getByText("Registro salvo, mas a tela não pôde ser atualizada"),
    ).toBeVisible();
    await navTo(page, "Viagens");
    await expect(tripRow(page, client)).toHaveCount(0);
    await page.getByRole("button", { name: "Atualizar" }).click();
    await expect(tripRow(page, client)).toHaveCount(1);
  });

  test("401 após a primeira carga mostra Entrar novamente", async ({ page }) => {
    let gets = 0;
    await page.route("**/api/records*", (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        gets += 1;
        if (gets === 2) {
          return route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "Sessão expirada.", code: "SESSION_EXPIRED" }),
          });
        }
      }
      return route.continue();
    });
    await page.goto("/");
    await expect(metricCard(page, "Faturamento")).toBeVisible();
    await createTrip(page, { ...TRIP_A, client: "Cliente E2E Sessao" });
    await expect(page.getByText(/Sessão expirada/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar novamente" })).toBeVisible();
  });

  test("HTML com status 200 em /api/records mostra erro sem quebrar", async ({ page }) => {
    await page.route("**/api/records*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>Página de erro inesperada</body></html>",
      }),
    );
    await page.goto("/");
    await expect(page.getByText("Dados indisponíveis")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova viagem" })).toBeVisible();
  });

  test("menu e navegação usam o layout desktop ou mobile sem quebrar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    const bottomNav = page.getByRole("navigation", { name: "Navegação mobile" });
    if (await bottomNav.isVisible().catch(() => false)) {
      await navTo(page, "Financeiro");
      await navTo(page, "Rotas");
      await navTo(page, "Clientes");
      await page.getByRole("button", { name: "Abrir menu" }).click();
      const side = page.getByRole("navigation", { name: "Navegação principal" });
      await expect(side.getByRole("button", { name: "Clientes" })).toBeVisible();
      await side.getByRole("button", { name: "Viagens" }).click();
      await expect(page.getByRole("heading", { name: "Viagens", exact: true })).toBeVisible();
    } else {
      await navTo(page, "Financeiro");
      await navTo(page, "Viagens");
      await navTo(page, "Admin");
    }
  });

  test("valores e botões principais não ficam cortados", async ({ page }) => {
    await page.goto("/");
    await expect(metricCard(page, "Faturamento")).toBeVisible();
    await expectInViewport(page.getByRole("button", { name: "Nova viagem" }));
    await expectInViewport(
      page.locator(".metric-card").filter({ hasText: "Faturamento" }).first(),
    );
    const dialog = await openCreateDialog(page);
    const save = dialog.getByRole("button", { name: "Salvar viagem" });
    await expect(save).toBeVisible();
    await expectInViewport(save);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
  });
});