import {spawnSync} from "node:child_process";
for(const script of ["scripts/test-ledger.mjs","scripts/test-api.mjs"]){const r=spawnSync(process.execPath,[script],{stdio:"inherit"});if(r.status!==0)process.exit(r.status??1);}
