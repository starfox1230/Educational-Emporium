import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const source=path.resolve('../../archives/fluenta-sites');
let page=fs.readFileSync(path.join(source,'app/page.tsx'),'utf8');
page=page.split('\n').filter(line=>!line.includes('const [syncStatus,')&&!line.includes('// Load the shared source')&&!line.includes('// Debounce writes')&&!line.includes('fetch("/api/state")')&&!line.includes('if (!cloudReady)')).join('\n');
page=page.replace(/const syncLabel = [^;]+;/,'const syncLabel = "Saved on this device";');
page=page.replace('Your preferences stay on this device in local mode. Cloud sync and sign-in are ready for the next backend pass.','Cards, reviews and preferences are saved in this browser on this device. This static version does not sync across devices.');
fs.mkdirSync('src',{recursive:true});fs.writeFileSync('src/page.tsx',page);
fs.writeFileSync('src/main.tsx','import React from "react";import {createRoot} from "react-dom/client";import Home from "./page";createRoot(document.getElementById("root")!).render(<Home/>);');
await build({entryPoints:['src/main.tsx'],bundle:true,minify:true,format:'esm',target:'es2020',outfile:'app.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
let css=['globals.css','review-overrides.css','brand-overrides.css','tap-review.css'].map(file=>fs.readFileSync(path.join(source,'app',file),'utf8')).join('\n');
css=css.replace('@import "tailwindcss";','').replaceAll('url("/','url("./');fs.writeFileSync('style.css',css);
for(const file of fs.readdirSync(path.join(source,'public'))){if(file==='sw.js')continue;fs.copyFileSync(path.join(source,'public',file),file);}
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));manifest.start_url='./';manifest.scope='./';manifest.icons=manifest.icons.map(icon=>({...icon,src:'./'+icon.src.replace(/^\//,'')}));fs.writeFileSync('manifest.webmanifest',JSON.stringify(manifest,null,2));
