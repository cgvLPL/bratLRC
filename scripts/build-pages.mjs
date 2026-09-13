import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/vendor',{recursive:true});
await cp('static','dist',{recursive:true});
await cp('web','dist',{recursive:true});
await cp('node_modules/@ffmpeg/ffmpeg/dist/esm','dist/vendor/ffmpeg',{recursive:true});
await cp('node_modules/@ffmpeg/core/dist/esm','dist/vendor/core',{recursive:true});
let html=await readFile('static/index.html','utf8');
html=html.replace(/<meta name="local-token"[^>]*>/,'')
 .replaceAll('href="/"','href="./"').replaceAll('href="/style.css"','href="./style.css"')
 .replaceAll('src="/bratlrc-logo.png"','src="./bratlrc-logo.png"')
 .replace('<script src="/app.js"></script>','<script type="module" src="./pages.mjs"></script>')
 .replace('MP3 audio · up to 20 minutes','MP3 audio · up to 10 minutes / 50 MB')
 .replace('Files stay on the computer running this app.','Your files stay in your browser. No upload to a server.')
 .replace('<button id="generate">','<button id="generate">')
 .replace('<p id="status"','<button type="button" id="cancel" hidden>Cancel render</button><p id="status"')
 .replace('Style preview · sample text','Style preview · sample text. Keep this tab open while exporting.')
 .replace('<div class="note">','<div class="note"><p>MP4 rendering runs on your device. The first export downloads a ~31 MB video engine. For longer tracks, use the <a href="https://github.com/cgvLPL/bratLRC/actions/workflows/render.yml">GitHub Actions renderer</a>.</p>');
await writeFile('dist/index.html',html);
await writeFile('dist/.nojekyll','');
console.log('Built GitHub Pages app in dist/');
