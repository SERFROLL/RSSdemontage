import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareInitialization,initializationStatus} from '../outputs/test-runtime/initialization.mjs';
import {prepareCommand,balances,summary,today} from '../outputs/test-runtime/domain.mjs';
import {demoDocs} from '../outputs/test-runtime/seed.mjs';

const actor={id:'demo-admin',roles:['admin']};
const date=today();
const yesterday=()=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)};
function fixture(){const docs=demoDocs();docs.push({id:'pid:7777',kind:'pid',version:1,pid:'pid:7777',date,author:actor.id,createdAt:new Date().toISOString(),data:{code:'7777',cutoff:date,initializationRequired:true}});return docs;}
function command(){return {action:'initialize',requestId:crypto.randomUUID(),data:{pid:'pid:7777',pidStockChecked:true,mainStockChecked:true,pidEmpty:false,warehouseEmpty:false,lines:[{location:'pid',cableId:'cable:mksb',metres:'1250,125'},{location:'warehouse',cableId:'cable:mksb',kg:'2480,375'}]}};}
const row=docs=>balances(docs,date).find(r=>r.pid==='pid:7777'&&r.cableId==='cable:mksb');

test('Opening records field metres and warehouse kg separately, without manufacturing production or coils',()=>{
 const docs=fixture(),p=prepareInitialization(docs,actor,command()),r=row([...docs,p.marker,...p.documents]);
 assert.equal(p.marker.id,'initialization:pid:7777');assert.equal(p.marker.date,date);assert.equal(p.marker.data.schemaVersion,2);
 assert.equal(p.marker.data.initialPidCoils,0);assert.equal(p.documents.length,0);
 assert.equal(r.mm,1250125);assert.equal(r.warehouseGrams,2480375);assert.equal(r.coils,0);assert.equal(r.wound,0);assert.equal(r.extractedMm,0);assert.equal(r.transitGrams,0);assert.equal(r.receivedGrams,0);
 assert.equal(p.totals.pidMm,1250125);assert.equal(p.totals.warehouseGrams,2480375);assert.equal(p.totals.rows.length,1);
 assert.equal(summary([...docs,p.marker],date,'pid:7777').cableMm,0);
 assert.equal(balances([...docs,p.marker],yesterday()).some(r=>r.pid==='pid:7777'),false);
});

test('Several source rows of one type aggregate only within their own location',()=>{
 const c=command();c.data.lines.push({location:'warehouse',cableId:'cable:mksb',kg:'100'},{location:'pid',cableId:'cable:mksb',metres:'49.875'},{location:'warehouse',cableId:'cable:tk',kg:'50'});
 const p=prepareInitialization(fixture(),actor,c),r=row([...fixture(),p.marker]);
 assert.equal(p.marker.data.lines.length,5);assert.equal(new Set(p.marker.data.lines.map(l=>l.id)).size,5);
 assert.equal(r.mm,1300000);assert.equal(r.warehouseGrams,2580375);assert.equal(p.totals.warehouseGrams,2630375);assert.equal(p.totals.rows.length,2);
});

test('Both locations require explicit review; unknown stock is not silently zero',()=>{
 for(const field of ['pidStockChecked','mainStockChecked']){const c=command();c.data[field]=false;assert.throws(()=>prepareInitialization(fixture(),actor,c));}
 for(const location of ['pid','warehouse']){const c=command();c.data.lines=c.data.lines.filter(l=>l.location!==location);assert.throws(()=>prepareInitialization(fixture(),actor,c));}
 const c=command();c.data.lines=[];assert.throws(()=>prepareInitialization(fixture(),actor,c));
 c.data.pidEmpty=true;c.data.warehouseEmpty=true;const p=prepareInitialization(fixture(),actor,c);
 assert.equal(p.totals.pidMm,0);assert.equal(p.totals.warehouseGrams,0);assert.equal(p.marker.data.initialPidCoils,0);
 assert.equal(initializationStatus([...fixture(),p.marker],'pid:7777'),'confirmed');
});

test('Zero confirmation cannot coexist with source rows for that location',()=>{
 for(const field of ['pidEmpty','warehouseEmpty']){const c=command();c.data[field]=true;assert.throws(()=>prepareInitialization(fixture(),actor,c));}
});

test('Initialization is one immutable confirmation per PID, not one per type or location',()=>{
 const p=prepareInitialization(fixture(),actor,command()),docs=[...fixture(),p.marker];
 assert.equal(initializationStatus(docs,'pid:7777'),'confirmed');
 assert.throws(()=>prepareInitialization(docs,actor,{...command(),requestId:'different'}));
 assert.throws(()=>prepareInitialization(fixture(),actor,{...command(),id:p.marker.id,expectedVersion:1}));
 const c=command();c.data.lines[0].cableId='cable:tk';assert.throws(()=>prepareInitialization(docs,actor,c));
});

test('Initial snapshot cannot import transit, count, or historical production',()=>{
 for(const extra of [{entries:[{kind:'excavation',metres:'10'}]},{coils:'3'},{accumulatedExtracted:'100'},{accumulatedWound:'2'}]){const c=command();Object.assign(c.data,extra);assert.throws(()=>prepareInitialization(fixture(),actor,c));}
 const c=command();c.data.lines.push({location:'transit',cableId:'cable:mksb',kg:'10'});assert.throws(()=>prepareInitialization(fixture(),actor,c));
});

test('Opening rejects malformed values, wrong units, missing type, negative stock and wrong date',()=>{
 for(const value of ['','-1','1e3','1.2345','Infinity']){const c=command();c.data.lines[0].metres=value;assert.throws(()=>prepareInitialization(fixture(),actor,c));}
 for(const change of [{location:'pid',cableId:'cable:mksb',kg:'10'},{location:'warehouse',cableId:'cable:mksb',metres:'10'},{location:'pid',cableId:'missing',metres:'10'}]){const c=command();c.data.lines[0]=change;assert.throws(()=>prepareInitialization(fixture(),actor,c));}
 const c=command();c.data.date=yesterday();assert.throws(()=>prepareInitialization(fixture(),actor,c));
});

test('Current operations start only after the new PID opening confirmation',()=>{
 const docs=fixture(),report={action:'report',requestId:'daily',data:{pid:'pid:7777',date,category:'excavation',status:'work',cableId:'cable:mksb',trench:'10',cable:'20'}};
 assert.equal(initializationStatus(docs,'pid:7777'),'pending');assert.throws(()=>prepareCommand(docs,actor,report));
 const p=prepareInitialization(docs,actor,command());assert.equal(prepareCommand([...docs,p.marker],actor,report).data.cableMm,20000);
});

test('Only administrators initialize; direct legacy opening entry remains closed',()=>{
 assert.throws(()=>prepareInitialization(fixture(),{id:'worker',roles:['foreman']},command()));
 assert.throws(()=>prepareCommand(fixture(),actor,{action:'opening',requestId:'legacy-client',data:{pid:'pid:7777',metres:'1000',coils:'10'}}));
});

test('Existing legacy stock remains intact and blocks additive initialization',()=>{
 const docs=fixture();docs.push({id:'old-opening',kind:'opening',pid:'pid:7777',version:1,date,author:actor.id,createdAt:date,data:{cableId:'cable:mksb',mm:123000,coils:3,accumulatedExtractedMm:200000}});
 assert.equal(initializationStatus(docs,'pid:7777'),'legacy');assert.throws(()=>prepareInitialization(docs,actor,command()));
 assert.equal(row(docs).mm,123000);assert.equal(row(docs).coils,3);assert.equal(row(docs).extractedMm,200000);
});

test('A new PID does not accept manually entered cumulative trench work',()=>{
 assert.throws(()=>prepareCommand(demoDocs(),actor,{action:'pid',requestId:'pid-sum',data:{code:'9999',cutoff:date,accumulatedTrench:'100'}}));
});
