import type {Doc} from "./domain";
import {today,lengthFromMass} from "./domain";
export function demoDocs():Doc[]{
 const day=today();const prev=new Date(day+"T12:00:00Z");prev.setUTCDate(prev.getUTCDate()-1);const yesterday=prev.toISOString().slice(0,10);
 const start=new Date(day+"T12:00:00Z");start.setUTCDate(start.getUTCDate()-14);const cutoff=start.toISOString().slice(0,10);
 const stamp=cutoff+"T00:00:00.000Z";const docs:Doc[]=[];
 const add=(id:string,kind:string,data:any,pid:string|null=null,date=cutoff,author="demo-admin")=>docs.push({id,kind,data,pid,date,author,createdAt:stamp,version:1});
 const people=[["admin","Сергей","admin"],["foreman","Алексей · бригада 1","foreman"],["winder","Иван · намотка","winder"],["shipper","Дмитрий · отправка","shipper"],["warehouse","Анна · склад","warehouse"],["observer","Наблюдатель","observer"]];
 for(const [key,name,role] of people)add("demo-"+key,"user",{name,roles:[role],telegramId:"",active:true});
 for(const code of ["1234","2048"])add("pid:"+code,"pid",{code,cutoff,active:true,accumulatedTrenchMm:code==="1234"?1640000:980000},"pid:"+code);
 add("cable:mksb","cable",{name:"МКСБ 1,2×4"});add("cable:tk","cable",{name:"ТК 10×2×0,5"});
 for(const pid of ["pid:1234","pid:2048"]){
  for(const role of ["foreman","winder","shipper"])add("assignment:"+pid+":"+role,"assignment",{userId:"demo-"+role,pid,role,from:cutoff,until:null},pid);
  for(const cableId of ["cable:mksb","cable:tk"])add("coeff:"+pid+":"+cableId,"coefficient",{cableId,sampleMm:10000,sampleGrams:cableId==="cable:mksb"?20000:9000},pid);
 }
 add("opening:pid:1234:cable:mksb","opening",{cableId:"cable:mksb",mm:2840000,coils:6,accumulatedExtractedMm:4800000,accumulatedWound:12},"pid:1234");
 add("opening:pid:1234:cable:tk","opening",{cableId:"cable:tk",mm:800000,coils:3,accumulatedExtractedMm:800000,accumulatedWound:3},"pid:1234");
 add("opening:pid:2048:cable:mksb","opening",{cableId:"cable:mksb",mm:1460000,coils:4,accumulatedExtractedMm:1460000,accumulatedWound:4},"pid:2048");
 add("report:demo-foreman:pid:1234:"+yesterday+":excavation","report",{category:"excavation",status:"work",cableId:"cable:mksb",trenchMm:210000,cableMm:420000,note:"",audioId:null},"pid:1234",yesterday,"demo-foreman");
 add("report:demo-winder:pid:1234:"+yesterday+":winding","report",{category:"winding",status:"work",lines:[{cableId:"cable:mksb",count:8}],note:"",audioId:null},"pid:1234",yesterday,"demo-winder");
 const coils=[123,234,345,456].map((kg,i)=>({id:"demo-coil-"+(i+1),number:i+1,cableId:"cable:mksb",grams:kg*1000,coefficient:{sampleMm:10000,sampleGrams:20000},sentMm:lengthFromMass(kg*1000,20000,10000)}));
 add("trip:demo-001","trip",{coils,receipt:null,dispatchVersion:1,receiptVersion:0,dispatchChangedAt:stamp},"pid:1234",yesterday,"demo-shipper");
 return docs;
}
