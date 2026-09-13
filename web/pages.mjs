import {parseLrc,drawFrame} from './lyrics.mjs';
const $=id=>document.getElementById(id);
let ffmpeg=null,cancelled=false,busy=false,downloadURL=null,count=0;
const options=()=>Object.fromEntries(['format','font_size','foreground','background','shift'].map(id=>[id,$(id).value]));
function preview(){if(!busy)drawFrame($('canvas'),['let','the','words','come','to','life'].slice(0,count),options());}
setInterval(()=>{count=(count+1)%8;preview();},550);
for(const id of ['format','font_size','foreground','background'])$(id).addEventListener('input',preview);
preview();
const status=(message,progress)=>{$('status').textContent=message;if(progress!==undefined)$('progress').value=progress;};
const check=()=>{if(cancelled)throw Error('Render cancelled.');};
$('cancel').addEventListener('click',()=>{cancelled=true;ffmpeg?.terminate();});
function audioDuration(file){
 return new Promise((resolve,reject)=>{
  const audio=new Audio(),url=URL.createObjectURL(file);
  const timer=setTimeout(()=>finish(Error('Could not read this audio file. Try another MP3.')),20000);
  function finish(error){clearTimeout(timer);const duration=audio.duration;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);}
  audio.preload='metadata';audio.onloadedmetadata=()=>finish();audio.onerror=()=>finish(Error('Your browser cannot read this MP3.'));audio.src=url;
 });
}
$('form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const form=new FormData(event.target),audio=form.get('audio'),lyrics=form.get('lyrics'),settings=options();
 busy=true;cancelled=false;$('generate').disabled=true;$('cancel').hidden=false;$('download').hidden=true;$('progress').hidden=false;
 if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}
 const controls=[...$('form').querySelectorAll('input,select')];controls.forEach(c=>c.disabled=true);
 let encoding=false,lastLog='';
 try{
  if(!audio?.size||!lyrics?.size)throw Error('Choose an MP3 and an LRC file.');
  if(!/\.lrc$/i.test(lyrics.name||''))throw Error('Choose a lyrics file ending in .lrc.');
  if(audio.size>50*1024*1024||lyrics.size>512000)throw Error('Choose an MP3 under 50 MB and LRC under 500 KB.');
  status('Reading your track…',0);
  const duration=await audioDuration(audio);check();
  if(!Number.isFinite(duration)||duration<=0||duration>600)throw Error('Browser export supports tracks up to 10 minutes. Use GitHub Actions for longer tracks.');
  const events=parseLrc(await lyrics.text(),duration,Number(settings.shift));check();
  status('Loading the video engine (~31 MB on first export)…',2);
  const {FFmpeg}=await import('./vendor/ffmpeg/index.js');check();
  ffmpeg=new FFmpeg();
  ffmpeg.on('log',({message})=>{lastLog=message;});
  ffmpeg.on('progress',({time})=>{if(encoding&&!cancelled)status('Encoding MP4… keep this tab open.',Math.min(99,40+time/1e6/duration*59));});
  await ffmpeg.load({coreURL:new URL('./vendor/core/ffmpeg-core.js',import.meta.url).href,wasmURL:new URL('./vendor/core/ffmpeg-core.wasm',import.meta.url).href});check();
  await ffmpeg.writeFile('audio.mp3',new Uint8Array(await audio.arrayBuffer()));check();
  const canvas=document.createElement('canvas'),listing=['ffconcat version 1.0'];
  for(let i=0;i<events.length;i++){
   check();const [start,words]=events[i],end=events[i+1]?.[0]??duration;
   drawFrame(canvas,words,settings);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('Could not draw a video frame. Try a shorter track.');
   check();const name=`frame-${String(i).padStart(5,'0')}.png`;
   await ffmpeg.writeFile(name,new Uint8Array(await blob.arrayBuffer()));
   listing.push(`file '${name}'`,'option framerate 30',`duration ${(end-start).toFixed(8)}`);
   status(`Preparing lyrics… ${i+1} / ${events.length}`,5+35*(i+1)/events.length);
  }
  listing.push(`file 'frame-${String(events.length-1).padStart(5,'0')}.png'`,'option framerate 30');
  await ffmpeg.writeFile('frames.txt',new TextEncoder().encode(listing.join('\n')+'\n'));check();
  encoding=true;status('Encoding MP4… keep this tab open.',40);
  const code=await ffmpeg.exec(['-f','concat','-safe','0','-i','frames.txt','-i','audio.mp3','-map','0:v:0','-map','1:a:0','-t',String(duration),'-vf','fps=30','-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','lyrics.mp4']);check();
  if(code!==0){console.error(lastLog);throw Error('Encoding failed. Try a shorter track or use the GitHub Actions renderer.');}
  const data=await ffmpeg.readFile('lyrics.mp4');check();
  downloadURL=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));
  $('download').href=downloadURL;$('download').download='bratLRC.mp4';$('download').hidden=false;
  status('Your MP4 is ready. Download it before leaving this page.',100);
 }catch(error){status(cancelled?'Render cancelled.':error.message||'Export failed. Try a shorter track or GitHub Actions.');}
 finally{ffmpeg?.terminate();ffmpeg=null;busy=false;$('generate').disabled=false;$('cancel').hidden=true;controls.forEach(c=>c.disabled=false);}
});
