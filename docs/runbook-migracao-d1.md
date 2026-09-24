# Runbook — Migração do D1 em produção (ChatGPT Sites)

Repositório: `itronicrioverde-pixel/MVPcaminhao-2` · Projeto Sites: `.openai/hosting.json` (`project_id appgprj_6aa196650888819199021c45e2440347`, binding lógico D1 `DB`, R2 `BUCKET`)

## Estado de verificação

- **A aplicação de migrações no D1 de produção não foi observada nem confirmada.** O build empacota `dist/.openai/drizzle/` (7 migrações + `meta/_journal.json`) junto com `hosting.json`, um fato observável no repositório; mas **não há evidência verificável de que o pipeline do Sites aplica essas migrações em produção**. A etapa de aplicação em produção está **pendente de verificação**, e nenhum passo deste runbook presume que ela ocorre automaticamente.
- Execução prevista para o **proprietário do site**, que tem acesso ao console (`chatgpt.com/sites`) e à sessão autenticada.

## Premissas verificadas (evidência no repositório)

- `dist/server/wrangler.json` usa `database_id` **placeholder** (`00000000-0000-4000-8000-000000000000`): o D1/R2 reais são injetados pelo controle do ChatGPT Sites somente na publicação. **`wrangler d1 execute DB --remote` NÃO é aplicável/confirmado para produção neste projeto.** Os comandos abaixo usam apenas `--local` (banco de ensaio).
- O build empacota `dist/.openai/drizzle/` (7 migrações + `meta/_journal.json`) junto com `hosting.json`. Isso **documenta as migrações no artefato publicado**, mas não demonstra o mecanismo de aplicação em produção.
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

### Objetos e colunas esperados por migração

| Migração | Objetos/colunas esperados | Sondagem |
|---|---|---|
| `0000_narrow_blazing_skull` | `trips`, `expenses` | ambas as tabelas existem |
| `0001_simple_the_order` | `idx_trips_owner_date`, `idx_expenses_owner_date` | index_list mostra os dois índices |
| `0002_sticky_purple_man` | `companies`, `revenues`, `idx_revenues_owner_date`, `trips.extra_items`, `trips.axles` | tabelas existem; o índice existe; `table_info('trips')` contém `extra_items` **e** `axles` |
| `0003_tough_pride` | `route_limits` | tabela existe |
| `0004_melodic_stryfe` | `trips.driver_percent` | coluna presente |
| `0005_normal_turbo` | `trips.freight_per_ton` | coluna presente |
| `0006_slimy_mandroid` | `trips.loss_alert_percent` | coluna presente |

## 3. Decisão por migração (nunca pular nem repetir arquivos automaticamente)

Ordem canônica = ordem do `drizzle/meta/_journal.json` (`0000` → `0006`). **Nenhuma migração é idempotente** (CREATE TABLE/INDEX e ALTER ADD falham se repetidas). Antes de aplicar um arquivo, verificar **todos** os objetos e colunas esperados da tabela acima (não apenas um):

- **Nenhum objeto/coluna da migração aplicado**: aplicar conforme o procedimento validado (seção 5), somente.
- **Todos os objetos/colunas aplicados**: registrar a migração como **concluída** (não reaplicar).
- **Aplicação parcial ou ordem inconsistente** (parte dos objetos existe, migrações anteriores faltando, ou objetos de arquivos posteriores presentes): **PARAR**, diagnosticar a sondagem (seção 2) e usar a recuperação verificada (seção 7). **Não pular e não repetir o arquivo automaticamente** — a regra de uma migração com vários comandos (ex.: `0002`) não pode ser tratada por um único probe.

## 4. Ponto de recuperação antes da mudança

1. Backup gerenciado pela plataforma (se disponível no console do site) — registrar antes do primeiro deploy com migrações. **Até existir um procedimento confirmado na plataforma, o backup integral/restauração integral do D1 permanecem pendentes.**
2. Export do app (por usuário): Admin → backup (JSON com records + empresa + logo em base64 de **um** usuário), guardado fora do site. **Importante: o backup JSON do app é POR USUÁRIO e não equivale a um backup integral do D1** — não cobre outros usuários, estado de índices nem o `route_limits`; serve apenas como ponto auxiliar de recuperação.
3. Anotar o SHA da versão salva que contém as migrações (o Sites associa a versão ao commit do build).

## 5. Ensaio em banco separado (obrigatório antes de publicar)

Usa um D1 **local separado** (`.wrangler/scratch`), com o artefato já buildado (`dist/server/wrangler.json`). Comando comprovadamente aplicável (mesma forma do README e de `scripts/e2e-migrate.mjs`):

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/scratch --file drizzle/0000_narrow_blazing_skull.sql
```

Repetir para `0001`…`0006` na ordem (ou em loop com `Get-ChildItem drizzle\*.sql | Sort-Object Name`). Depois, rodar as sondagens da seção 2 e conferir que **todos** os objetos/colunas por migração (tabela da seção 2) e o schema final batem com `db/schema.ts`.

O pipeline local do E2E já executa o mesmo ensaio de baseline vazio localmente: `npm run test:e2e:migrate` (o CI aplica as 7 migrações em `.wrangler/e2e`, apenas local).

## 6. Verificação após a aplicação

- Schema: sondagens da seção 2 conferindo o estado final (todos os objetos/colunas por migração).
- Dados preservados (leituras): `SELECT COUNT(*) FROM trips; SELECT COUNT(*) FROM expenses; SELECT COUNT(*) FROM revenues;` e comparação de totais (ex.: `SELECT SUM(freight) FROM trips;`) antes/depois. Na produção, usar os mesmos critérios via verificação comportamental quando a consulta direta não existir.
- Smoke funcional na versão publicada (login do proprietário): painel com métricas, criar/editar viagem, recarregar (persistência), backup/import, logo, estimativa de rota.

## 7. Recuperação se uma etapa falhar

- **Falha de DDL no meio do arquivo**: cada statement SQLite é atômico; a falha interrompe o arquivo e o que já executou permanece.
- **Diagnóstico**: sondar o esquema (seção 2) e conferir a tabela de objetos por migração para identificar o ponto exato (aplicação parcial). Regras da seção 3 valem aqui: em caso de ordem inconsistente ou aplicação parcial, **PARAR** e não pular/repetir o arquivo automaticamente.
- **Rollback**: restaurar o backup gerenciado da plataforma se existir e estiver verificado; senão, reimportar os exports do app por usuário (seção 4) somente como auxiliar. Para o código, republicar a última boa **versão salva**. Backup/restauração integrais permanecem **pendentes até existir procedimento confirmado na plataforma** (seção 4).
- **Observação**: nenhuma migração desta base é destrutiva para dados existentes (CREATE + ALTER ADD); a falha típica é "já existe" (aplicação repetida) — tratar com a sondagem completa, não com sonegação da aplicação.