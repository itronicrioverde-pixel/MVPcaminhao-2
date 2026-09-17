import {z} from 'zod';
import {owner,failure,db} from '@/lib/records-server';
import {bucket} from '@/lib/backup-server';
import {resolveCity,cityLabel} from '@/lib/cities';
export async function POST(r:Request){try{
 owner(r);
 const p=z.object({origin:z.string().trim().min(2).max(200),destination:z.string().trim().min(2).max(200)}).parse(await r.json());
 const from=resolveCity(p.origin),to=resolveCity(p.destination);
 if(!from||!to)return Response.json({error:'Selecione origem e destino na lista de cidades, com o estado correto.'},{status:422});
 if(from.id===to.id)return Response.json({error:'Origem e destino são a mesma cidade. Para trajetos locais, informe os quilômetros manualmente.'},{status:422});
 const key=`routes/osrm-v1/${from.id}-${to.id}.json`,now=Date.now();
 const cached=await bucket().get(key);
 if(cached){const data=await cached.json<{at:number;km:number;message:string}>();if(data.at>now-7*86400000)return Response.json({...data,toll:null});}
 // One shared database gate enforces the public service's limit across all isolates/users.
 const slot=await db().prepare("INSERT INTO route_limits(id,next_at) VALUES('osrm',?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE route_limits.next_at<=? RETURNING id").bind(Date.now()+2000,Date.now()).first();
 if(!slot)return Response.json({error:'Aguarde um instante e tente calcular novamente.'},{status:429,headers:{'retry-after':'2'}});
 const url=`https://routing.openstreetmap.de/routed-car/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&steps=false&alternatives=false`;
 const response=await fetch(url,{headers:{'User-Agent':'RotaFinanceira/1.0 (+https://financeiro-viagens-caminhao.itronicrioverde.chatgpt.site)','Referer':'https://financeiro-viagens-caminhao.itronicrioverde.chatgpt.site/'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)return Response.json({error:'Consulta gratuita indisponível agora. Tente novamente ou informe os quilômetros manualmente.'},{status:502});
 const result=await response.json() as {code?:string;routes?:{distance?:number}[];waypoints?:{distance?:number}[]};
 const meters=result.routes?.[0]?.distance;
 if(result.code!=='Ok'||typeof meters!=='number'||!Number.isFinite(meters)||meters<=0||result.waypoints?.some(w=>(w.distance??0)>10000))return Response.json({error:'Não foi encontrada uma rota rodoviária entre essas cidades. Informe os quilômetros manualmente.'},{status:422});
 const data={at:now,km:Math.round(meters/1000),toll:null,message:`${cityLabel(from)} → ${cityLabel(to)}: estimativa por estrada entre os centros das cidades. Não considera restrições de caminhão. Pedágios: preenchimento manual.`};
 await bucket().put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
 return Response.json(data,{headers:{'cache-control':'no-store'}});
}catch(e){if(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name))return Response.json({error:'A consulta demorou demais. Tente novamente ou informe os quilômetros manualmente.'},{status:504});return failure(e);}}
