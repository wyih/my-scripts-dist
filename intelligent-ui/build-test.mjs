import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const dir=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(dir,'../ChatGPT exporter.js'),'utf8');
const pack=name=>gzipSync(fs.readFileSync(path.join(dir,name))).toString('base64');
const start=source.indexOf('    async function getIntelligentUITemplate(bundle) {');
const end=source.indexOf('    function intelligentUIBase64',start);
if(start<0||end<0)throw new Error('Runtime loader not found');
const loader=`    // Local test build: no runtime fetch or unpublished GitHub dependency.
    async function getIntelligentUITemplate(bundle) {
        const full = bundle.contentReferences.some(ref => ref?.data?.language === 'mermaid' && !/^\\s*(?:flowchart|graph)\\b/.test(ref.data.content || ''));
        const name = full ? 'full' : 'flowchart';
        if (!intelligentUITemplates.has(name)) {
            const payload = full ? '${pack('runtime-v1-full.html')}' : '${pack('runtime-v1.html')}';
            intelligentUITemplates.set(name, new Response(new Blob([Uint8Array.from(atob(payload), c => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
        }
        return intelligentUITemplates.get(name);
    }

`;
const output=path.resolve(process.argv[2]||path.join(dir,'../artifacts/intelligent-ui-export-20261009/ChatGPT-to-Notion-2.37-test.user.js'));
fs.mkdirSync(path.dirname(output),{recursive:true});
const testSource=(source.slice(0,start)+loader+source.slice(end)).replace('// @version      2.37','// @version      2.36.99').replace('// @description  ','// @description  [本地测试版，待验证后发布] ');
fs.writeFileSync(output,testSource);
console.log(output,fs.statSync(output).size+' bytes');
