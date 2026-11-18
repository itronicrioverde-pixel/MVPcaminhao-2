import {z} from "zod";
import {apiError,errorCodes} from "@/lib/api-errors";
import {owner,db,failure} from "@/lib/records-server";

// Medições de combustível (odômetro + litros). Cada dono só enxerga as próprias.
const MAX_BATCH = 500;
const recordSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  odometerKm: z.number().int().min(0).max(5_000_000),
  litersMilli: z.number().int().min(1).max(2_000_000),
  full: z.boolean(),
  state: z.enum(["loaded", "empty"]),
}).strict();
type Row = {id: string; odometer_km: number; liters_milli: number; full: number; state: string};
const present = (r: Row) => ({id: r.id, odometerKm: r.odometer_km, litersMilli: r.liters_milli, full: r.full === 1, state: r.state});
const insertSql = "INSERT INTO fuel_records (id,owner_id,odometer_km,liters_milli,full,state) VALUES (?,?,?,?,?,?)";
// só insere se o id não estiver na lista de apagados deste dono
const insertUnlessDeletedSql = "INSERT OR IGNORE INTO fuel_records (id,owner_id,odometer_km,liters_milli,full,state) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM fuel_deleted WHERE owner_id=? AND id=?)";

/** Identificador opaco do dono, para o aparelho separar o que guarda por conta sem conhecer o id real. */
async function ownerKey(user: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fuel:${user}`));
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const bind = (user: string, r: z.infer<typeof recordSchema>) => db().prepare(insertSql).bind(r.id ?? crypto.randomUUID(), user, r.odometerKm, r.litersMilli, r.full ? 1 : 0, r.state);

export async function GET(request: Request) {
  try {
    const user = owner(request);
    const [rows, deleted] = await db().batch<Row & {id: string}>([
      db().prepare("SELECT id,odometer_km,liters_milli,full,state FROM fuel_records WHERE owner_id=? ORDER BY odometer_km").bind(user),
      db().prepare("SELECT id FROM fuel_deleted WHERE owner_id=? ORDER BY deleted_at,id").bind(user),
    ]);
    return Response.json({ownerKey: await ownerKey(user), records: rows.results.map(present), deleted: deleted.results.map((row) => row.id)});
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const user = owner(request), record = recordSchema.parse(await request.json()), id = record.id ?? crypto.randomUUID();
    try {
      const gone = await db().prepare("SELECT 1 AS found FROM fuel_deleted WHERE owner_id=? AND id=?").bind(user, id).first();
      if (gone) return apiError(409, "Esse abastecimento já foi apagado.", errorCodes.CONFLICT);
      await bind(user, {...record, id}).run();
    } catch (e) {
      if (e instanceof Error && /UNIQUE|constraint/i.test(e.message)) return apiError(409, "Já existe um abastecimento com esse odômetro.", errorCodes.CONFLICT);
      throw e;
    }
    return Response.json({id}, {status: 201});
  } catch (e) { return failure(e); }
}

// Envio em lote (primeira subida do que estava só no aparelho): o que já existe fica como está.
export async function PUT(request: Request) {
  try {
    const user = owner(request), {records} = z.object({records: z.array(recordSchema.required({id: true})).max(MAX_BATCH)}).strict().parse(await request.json());
    if (new Set(records.map(r => r.odometerKm)).size !== records.length || new Set(records.map(r => r.id)).size !== records.length) return apiError(400, "Há abastecimentos repetidos no envio.", errorCodes.INVALID_DATA);
    if (records.length === 0) return Response.json({imported: 0, skipped: 0});
    const results = await db().batch(records.map(r => db().prepare(insertUnlessDeletedSql).bind(r.id!, user, r.odometerKm, r.litersMilli, r.full ? 1 : 0, r.state, user, r.id!)));
    const imported = results.reduce((n, x) => n + (x.meta.changes ?? 0), 0);
    return Response.json({imported, skipped: records.length - imported});
  } catch (e) { return failure(e); }
}

export async function DELETE(request: Request) {
  try {
    const user = owner(request), url = new URL(request.url), id = url.searchParams.get("id");
    if (url.searchParams.get("all") === "true") {
      const [, removed] = await db().batch([
        db().prepare("INSERT OR IGNORE INTO fuel_deleted (id,owner_id) SELECT id,owner_id FROM fuel_records WHERE owner_id=?").bind(user),
        db().prepare("DELETE FROM fuel_records WHERE owner_id=?").bind(user),
      ]);
      return Response.json({deleted: removed.meta.changes ?? 0});
    }
    if (!id) return apiError(400, "Informe qual abastecimento apagar.", errorCodes.INVALID_DATA);
    const [, removed] = await db().batch([
      db().prepare("INSERT OR IGNORE INTO fuel_deleted (id,owner_id) SELECT id,owner_id FROM fuel_records WHERE owner_id=? AND id=?").bind(user, id),
      db().prepare("DELETE FROM fuel_records WHERE owner_id=? AND id=?").bind(user, id),
    ]);
    if (!removed.meta.changes) return apiError(404, "Abastecimento não encontrado.", errorCodes.NOT_FOUND);
    return Response.json({ok: true});
  } catch (e) { return failure(e); }
}
