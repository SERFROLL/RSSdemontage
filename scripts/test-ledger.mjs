import ts from "typescript";import {readFileSync,writeFileSync,mkdirSync} from "node:fs";import {spawnSync} from "node:child_process";
mkdirSync("outputs/test-runtime",{recursive:true});
for(const name of ["domain","ledger","initialization","seed","telegram-auth","xlsx","export"]){let source=readFileSync("lib/"+name+".ts","utf8");let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;code=code.replace(/from "\.\/([a-z-]+)"/g,'from "./$1.mjs"');writeFileSync("outputs/test-runtime/"+name+".mjs",code);}
const r=spawnSync(process.execPath,["--test","tests/ledger.test.mjs","tests/initialization.test.mjs"],{stdio:"inherit"});process.exit(r.status??1);
