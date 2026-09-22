import { z } from "zod";
const label=z.string().trim().min(1).max(200);
export const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Data inválida");
export const amount=z.coerce.number().finite().min(0).max(1e9);
export const extraItem=z.object({category:label,amount});
export const tripSchema=z.object({tripDate:date,origin:label,destination:label,clientName:z.string().max(200).default("Cliente não informado"),cargoType:z.string().max(200).default("Carga geral"),freight:amount,freightPerTon:amount.nullable().default(null),lossAlertPercent:z.coerce.number().finite().min(0).max(1000).default(10),driverPercent:z.coerce.number().finite().min(0).max(100).default(0),km:amount.transform(Math.round),diesel:amount.default(0),toll:amount.default(0),oil:amount.default(0),extraItems:z.array(extraItem).max(50).default([]),axles:z.coerce.number().int().min(2).max(9).default(6),loadedWeight:z.preprocess(v=>v===""||v==null?null:v,amount.nullable()),deliveredWeight:z.preprocess(v=>v===""||v==null?null:v,amount.nullable()),status:z.string().max(80).default("Concluído"),notes:z.string().max(2000).default("")});
export const expenseSchema=z.object({expenseDate:date,category:label,description:label,amount});
export const revenueSchema=z.object({revenueDate:date,category:label,description:label,amount});
export const companySchema=z.object({name:label,cnpj:z.string().trim().max(18).refine(v=>!v||/^\d{14}$/.test(v.replace(/\D/g,"")),"Informe 14 dígitos no CNPJ")});
const id=z.string().min(1).max(300);
export const backupSchema=z.object({format:z.literal("rota-financeira"),version:z.literal(1),createdAt:z.string(),trips:z.array(tripSchema.extend({id})).max(10000),expenses:z.array(expenseSchema.extend({id})).max(10000),revenues:z.array(revenueSchema.extend({id})).max(10000),company:companySchema,logo:z.string().max(700000).nullable().default(null)});
export type ExtraItem=z.infer<typeof extraItem>;
export type Trip=z.infer<typeof tripSchema>&{id:string;extras:number};
export type Expense=z.infer<typeof expenseSchema>&{id:string};
export type Revenue=z.infer<typeof revenueSchema>&{id:string};
export type Company=z.infer<typeof companySchema>&{logoKey?:string|null};
export type Backup=z.infer<typeof backupSchema>;
export function previousMonth(now=new Date()){return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7);}

export function driverCommission(trip:{freight:number;driverPercent?:number}){return Math.round((trip.freight*(trip.driverPercent??0)/100+Number.EPSILON)*100)/100;}

export function grossFreight(rate:number,tonnes:number){return Math.round((rate*tonnes+Number.EPSILON)*100)/100;}

export function lossStatus(revenue:number,costs:number,threshold:number){const loss=Math.round((costs-revenue)*100)/100;const percent=revenue>0?loss/revenue*100:null;return {loss,percent,alert:loss>0&&(percent===null||percent>=threshold)};}
