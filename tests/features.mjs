import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base))throw new Error('Tests are restricted to the local demo.');
const results=[];async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL',name,e.message);}}
function client(){let cookie='';return {async raw(path,options={}){const r=await fetch(base+'/api/'+path,{...options,headers:{...options.headers,Cookie:cookie}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;},async post(path,body){return this.raw(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}};}
const admin=client(),employee=client(),anon=client();await anon.raw('bootstrap');
assert.equal((await admin.post('login',{email:'raka@ruangkita.demo',password:'RuangKita!2026'})).status,200);
assert.equal((await employee.post('login',{email:'ayu@ruangkita.demo',password:'RuangKita!2026'})).status,200);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=','base64');
function photo(bytes=png,type='image/png'){const form=new FormData();form.append('file',new Blob([bytes],{type}),'room.png');return {method:'POST',body:form};}
let imageUrl;
await check('Employee cannot upload room photo',async()=>assert.equal((await employee.raw('admin/room-image',photo())).status,403));
await check('Room photo signature validated',async()=>assert.equal((await admin.raw('admin/room-image',photo('not an image'))).status,400));
await check('Room photo size enforced',async()=>assert.equal((await admin.raw('admin/room-image',photo(new Uint8Array(5*1024*1024+1)))).status,400));
await check('SVG room upload rejected',async()=>assert.equal((await admin.raw('admin/room-image',photo('<svg/>','image/svg+xml'))).status,400));
await check('Room photo at the full 5 MB limit accepted',async()=>{const bytes=new Uint8Array(5*1024*1024);bytes.set(png);assert.equal((await admin.raw('admin/room-image',photo(bytes))).status,201);});
await check('Admin uploads real PNG to R2',async()=>{const r=await admin.raw('admin/room-image',photo());assert.equal(r.status,201);imageUrl=(await r.json()).image_url;assert.match(imageUrl,/^\/api\/room-images\//);});
await check('Uploaded photo accessible to signed-in employee',async()=>{const r=await employee.raw(imageUrl.slice(5));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);});
await check('Anonymous room photo access denied',async()=>assert.equal((await anon.raw(imageUrl.slice(5))).status,401));
await check('Uploaded photo can be saved on a room',async()=>{const data=await (await admin.raw('state')).json();const room=data.rooms.find(r=>r.id==='room-7');const r=await admin.post('admin/rooms',{...room,image_url:imageUrl,facility_ids:room.facilities.map(f=>f.id)});assert.equal(r.status,200);assert.equal((await (await employee.raw('state')).json()).rooms.find(r=>r.id===room.id).image_url,imageUrl);});
await check('Employee cannot export admin report',async()=>assert.equal((await employee.raw('admin/reports/export')).status,403));
await check('Anonymous report access denied',async()=>assert.equal((await anon.raw('admin/reports/export')).status,401));
await check('Report delivers CSV attachment with all eleven headers',async()=>{const r=await admin.raw('admin/reports/export');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/csv/);assert.match(r.headers.get('content-disposition'),/attachment; filename="laporan-ruangkita-/);assert.equal(r.headers.get('cache-control'),'no-store');const raw=new Uint8Array(await r.arrayBuffer());assert.deepEqual([...raw.slice(0,3)],[239,187,191]);const csv=new TextDecoder().decode(raw);assert.equal(csv.split('\r\n')[0].split(',').length,11);assert.ok(csv.includes('"Ayu Pratama"'));});
await check('Report filters applied server-side',async()=>{const r=await admin.raw('admin/reports/export?room=does-not-exist');assert.equal(r.status,200);const csv=await r.text();assert.equal(csv.split('\r\n').length,1);});
await check('Report rejects reversed or invalid dates',async()=>{assert.equal((await admin.raw('admin/reports/export?from=2026-12-31&to=2026-01-01')).status,400);assert.equal((await admin.raw('admin/reports/export?from=2026-02-30')).status,400);});
await check('Malformed JSON returns a validation error',async()=>assert.equal((await admin.raw('profile',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400));
await check('Invalid recovery token is rejected',async()=>assert.equal((await anon.post('reset-password',{token:'invalid',password:'NewPassword!2026'})).status,400));
await check('Scheduler rejects missing authorization',async()=>assert.equal((await anon.post('jobs/reminders',{})).status,401));
await check('Scheduler rejects incorrect authorization',async()=>assert.equal((await anon.raw('jobs/reminders',{method:'POST',headers:{Authorization:'Bearer wrong-secret'}})).status,401));
await check('Scheduler runs without a browser user session and is idempotent',async()=>{const secret=readFileSync('.dev.vars','utf8').match(/^CRON_SECRET=(.+)$/m)?.[1].trim();assert.ok(secret);for(let i=0;i<2;i++){const r=await anon.raw('jobs/reminders',{method:'POST',headers:{Authorization:'Bearer '+secret}});assert.equal(r.status,200);assert.equal((await r.json()).ok,true);}});
const failed=results.filter(r=>r.status==='FAIL').length;writeFileSync('qa/features-results.json',JSON.stringify({time:new Date().toISOString(),passed:results.length-failed,failed,results},null,2));process.exitCode=failed?1:0;
