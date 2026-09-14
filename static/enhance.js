(()=>{
 const $=id=>document.getElementById(id);
 const els={audio:$('enhance-audio'),lrc:$('enhance-lrc'),player:$('enhance-player'),lines:$('enhance-lines'),status:$('enhance-status'),current:$('enhance-current'),auto:$('enhance-auto'),autoToggle:$('enhance-auto-toggle'),tap:$('enhance-tap'),prev:$('enhance-prev'),next:$('enhance-next'),minus:$('enhance-minus'),plus:$('enhance-plus'),download:$('enhance-download')};
 if(!els.audio)return;
 const stamp='(\\d+):([0-5]\\d)(?:[.,:]([0-9]{1,3}))?';
 let rows=[],meta=[],cursor={line:0,word:0},audioURL=null,downloadURL=null;
 const sec=m=>Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0'));
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 const autoEnabled=()=>!els.autoToggle||els.autoToggle.value!=='off';
 function fmt(value){
  const t=Math.max(0,Number(value)||0),m=Math.floor(t/60),s=t-m*60;
  return `${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;
 }
 function lineEnd(i){
  const next=rows[i+1]?.start;
  if(Number.isFinite(next))return next;
  if(Number.isFinite(els.player.duration))return els.player.duration;
  return rows[i].start+Math.max(3,rows[i].words.length*.55);
 }
 function seedManualTimes(){
  rows.forEach((row,i)=>{
   if(!row.words.length){row.times=[];return;}
   const end=Math.max(row.start+.01,lineEnd(i)-.01);
   row.times=row.words.map((_,j)=>clamp(row.start+j*.01,row.start,end));
  });
 }
 function parseRegular(text){
  const clean=text.replace(/^\uFEFF/,'');
  const offsetMatch=clean.match(/\[offset:([+-]?\d+)\]/i),offset=offsetMatch?Number(offsetMatch[1])/1000:0;
  meta=clean.split(/\r?\n/).filter(line=>/^\[[a-z][^:\]]*:/i.test(line)&&!/\[offset:/i.test(line));
  const found=[];
  for(const line of clean.split(/\r?\n/)){
   const marks=[...line.matchAll(new RegExp('\\['+stamp+'\\]','g'))];
   if(!marks.length)continue;
   const last=marks.at(-1),content=line.slice(last.index+last[0].length).replace(new RegExp('<'+stamp+'>','g'),'').trim();
   for(const mark of marks)found.push({start:Math.max(0,sec(mark)+offset),text:content,words:content?content.split(/\s+/):[],times:[]});
  }
  found.sort((a,b)=>a.start-b.start);
  if(!found.some(r=>r.words.length))throw Error('No regular timed lyrics found. Expected lines like [00:15.24] Your lyric here.');
  if(found.length>3000)throw Error('Maximum 3,000 lyric lines.');
  rows=found;cursor={line:rows.findIndex(r=>r.words.length),word:0};if(cursor.line<0)cursor.line=0;
  if(autoEnabled())autoTime(false);else seedManualTimes();
  render();
  say(autoEnabled()?`${rows.length} timed lines loaded. Auto Time Word is ON and timestamps were generated.`:`${rows.length} timed lines loaded. Auto Time Word is OFF; use Tap word for manual timing.`);
 }
 function autoTime(announce=true){
  rows.forEach((row,i)=>{
   if(!row.words.length){row.times=[];return;}
   const end=lineEnd(i),span=Math.max(.05,end-row.start),usable=Math.min(span-.01,Math.max(.05,span*.85));
   const step=Math.max(.01,usable/Math.max(1,row.words.length));
   row.times=row.words.map((_,j)=>clamp(row.start+j*step,row.start,Math.max(row.start,end-.01)));
  });
  if(announce){render();say('Auto Time Word recalculated all estimated word timestamps.');}
 }
 function say(message){els.status.textContent=message;}
 function selected(){const row=rows[cursor.line];return row?.words[cursor.word]!==undefined?{row,word:row.words[cursor.word]}:null;}
 function render(){
  els.lines.replaceChildren();
  rows.forEach((row,i)=>{
   const card=document.createElement('article');card.className='lyric-line';
   const head=document.createElement('div');head.className='line-head';
   const seek=document.createElement('button');seek.type='button';seek.className='mini';seek.textContent=`[${fmt(row.start)}]`;seek.title='Seek audio to this line';seek.onclick=()=>{els.player.currentTime=row.start;select(i,0);};
   const text=document.createElement('span');text.textContent=row.text||'(clear lyrics)';
   head.append(seek,text);card.append(head);
   if(row.words.length){
    const words=document.createElement('div');words.className='word-grid';
    row.words.forEach((word,j)=>{
     const item=document.createElement('label');item.className='word-item'+(i===cursor.line&&j===cursor.word?' active':'');
     const pick=document.createElement('button');pick.type='button';pick.className='word-pick';pick.textContent=word;pick.onclick=()=>select(i,j);
     const input=document.createElement('input');input.type='number';input.step='0.01';input.min=row.start.toFixed(2);input.max=Math.max(row.start,lineEnd(i)-.01).toFixed(2);input.value=(row.times[j]??row.start).toFixed(2);input.setAttribute('aria-label',`Time for ${word}`);
     input.onchange=()=>{row.times[j]=clamp(Number(input.value),row.start,Math.max(row.start,lineEnd(i)-.01));normalizeLine(i);render();};
     item.append(pick,input);words.append(item);
    });
    card.append(words);
   }
   els.lines.append(card);
  });
  const s=selected();els.current.textContent=s?`Selected: “${s.word}” · ${fmt(s.row.times[cursor.word])}`:'No word selected';
  const disabled=!s;for(const el of [els.tap,els.prev,els.next,els.minus,els.plus])el.disabled=disabled;
 }
 function normalizeLine(i){
  const row=rows[i],end=lineEnd(i)-.01;
  for(let j=0;j<row.times.length;j++){
   const min=j?row.times[j-1]+.01:row.start;
   row.times[j]=clamp(Number(row.times[j])||min,min,Math.max(min,end));
  }
 }
 function select(line,word){
  if(!rows[line]?.words.length)return;
  cursor={line,word:clamp(word,0,rows[line].words.length-1)};render();
  document.querySelector('.word-item.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 function move(delta){
  if(!selected())return;
  let l=cursor.line,w=cursor.word+delta;
  if(delta>0){while(l<rows.length){if(w<rows[l].words.length)return select(l,w);l++;w=0;}}
  else{while(l>=0){if(w>=0&&rows[l].words.length)return select(l,w);l--;w=(rows[l]?.words.length||0)-1;}}
 }
 function tap(){
  const s=selected();if(!s)return;
  const end=lineEnd(cursor.line),prev=cursor.word?s.row.times[cursor.word-1]+.01:s.row.start;
  const when=clamp(els.player.currentTime,prev,Math.max(prev,end-.01));s.row.times[cursor.word]=when;
  const remaining=s.row.words.length-cursor.word-1;
  if(remaining>0){const room=Math.max(.01,end-when),step=Math.max(.01,room/(remaining+1));for(let j=cursor.word+1;j<s.row.words.length;j++)s.row.times[j]=Math.min(end-.01,when+step*(j-cursor.word));}
  move(1);render();
 }
 function nudge(delta){const s=selected();if(!s)return;const j=cursor.word,min=j?s.row.times[j-1]+.01:s.row.start,max=(j<s.row.times.length-1?s.row.times[j+1]-.01:lineEnd(cursor.line)-.01);s.row.times[j]=clamp(s.row.times[j]+delta,min,Math.max(min,max));render();}
 function enhancedText(){
  const output=[...meta];
  for(let i=0;i<rows.length;i++){
   const row=rows[i];if(!row.words.length){output.push(`[${fmt(row.start)}]`);continue;}
   normalizeLine(i);
   const content=row.words.map((word,j)=>`<${fmt(row.times[j])}>${word}`).join(' ');
   output.push(`[${fmt(row.start)}]${content}`);
  }
  return output.join('\n')+'\n';
 }
 function exportLrc(){
  if(!rows.length)return say('Load an LRC file first.');
  if(downloadURL)URL.revokeObjectURL(downloadURL);
  downloadURL=URL.createObjectURL(new Blob([enhancedText()],{type:'text/plain;charset=utf-8'}));
  els.download.href=downloadURL;const base=(els.lrc.files?.[0]?.name||'lyrics').replace(/\.lrc$/i,'');els.download.download=`${base}.enhanced.lrc`;els.download.hidden=false;say('Enhanced LRC ready. Download it and use it directly in bratLRC.');
 }
 els.audio.addEventListener('change',()=>{
  if(audioURL)URL.revokeObjectURL(audioURL);const file=els.audio.files?.[0];if(!file)return;
  audioURL=URL.createObjectURL(file);els.player.src=audioURL;els.player.hidden=false;say(autoEnabled()?'Audio loaded. Auto Time Word is ON; add a regular LRC to generate word timing.':'Audio loaded. Auto Time Word is OFF.');
 });
 els.player.addEventListener('loadedmetadata',()=>{if(rows.length&&autoEnabled())autoTime(false);render();if(rows.length&&autoEnabled())say('Audio timing loaded. Auto Time Word recalculated the word timestamps.');});
 els.lrc.addEventListener('change',async()=>{
  try{const file=els.lrc.files?.[0];if(!file)return;if(!/\.lrc$/i.test(file.name))throw Error('Choose a file ending in .lrc.');if(file.size>512000)throw Error('LRC must be under 500 KB.');parseRegular(await file.text());}
  catch(error){rows=[];render();say(error.message);}
 });
 if(els.autoToggle)els.autoToggle.addEventListener('change',()=>{
  if(autoEnabled()){
   if(rows.length)autoTime(false);
   render();say(rows.length?'Auto Time Word is ON. Estimated word timestamps were regenerated.':'Auto Time Word is ON. Load an LRC to generate word timestamps automatically.');
  }else say('Auto Time Word is OFF. Existing timestamps are preserved for manual editing.');
 });
 els.auto.onclick=()=>autoTime();els.tap.onclick=tap;els.prev.onclick=()=>move(-1);els.next.onclick=()=>move(1);els.minus.onclick=()=>nudge(-.05);els.plus.onclick=()=>nudge(.05);els.download.addEventListener('click',()=>setTimeout(exportLrc,0));
 $('enhance-export').onclick=exportLrc;
 document.addEventListener('keydown',event=>{
  if(!document.getElementById('enhancer')?.contains(document.activeElement))return;
  if(event.target.matches('input'))return;
  if(event.key.toLowerCase()==='t'){event.preventDefault();tap();}
  if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
  if(event.key==='ArrowRight'){event.preventDefault();move(1);}
 });
 render();
})();
