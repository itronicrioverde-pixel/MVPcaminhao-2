import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {projectRoot,stateDir,baseUrl,port,killTree} from './e2e-common.mjs';

const saved={
  E2E_STATE_DIR:process.env.E2E_STATE_DIR,
  E2E_PORT:process.env.E2E_PORT,
  E2E_BASE_URL:process.env.E2E_BASE_URL,
};
function reset(){
  for(const key of ['E2E_STATE_DIR','E2E_PORT','E2E_BASE_URL']){
    if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
  }
}
const names=[];
const defaultPort=port();
function rejected(fn,reason){let threw=false;try{fn();}catch{threw=true;}assert.equal(threw,true,reason);}
function accepted(fn,reason){let value;try{value=fn();}catch(error){assert.fail(reason+': lançou ('+error.message+')');}return value;}
try{
  reset();
  assert.equal(stateDir(),join(projectRoot,'.wrangler','e2e'),'estado padrão dentro do projeto');
  names.push('stateDir padrão aponta para .wrangler/e2e');

  process.env.E2E_STATE_DIR=join(projectRoot,'.wrangler','e2e');
  assert.equal(accepted(()=>stateDir(),'.wrangler/e2e explícito'),join(projectRoot,'.wrangler','e2e'));
  process.env.E2E_STATE_DIR=join(projectRoot,'.wrangler','e2e','d1');
  assert.equal(accepted(()=>stateDir(),'subpasta de .wrangler/e2e'),join(projectRoot,'.wrangler','e2e','d1'));
  process.env.E2E_STATE_DIR='.wrangler/e2e/snapshots/..';
  assert.equal(accepted(()=>stateDir(),'subpasta com .. resolvido para dentro'),join(projectRoot,'.wrangler','e2e'));
  names.push('aceita .wrangler/e2e e suas subpastas (absoluto e relativo)');

  process.env.E2E_STATE_DIR='';
  rejected(()=>stateDir(),'vazio resolve para a raiz do processo');
  process.env.E2E_STATE_DIR=projectRoot;
  rejected(()=>stateDir(),'raiz do projeto');
  process.env.E2E_STATE_DIR='.';
  rejected(()=>stateDir(),'ponto resolve para a raiz do projeto');
  names.push('rejeita a raiz do projeto e valor vazio');

  process.env.E2E_STATE_DIR=join(projectRoot,'.wrangler');
  rejected(()=>stateDir(),'.wrangler raiz');
  process.env.E2E_STATE_DIR='.wrangler/state';
  rejected(()=>stateDir(),'.wrangler/state usado pelo npm start');
  process.env.E2E_STATE_DIR=join(projectRoot,'drizzle');
  rejected(()=>stateDir(),'drizzle');
  process.env.E2E_STATE_DIR=join(projectRoot,'.e2e');
  rejected(()=>stateDir(),'.e2e');
  process.env.E2E_STATE_DIR=join(projectRoot,'.e2e','server.json');
  rejected(()=>stateDir(),'arquivo dentro de .e2e');
  names.push('rejeita .wrangler, .wrangler/state e demais pastas do projeto');

  process.env.E2E_STATE_DIR=resolve(projectRoot,'..');
  rejected(()=>stateDir(),'pasta pai do projeto');
  process.env.E2E_STATE_DIR='/tmp/fora-do-projeto';
  rejected(()=>stateDir(),'caminho absoluto externo');
  names.push('rejeita caminhos externos ao projeto');

  reset();
  assert.equal(baseUrl(),`http://127.0.0.1:${defaultPort}`,'URL padrão do servidor local');
  process.env.E2E_PORT='9000';
  assert.equal(baseUrl(),'http://127.0.0.1:9000','URL acompanha a porta configurada');
  names.push('baseUrl padrão e acompanha E2E_PORT');

  reset();
  process.env.E2E_PORT='8788';
  process.env.E2E_BASE_URL='http://127.0.0.1:8788/';
  assert.equal(baseUrl(),'http://127.0.0.1:8788','aceita base local com barra final');
  process.env.E2E_BASE_URL='http://localhost:8788';
  assert.equal(baseUrl(),'http://localhost:8788','aceita localhost na mesma porta');
  process.env.E2E_BASE_URL='http://[::1]:8788';
  assert.equal(baseUrl(),'http://[::1]:8788','aceita IPv6 loopback na mesma porta');
  names.push('E2E_BASE_URL local na mesma porta é aceita');

  const invalidas=[
    ['http://127.0.0.1:9999','mesmo host em porta diferente'],
    ['http://10.0.0.1:8788','host não local na mesma porta'],
    ['https://127.0.0.1:8788','protocolo https'],
    ['ftp://127.0.0.1:8788','protocolo ftp'],
    ['http://localhost:8788/app','URL com caminho distinto da raiz'],
    ['not a url','string não é uma URL'],
  ];
  for(const [value,reason] of invalidas){
    process.env.E2E_BASE_URL=value;
    rejected(()=>baseUrl(),'E2E_BASE_URL '+reason);
  }
  names.push('E2E_BASE_URL divergente do servidor local é rejeitada ('+invalidas.length+' casos)');

  killTree(undefined);
  killTree(0);
  killTree(999999999);
  names.push('killTree tolera pid ausente ou inexistente');
  console.log('PASS ('+names.length+' grupos): '+names.join('; ')+'.');
}finally{reset();}