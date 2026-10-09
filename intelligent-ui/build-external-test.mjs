import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const runtimeRef=process.argv[2];
if (!/^[a-f0-9]{40}$/.test(runtimeRef||'')) throw new Error('Pass the exact Git commit containing the runtime templates');
const source=fs.readFileSync(path.join(dir,'../ChatGPT exporter.js'),'utf8');
const runtimeBase='https://raw.githubusercontent.com/wyih/my-scripts-dist/main/intelligent-ui/';
if (!source.includes(runtimeBase)) throw new Error('External runtime loader not found');
const output=path.resolve(process.argv[3]||path.join(dir,'../artifacts/intelligent-ui-export-20261009/ChatGPT-to-Notion-external-test.user.js'));
const trial=source
    .replace('// @version      2.37','// @version      2.36.100')
    .replace('// @description  ','// @description  [外置依赖测试版，待验证后发布] ')
    .replace(runtimeBase,`https://raw.githubusercontent.com/wyih/my-scripts-dist/${runtimeRef}/intelligent-ui/`)
    .replace('cgpt_ui_runtime:${name}','cgpt_ui_runtime:test-'+runtimeRef+':${name}');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,trial);
console.log(output,fs.statSync(output).size+' bytes');
