# Runbook — Migração do D1 em produção (ChatGPT Sites)

Repositório: `itronicrioverde-pixel/MVPcaminhao-2` · Projeto Sites: `.openai/hosting.json` (`project_id appgprj_6aa196650888819199021c45e2440347`, binding lógico D1 `DB`, R2 `BUCKET`)

## Estado de verificação

- Aplicação de migrações no D1 de produção acontece na publicação pelo ChatGPT Sites, a partir do diretório `drizzle/` empacotado em `dist/.openai/drizzle` no build. **O passo exato do pipeline não é observável a partir do repositório: a etapa de aplicação em produção está pendente de verificação.**
- Execução prevista para o **proprietário do site**, que tem acesso ao console (`chatgpt.com/sites`) e à sessão autenticada.

## Premissas verificadas (evidência no repositório)

- `dist/server/wrangler.json` usa `database_id` **placeholder** (`00000000-0000-4000-8000-000000000000`): o D1/R2 reais são injetados pelo controle do ChatGPT Sites somente na publicação. **`wrangler d1 execute DB --remote` NÃO é aplicável/confirmado para produção neste projeto.** Os comandos abaixo usam apenas `--local` (banco de ensaio).
- O build empacota `dist/.openai/drizzle/` (7 migrações + `meta/_journal.json`) junto com `hosting.json` — é o artefato usado pelo pipeline do Sites ao publicar uma versão.
- Publicação do Sites tem duas etapas (salvar versão → publicar); cada publicação é produção.

## 1. Qual banco é o destino e como confirmar a identidade

| Alvo | Identificação | Como confirmar |
|---|---|---|
| D1 de produção (binding `DB`) | Provisionado gerenciado pelo Sites; não há id/conta no repositório | Consola do site: `chatgpt.com/sites` → site → configurações de armazenamento (mostra o D1 provisionado e o R2). No painel de revisão da versão salva, conferir as migrações listadas antes de publicar |
| D1 local (ensaios) | Miniflare com ID placeholder | `dist/server/wrangler.json` `d1_databases[0]` (`site-creator-d1`, id `00000000-0000-4000-8000-000000000000`) |

Regra: nunca declarar a identidade do D1 de produção a partir do repositório — o repositório só contém nomes lógicos.

## 2. Como consultar esquema e migrações já aplicadas

Não há tabela de controle de migrações no schema (não existe `drizzle_migrations`); o estado é inferido por sondagem de esquema.

- **Produção**: consulta direta não é comprovadamente possível a partir do repositório (sem `wrangler` de produção). Usar o painel de revisão do Sites + verificação comportamental (seção 6).
- **Ensaio local**: sondagem de leitura no banco de ensaio:

```sql
-- tabelas existentes (esperado: companies, expenses, revenues, route_limits, trips)
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- colunas de trips (incluindo extra_items, axles, driver_percent, freight_per_ton, loss_alert_percent)
PRAGMA table_info('trips');
-- índices de trips/expenses/revenues (idx_*_owner_date)
PRAGMA index_list('trips');
PRAGMA index_list('expenses');
PRAGMA index_list('revenues');
```

### Estado por migração (probes de aplicação)

| Migração | O que cria | Probe que confirma aplicação |
|---|---|---|
| `0000_narrow_blazing_skull` | `expenses`, `trips` | `trips` e `expenses` existem |
| `0001_simple_the_order` | índices `idx_*_owner_date` | index_list mostra `idx_trips_owner_date` / `idx_expenses_owner_date` |
| `0002_sticky_purple_man` | `companies`, `revenues`, índice de revenues; `trips.extra_items`, `trips.axles` | tabelas existem; `table_info('trips')` contém `extra_items` e `axles` |
| `0003_tough_pride` | `route_limits` | tabela existe |
| `0004_melodic_stryfe` | `trips.driver_percent` | coluna presente |
| `0005_normal_turbo` | `trips.freight_per_ton` | coluna presente |
| `0006_slimy_mandroid` | `trips.loss_alert_percent` | coluna presente |

## 3. Ordem de aplicação sem repetir

Ordem canônica = ordem do `drizzle/meta/_journal.json` (`0000` → `0006`). **Nenhuma migração é idempotente** (CREATE TABLE/INDEX e ALTER ADD falham se repetidas). Aplicar uma vez, na ordem, a partir de um baseline conhecido. Antes de aplicar, sondar o esquema (seção 2): qualquer probe já satisfeito (ex.: `trips.loss_alert_percent` presente) indica que a migração correspondente **já foi aplicada** — pular, nunca repetir.

## 4. Ponto de recuperação antes da mudança

1. Backup gerenciado pela plataforma (se disponível no console do site) — registrar antes do primeiro deploy com migrações.
2. Export do app (por usuário): Admin → backup (JSON com records + empresa + logo em base64), guardado fora do site.
3. Anotar o SHA da versão salva que contém as migrações (o Sites associa a versão ao commit do build).

## 5. Ensaio em banco separado (obrigatório antes de publicar)

Usa um D1 **local separado** (`.wrangler/scratch`), com o artefato já buildado (`dist/server/wrangler.json`). Comando comprovadamente aplicável (mesma forma do README e de `scripts/e2e-migrate.mjs`):

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/scratch --file drizzle/0000_narrow_blazing_skull.sql
```

Repetir para `0001`…`0006` na ordem (ou em loop com `Get-ChildItem drizzle\*.sql | Sort-Object Name`). Depois, rodar as sondagens da seção 2 e conferir que o schema final bate com `db/schema.ts`.

O pipeline local do E2E já executa o mesmo ensaio de baseline vazio automaticamente: `npm run test:e2e:migrate` (e o CI aplica as 7 migrações em `.wrangler/e2e`).

## 6. Verificação após a aplicação

- Schema: sondagens da seção 2 conferindo o estado final.
- Dados preservados (leituras): `SELECT COUNT(*) FROM trips; SELECT COUNT(*) FROM expenses; SELECT COUNT(*) FROM revenues;` e comparação de totais (ex.: `SELECT SUM(freight) FROM trips;`) antes/depois. Na produção, usar os mesmos critérios via verificação comportamental quando a consulta direta não existir.
- Smoke funcional na versão publicada (login do proprietário): painel com métricas, criar/editar viagem, recarregar (persistência), backup/import, logo, estimativa de rota.

## 7. Recuperação se uma etapa falhar

- **Falha de DDL no meio do arquivo**: cada statement SQLite é atômico; a falha interrompe o arquivo e o que já executou permanece. **Não reexecutar o arquivo cegamente.**
- **Diagnóstico**: sondar o esquema (seção 2) para identificar o ponto exato. Nenhuma migração desta base é destrutiva para dados existentes (CREATE + ALTER ADD), então perda de dados é improvável; a falha típica é "já existe" (aplicação repetida).
- **Rollback**: restaurar o backup gerenciado (se houver) e/ou reimportar os exports do app (seção 4). Para o código, republicar a última boa **versão salva** (código e migrações andam juntos na versão).
- **Falha por repetição**: se a sondagem já mostra o estado final, não aplicar a migração — a versão seguinte da plataforma já a considera aplicada.