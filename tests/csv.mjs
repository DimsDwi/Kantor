import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {csvText} from '../lib/csv.ts';
const cases=[
 ['BOM and CRLF',()=>assert.equal(csvText([['Nama','Durasi'],['Ayu',1.5]]),'\uFEFF"Nama","Durasi"\r\n"Ayu","1.5"')],
 ['Comma quotes multiline',()=>assert.equal(csvText([['Rapat, "A"\nBaris 2']]),'\uFEFF"Rapat, ""A""\nBaris 2"')],
 ['Formula injection',()=>{for(const s of ['=1+1','+1','-1','@SUM(A1)','  =1','\t=1','\r=1'])assert.ok(csvText([[s]]).startsWith('\uFEFF"\''));}],
 ['Null and Unicode',()=>assert.equal(csvText([[null,undefined,'Disetujui · Rapat']]),'\uFEFF"","","Disetujui · Rapat"')],
 ['Empty report',()=>assert.equal(csvText([]),'\uFEFF')],
];
const results=cases.map(([name,fn])=>{fn();console.log('PASS',name);return {name,status:'PASS'};});
writeFileSync('qa/csv-results.json',JSON.stringify({time:new Date().toISOString(),passed:results.length,failed:0,results},null,2));
