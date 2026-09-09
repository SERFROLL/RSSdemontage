import {spawnSync} from "node:child_process";
const drafts=spawnSync(process.execPath,["--test","tests/drafts.test.mjs","tests/draft-state.test.mjs"],{stdio:"inherit"});if(drafts.status!==0)process.exit(drafts.status??1);
for(const script of ["scripts/test-ledger.mjs","scripts/test-api.mjs"]){const r=spawnSync(process.execPath,[script],{stdio:"inherit"});if(r.status!==0)process.exit(r.status??1);}
