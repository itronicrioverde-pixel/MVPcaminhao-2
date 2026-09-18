import {apiError,errorCodes} from "@/lib/api-errors";
import {db,owner,failure,records,writeRecord,tables,type Kind} from "@/lib/records-server";
import {backup,bucket,imageData} from "@/lib/backup-server";
import {backupSchema,companySchema} from "@/lib/finance";
export async function GET(r:Request){try{const user=owner(r),url=new URL(r.url);if(url.searchParams.get("action")==="snapshots"){const list=await bucket().list({prefix:`${user}/backups/`});return Response.json({items:list.objects.map(o=>({key:o.key,date:o.uploaded.toISOString()})).sort((a,b)=>b.date.localeCompare(a.date))});}if(url.searchParams.get("action")==="snapshot"){const key=url.searchParams.get("key")??"";if(!key.startsWith(`${user}/backups/`))return apiError(403,"Você não tem permissão para acessar este arquivo.",errorCodes.FORBIDDEN);const obj=await bucket().get(key);if(!obj)return apiError(404,"Cópia de segurança não encontrada.",errorCodes.NOT_FOUND);return new Response(obj.body,{headers:{"content-type":"application/json","cache-control":"no-store","content-disposition":'attachment; filename="rota-seguranca.json"'}});}if(url.searchParams.get("action")==="backup")return Response.json(await backup(user),{headers:{"content-disposition":'attachment; filename="rota-financeira-backup.json"',"cache-control":"no-store"}});return Response.json({company:(await records(user)).company});}catch(e){return failure(e);}}
export async function POST(r:Request){try{
  const user=owner(r);if(Number(r.headers.get("content-length"))>12000000)return apiError(413,"O arquivo enviado é muito grande.",errorCodes.PAYLOAD_TOO_LARGE);
  const p=await r.json() as Record<string,unknown>;
  if(p.action==="company"){const c=companySchema.parse(p);await db().prepare("INSERT INTO companies(owner_id,name,cnpj) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,cnpj=excluded.cnpj").bind(user,c.name,c.cnpj).run();return Response.json({ok:true});}
  if(p.action==="clear"){
    const all=p.scope==="all",month=String(p.month??"");
    if(!["month","all"].includes(String(p.scope)) || (!all&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) || p.confirm!==(all?"LIMPAR TODOS":month))return apiError(400,"Selecione o período e confirme a limpeza.",errorCodes.INVALID_DATA);
    const safe=await backup(user),key=`${user}/backups/${crypto.randomUUID()}.json`;await bucket().put(key,JSON.stringify(safe),{httpMetadata:{contentType:"application/json"}});
    const nextMonth=all?"":(Number(month.slice(5))===12?`${Number(month.slice(0,4))+1}-01`:`${month.slice(0,4)}-${String(Number(month.slice(5))+1).padStart(2,"0")}`)+"-01";
    const statements=([['trips','trip_date'],['expenses','expense_date'],['revenues','revenue_date']] as const).map(([table,date])=>all?db().prepare(`DELETE FROM ${table} WHERE owner_id=?`).bind(user):db().prepare(`DELETE FROM ${table} WHERE owner_id=? AND ${date}>=? AND ${date}<?`).bind(user,month+"-01",nextMonth));
    await db().batch(statements);
    return Response.json({ok:true,backup:safe});
  }
  if(p.action==="import"){
    const data=backupSchema.parse(p.backup);if(p.confirm!==true)return apiError(400,"Confirmação necessária.",errorCodes.CONFIRMATION_REQUIRED);
    const logo=data.logo?imageData(data.logo):null;
    const statements:D1PreparedStatement[]=[];
    for(const kind of ["trip","expense","revenue"] as Kind[]){const list=data[kind==="trip"?"trips":kind==="expense"?"expenses":"revenues"];const existing=await db().prepare(`SELECT id FROM ${tables[kind]} WHERE owner_id=?`).bind(user).all<{id:string}>();const own=new Set(existing.results.map(x=>x.id));const seen=new Set<string>();for(const row of list){if(seen.has(row.id))return apiError(400,"O backup possui identificadores repetidos.",errorCodes.INVALID_DATA);seen.add(row.id);let id=row.id;if(!own.has(id)){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${user}:${kind}:${id}`));id=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}statements.push(writeRecord(kind,row,user,id,own.has(id)));}}
    const safe=await backup(user);await bucket().put(`${user}/backups/${crypto.randomUUID()}.json`,JSON.stringify(safe),{httpMetadata:{contentType:"application/json"}});
    let logoKey:string|null=null;if(logo){logoKey=`${user}/logos/${crypto.randomUUID()}`;await bucket().put(logoKey,logo.bytes,{httpMetadata:{contentType:logo.type}});}
    statements.push(db().prepare("INSERT INTO companies(owner_id,name,cnpj,logo_key) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,cnpj=excluded.cnpj,logo_key=COALESCE(excluded.logo_key,companies.logo_key)").bind(user,data.company.name,data.company.cnpj,logoKey));
    await db().batch(statements);return Response.json({ok:true});
  }
  return apiError(400,"Ação inválida.",errorCodes.INVALID_TYPE);
}catch(e){return failure(e);}}
