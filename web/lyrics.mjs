const stamp='(\\d+):([0-5]\\d)(?:[.,:]([0-9]{1,3}))?';
const seconds=m=>Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0'));
export function parseLrc(text,duration,shift=0){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(shift))throw Error('Invalid audio duration or timing shift.');
 const offset=text.match(/\[offset:([+-]?\d+)\]/i);
 shift+=offset?Number(offset[1])/1000:0;
 const rows=[];
 for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const stamps=[...line.matchAll(new RegExp('\\['+stamp+'\\]','g'))];
  if(!stamps.length)continue;
  const last=stamps.at(-1),content=line.slice(last.index+last[0].length).trim();
  for(const m of stamps)rows.push({start:seconds(m)+shift,content});
 }
 rows.sort((a,b)=>a.start-b.start);
 if(!rows.some(r=>r.content))throw Error('No timed lyrics found. Use [00:15.24] Your lyric here.');
 if(rows.length>3000)throw Error('Maximum 3,000 lyric lines.');
 const events=new Map([[0,[]]]);
 for(let i=0;i<rows.length;i++){
  const {start,content}=rows[i],end=rows[i+1]?.start??duration;
  if(start>=duration||end<=0||end<=start)continue;
  events.set(Math.max(0,start),[]);
  const markers=[...content.matchAll(new RegExp('<'+stamp+'>','g'))],timed=[];
  if(markers.length){
   const prefix=content.slice(0,markers[0].index).trim();
   if(prefix)timed.push([start,prefix]);
   for(let j=0;j<markers.length;j++){
    const m=markers[j],word=content.slice(m.index+m[0].length,markers[j+1]?.index??content.length).trim();
    if(!word)continue;
    const when=seconds(m)+shift;
    if(when<start||when>=end)throw Error('Word timestamps must fall inside their lyric line.');
    if(timed.length&&when<timed.at(-1)[0])throw Error('Word timestamps must be in increasing order.');
    timed.push([when,word]);
   }
  }else{
   const words=content?content.split(/\s+/):[];
   const interval=Math.min(end-start,Math.max(.1,(end-start)*.85))/Math.max(1,words.length);
   words.forEach((word,j)=>timed.push([start+j*interval,word]));
  }
  const visible=[];
  for(const [when,word]of timed){visible.push(...word.split(/\s+/));if(when<duration)events.set(Math.max(0,when),[...visible]);}
 }
 const result=[...events].sort((a,b)=>a[0]-b[0]);
 if(!result.some(e=>e[1].length))throw Error('No lyrics overlap the track. Check timestamps and timing shift.');
 if(result.length>5000||result.reduce((n,e)=>n+e[1].length,0)>150000)throw Error('Lyrics are too large. Use the GitHub Actions renderer.');
 return result;
}
export const sizes={square:[1080,1080],portrait:[1080,1920],landscape:[1920,1080]};
export function drawFrame(canvas,words,options){
 const [w,h]=sizes[options.format];canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d');ctx.fillStyle=options.background;ctx.fillRect(0,0,w,h);
 let fs=Math.round(Number(options.font_size)*w/1080),rows;
 do{
  ctx.font=`${fs}px Arial`;rows=[];let row=[],x=0;
  for(const word of words){
   const chunks=[];let chunk='';
   for(const char of word){if(chunk&&ctx.measureText(chunk+char).width>w*.6){chunks.push(chunk);chunk='';}chunk+=char;}
   if(chunk)chunks.push(chunk);
   for(const token of chunks){const width=ctx.measureText(token).width;
    if(row.length&&x+width>w*.6){rows.push(row);row=[];x=0;}
    row.push([x,token]);x+=width+fs*.75;
   }
  }
  if(row.length)rows.push(row);
  if(rows.length*fs*1.35<=h*.56||fs<=14)break;
  fs-=2;
 }while(true);
 ctx.fillStyle=options.foreground;ctx.textBaseline='top';
 rows.forEach((row,j)=>row.forEach(([x,word])=>ctx.fillText(word,w*.2+x,h*.3+j*fs*1.35)));
}
