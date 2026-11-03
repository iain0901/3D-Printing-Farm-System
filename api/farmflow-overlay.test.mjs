import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const server = fileURLToPath(new URL("./server.mjs", import.meta.url));
function probe(url) {
  const script = `import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {buildServer,openDatabase} from ${JSON.stringify(new URL('./server.mjs',import.meta.url).href)};const dir=await mkdtemp(path.join(tmpdir(),'overlay-'));const db=await openDatabase(path.join(dir,'db.json'));const app=await buildServer({db,serveStatic:false});const status=async(url,payload)=>(await app.inject({method:'POST',url,payload})).statusCode;let out;try{out={probe:true,adminAlias:await status('/api/auth/login',{email:'admin',password:'invalid-test-password'}),customerAlias:await status('/api/customer-auth/login',{email:'user',password:'invalid'}),otherShortPassword:await status('/api/customer-auth/login',{email:'other@farmflow.test',password:'invalid'}),robots:(await app.inject({method:'GET',url:'/api/health'})).headers['x-robots-tag']||''}}finally{await app.close();await rm(dir,{recursive:true,force:true})}console.log(JSON.stringify(out));`;
  const stdout=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,LAYERPILOT_PUBLIC_URL:url,LAYERPILOT_DB_ADAPTER:'json',LAYERPILOT_OBJECT_STORAGE_PROVIDER:'local'},encoding:'utf8',timeout:30000});
  return JSON.parse(stdout.trim().split('\n').findLast(line=>line.startsWith('{"probe":true')));
}
describe('preserved test-site overlay remains origin-scoped',()=>{
 it('keeps aliases and noindex on the test origin without granting authentication',()=>{const r=probe('https://farmflow.3dstu.com');expect(r.adminAlias).toBe(401);expect(r.customerAlias).toBe(401);expect(r.otherShortPassword).toBe(400);expect(r.robots).toContain('noindex')});
 it('does not relax production aliases or short passwords',()=>{const r=probe('https://3drfm.com');expect(r.adminAlias).toBe(400);expect(r.customerAlias).toBe(400);expect(r.otherShortPassword).toBe(400);expect(r.robots).toBe('')});
});
