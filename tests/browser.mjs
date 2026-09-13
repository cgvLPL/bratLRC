import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.test-output',{recursive:true});
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1.5','-y','.test-output/tone.mp3']);
const root=resolve('dist');
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith('/bratLRC/')){res.writeHead(404);return res.end();}
  const file=resolve(root,path.slice('/bratLRC/'.length)||'index.html');
  if(!file.startsWith(root+'/'))throw Error('invalid path');
  const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(8767,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8767/bratLRC/');
 await page.waitForFunction(()=>document.querySelector('.brand img')?.naturalWidth>0);
 assert.equal(await page.locator('input[name=lyrics]').getAttribute('accept'),null,'LRC picker must not use MIME/extension filtering because mobile Safari may hide .lrc files');
 await page.locator('input[name=audio]').setInputFiles('.test-output/tone.mp3');
 await page.locator('input[name=lyrics]').setInputFiles({name:'lyrics.lrc',mimeType:'application/octet-stream',buffer:Buffer.from('[00:00]let the words\n[00:00.8]come to life')});
 await page.locator('#generate').click();
 await page.waitForFunction(()=>!document.getElementById('download').hidden||(!document.getElementById('generate').disabled&&document.getElementById('status').textContent!=='Your files stay in your browser. No upload to a server.'),{},{timeout:180000});
 assert.equal(await page.locator('#download').isVisible(),true,await page.locator('#status').textContent());
 const pending=page.waitForEvent('download');await page.locator('#download').click();const download=await pending;
 await download.saveAs('.test-output/browser.mp4');
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json','.test-output/browser.mp4']));
 const video=info.streams.find(s=>s.codec_type==='video');
 assert.equal(video.codec_name,'h264');assert.equal(video.width,1080);assert.equal(video.height,1080);
 assert(info.streams.some(s=>s.codec_type==='audio'));assert(Math.abs(Number(info.format.duration)-1.5)<.2);
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'.test-output/mobile.png',fullPage:true});
 console.log('PASS: project subpath, logo, unrestricted .lrc picker, octet-stream LRC, browser MP4 with audio, download, mobile layout');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
