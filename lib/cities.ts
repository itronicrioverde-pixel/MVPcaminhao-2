import {cities} from './cities-data';
export {cities};
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const cityLabel=(c:typeof cities[number])=>`${c.name}, ${c.uf}`;
export function resolveCity(value:string){const n=normalize(value);return cities.find(c=>normalize(cityLabel(c))===n)??(()=>{const matches=cities.filter(c=>normalize(c.name)===n);return matches.length===1?matches[0]:undefined;})();}
