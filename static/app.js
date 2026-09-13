const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let count = 0;
function preview(){
 const sizes = {square:[1080,1080],portrait:[1080,1920],landscape:[1920,1080]};
 [canvas.width,canvas.height] = sizes[$('format').value];
 ctx.fillStyle = $('background').value; ctx.fillRect(0,0,canvas.width,canvas.height);
 const fs = Number($('font_size').value)*canvas.width/1080;
 ctx.font = `${fs}px Arial`; ctx.textBaseline='top';ctx.fillStyle=$('foreground').value;
 let x=canvas.width*.2, y=canvas.height*.3;
 for(const word of ['let','the','words','come','to','life'].slice(0,count)){
  const w=ctx.measureText(word).width;
  if(x+w>canvas.width*.8){x=canvas.width*.2;y+=fs*1.35;}
  ctx.fillText(word,x,y);x+=w+fs*.75;
 }
}
setInterval(()=>{count=(count+1)%8;preview();},550);
for(const id of ['format','font_size','foreground','background']) $(id).addEventListener('input',preview);
preview();
$('form').addEventListener('submit',async event=>{
 event.preventDefault(); $('generate').disabled=true;$('download').hidden=true;
 $('progress').hidden=false;$('progress').value=0;$('status').textContent='Uploading and preparing your track…';
 try {
  const body=new FormData(event.target), options={};
  for(const id of ['format','font_size','foreground','background','shift'])options[id]=$(id).value;
  body.append('options',JSON.stringify(options));
  const res=await fetch('/api/render',{method:'POST',body,headers:{'X-Local-Token':document.querySelector('meta[name=local-token]').content}});
  const result=await res.json();if(!res.ok)throw Error(result.error||'Upload failed.');
  while(true){
   await new Promise(resolve=>setTimeout(resolve,1000));
   const response=await fetch(`/api/jobs/${result.id}`);
   if(!response.ok)throw Error('Could not retrieve render progress.');
   const job=await response.json();
   $('progress').value=job.progress;
   $('status').textContent=`Rendering your video… ${job.progress}%`;
   if(job.status==='error')throw Error(job.error);
   if(job.status==='done'){
    $('status').textContent='Your video is ready.';$('download').href=`/api/jobs/${result.id}/download`;
    $('download').hidden=false;break;
   }
  }
 }catch(error){$('status').textContent=error.message;}
 finally{$('generate').disabled=false;}
});
