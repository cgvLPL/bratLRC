(()=>{
 const $=id=>document.getElementById(id);
 const els={audio:$('enhance-audio'),lrc:$('enhance-lrc'),player:$('enhance-player'),lines:$('enhance-lines'),status:$('enhance-status'),current:$('enhance-current'),auto:$('enhance-auto'),autoToggle:$('enhance-auto-toggle'),speed:$('enhance-speed'),tap:$('enhance-tap'),prev:$('enhance-prev'),next:$('enhance-next'),minus:$('enhance-minus'),plus:$('enhance-plus'),minusBig:$('enhance-minus-big'),plusBig:$('enhance-plus-big'),syncLine:$('enhance-sync-line'),loop:$('enhance-loop'),seek:$('enhance-seek'),undo:$('enhance-undo'),download:$('enhance-download')};
 if(!els.audio)return;
 const enhancer=$('enhancer'),stamp='(\\d+):([0-5]\\d)(?:[.,:]([0-9]{1,3}))?';
 let rows=[],meta=[],cursor={line:0,word:0},audioURL=null,downloadURL=null,history=[],loopLine=false,loopTarget=0;
 const sec=m=>Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0'));
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 const autoEnabled=()=>!els.autoToggle||els.autoToggle.value!=='off';
 function fmt(value){const t=Math.max(0,Number(value)||0),m=Math.floor(t/60),s=t-m*60;return `${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;}
 function lineEnd(i){const next=rows[i+1]?.start;if(Number.isFinite(next))return next;if(Number.isFinite(els.player.duration))return els.player.duration;return rows[i].start+Math.max(3,rows[i].words.length*.55);}
 function say(message){els.status.textContent=message;}
 function selected(){const row=rows[cursor.line];return row?.words[cursor.word]!==undefined?{row,word:row.words[cursor.word]}:null;}
 function updateUndo(){if(els.undo)els.undo.disabled=!history.length;}
 function pushHistory(label){if(!rows.length)return;history.push({label,times:rows.map(row=>[...row.times]),cursor:{...cursor}});if(history.length>60)history.shift();updateUndo();}
 function undo(){const state=history.pop();if(!state)return;rows.forEach((row,i)=>row.times=[...(state.times[i]||[])]);cursor=state.cursor;updateUndo();render();say(`Undid ${state.label}.`);}
 function seedManualTimes(){rows.forEach((row,i)=>{if(!row.words.length){row.times=[];return;}const end=Math.max(row.start+.01,lineEnd(i)-.01);row.times=row.words.map((_,j)=>clamp(row.start+j*.01,row.start,end));});}
 function parseRegular(text){
  const clean=text.replace(/^\uFEFF/,'');
  const offsetMatch=clean.match(/\[offset:([+-]?\d+)\]/i),offset=offsetMatch?Number(offsetMatch[1])/1000:0;
  meta=clean.split(/\r?\n/).filter(line=>/^\[[a-z][^:\]]*:/i.test(line)&&!/\[offset:/i.test(line));
  const found=[];
  for(const line of clean.split(/\r?\n/)){
   const marks=[...line.matchAll(new RegExp('\\['+stamp+'\\]','g'))];if(!marks.length)continue;
   const last=marks.at(-1),content=line.slice(last.index+last[0].length).replace(new RegExp('<'+stamp+'>','g'),'').trim();
   for(const mark of marks)found.push({start:Math.max(0,sec(mark)+offset),text:content,words:content?content.split(/\s+/):[],times:[]});
  }
  found.sort((a,b)=>a.start-b.start);
  if(!found.some(r=>r.words.length))throw Error('No regular timed lyrics found. Expected lines like [00:15.24] Your lyric here.');
  if(found.length>3000)throw Error('Maximum 3,000 lyric lines.');
  rows=found;history=[];updateUndo();loopLine=false;updateLoopButton();cursor={line:rows.findIndex(r=>r.words.length),word:0};if(cursor.line<0)cursor.line=0;
  if(autoEnabled())autoTime(false);else seedManualTimes();render();
  say(autoEnabled()?`${rows.length} timed lines loaded. Auto Time Word is ON; manual taps can now refine the estimates.`:`${rows.length} timed lines loaded. Auto Time Word is OFF; use Sync this line and Tap word.`);
 }
 function autoTime(announce=true){
  if(announce&&rows.length)pushHistory('auto timing');
  rows.forEach((row,i)=>{if(!row.words.length){row.times=[];return;}const end=lineEnd(i),span=Math.max(.05,end-row.start),usable=Math.min(span-.01,Math.max(.05,span*.85)),step=Math.max(.01,usable/Math.max(1,row.words.length));row.times=row.words.map((_,j)=>clamp(row.start+j*step,row.start,Math.max(row.start,end-.01)));});
  if(announce){render();say('Auto Time Word recalculated all estimated word timestamps. Undo is available.');}
 }
 function updateLoopButton(){if(!els.loop)return;els.loop.setAttribute('aria-pressed',String(loopLine));els.loop.classList.toggle('active-toggle',loopLine);els.loop.innerHTML=loopLine?'Loop line ON <span>L</span>':'Loop line <span>L</span>';}
 function render(){
  els.lines.replaceChildren();
  rows.forEach((row,i)=>{
   const card=document.createElement('article');card.className='lyric-line'+(i===cursor.line?' selected-line':'');
   const head=document.createElement('div');head.className='line-head';
   const seek=document.createElement('button');seek.type='button';seek.className='mini';seek.textContent=`[${fmt(row.start)}]`;seek.title='Seek audio to this line';seek.onclick=()=>{els.player.currentTime=row.start;if(row.words.length)select(i,0);};
   const text=document.createElement('span');text.textContent=row.text||'(clear lyrics)';head.append(seek,text);card.append(head);
   if(row.words.length){
    const words=document.createElement('div');words.className='word-grid';
    row.words.forEach((word,j)=>{
     const item=document.createElement('label');item.className='word-item'+(i===cursor.line&&j===cursor.word?' active':'');
     const pick=document.createElement('button');pick.type='button';pick.className='word-pick';pick.textContent=word;pick.onclick=()=>select(i,j);
     const input=document.createElement('input');input.type='number';input.step='0.01';input.min=row.start.toFixed(2);input.max=Math.max(row.start,lineEnd(i)-.01).toFixed(2);input.value=(row.times[j]??row.start).toFixed(2);input.setAttribute('aria-label',`Time for ${word}`);
     input.onchange=()=>{pushHistory('timestamp edit');row.times[j]=clamp(Number(input.value),row.start,Math.max(row.start,lineEnd(i)-.01));normalizeLine(i);render();};
     item.append(pick,input);words.append(item);
    });card.append(words);
   }
   els.lines.append(card);
  });
  const s=selected();
  els.current.textContent=s?`Line ${cursor.line+1}/${rows.length} · Word ${cursor.word+1}/${s.row.words.length} · “${s.word}” · ${fmt(s.row.times[cursor.word])}`:'No word selected';
  const disabled=!s;for(const el of [els.tap,els.prev,els.next,els.minus,els.plus,els.minusBig,els.plusBig,els.syncLine,els.seek])if(el)el.disabled=disabled;
  updateUndo();updateLoopButton();
 }
 function normalizeLine(i){const row=rows[i],end=lineEnd(i)-.01;for(let j=0;j<row.times.length;j++){const min=j?row.times[j-1]+.01:row.start;row.times[j]=clamp(Number(row.times[j])||min,min,Math.max(min,end));}}
 function select(line,word,scroll=true){if(!rows[line]?.words.length)return;cursor={line,word:clamp(word,0,rows[line].words.length-1)};render();if(scroll)document.querySelector('.word-item.active')?.scrollIntoView({block:'nearest',inline:'nearest'});}
 function move(delta){if(!selected())return;let l=cursor.line,w=cursor.word+delta;if(delta>0){while(l<rows.length){if(w<rows[l].words.length)return select(l,w);l++;w=0;}}else{while(l>=0){if(w>=0&&rows[l].words.length)return select(l,w);l--;w=(rows[l]?.words.length||0)-1;}}}
 function tap(){
  const s=selected();if(!s)return;pushHistory('word tap');
  const line=cursor.line,wordIndex=cursor.word,end=lineEnd(line),prev=wordIndex?s.row.times[wordIndex-1]+.01:s.row.start,when=clamp(els.player.currentTime,prev,Math.max(prev,end-.01));
  s.row.times[wordIndex]=when;
  const remaining=s.row.words.length-wordIndex-1;
  if(remaining>0){const room=Math.max(.01,end-when),step=Math.max(.01,room/(remaining+1));for(let j=wordIndex+1;j<s.row.words.length;j++)s.row.times[j]=Math.min(end-.01,when+step*(j-wordIndex));}
  if(loopLine&&line===loopTarget&&wordIndex===s.row.words.length-1)select(loopTarget,0);else move(1);
  render();
 }
 function nudge(delta){const s=selected();if(!s)return;pushHistory('timing nudge');const j=cursor.word,min=j?s.row.times[j-1]+.01:s.row.start,max=(j<s.row.times.length-1?s.row.times[j+1]-.01:lineEnd(cursor.line)-.01);s.row.times[j]=clamp(s.row.times[j]+delta,min,Math.max(min,max));render();}
 function seekSelected(){const s=selected();if(!s||!Number.isFinite(s.row.times[cursor.word]))return;els.player.currentTime=Math.max(0,s.row.times[cursor.word]-.12);say(`Seeked to “${s.word}”.`);}
 function syncLine(){const s=selected();if(!s)return;const line=cursor.line;loopTarget=line;select(line,0);els.player.currentTime=Math.max(0,rows[line].start-.65);els.player.play().catch(()=>{});say(`Syncing line ${line+1}. Tap T on each word as you hear it.`);}
 function toggleLoop(){if(!selected())return;loopLine=!loopLine;if(loopLine)loopTarget=cursor.line;updateLoopButton();say(loopLine?`Loop Line is ON for line ${loopTarget+1}.`:'Loop Line is OFF.');}
 function playPause(){if(!els.player.src)return say('Load editor audio first.');if(els.player.paused)els.player.play().catch(()=>{});else els.player.pause();}
 function enhancedText(){const output=[...meta];for(let i=0;i<rows.length;i++){const row=rows[i];if(!row.words.length){output.push(`[${fmt(row.start)}]`);continue;}normalizeLine(i);const content=row.words.map((word,j)=>`<${fmt(row.times[j])}>${word}`).join(' ');output.push(`[${fmt(row.start)}]${content}`);}return output.join('\n')+'\n';}
 function exportLrc(){if(!rows.length)return say('Load an LRC file first.');if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=URL.createObjectURL(new Blob([enhancedText()],{type:'text/plain;charset=utf-8'}));els.download.href=downloadURL;const base=(els.lrc.files?.[0]?.name||'lyrics').replace(/\.lrc$/i,'');els.download.download=`${base}.enhanced.lrc`;els.download.hidden=false;say('Enhanced LRC ready. Download it and use it directly in bratLRC.');}
 els.audio.addEventListener('change',()=>{if(audioURL)URL.revokeObjectURL(audioURL);const file=els.audio.files?.[0];if(!file)return;audioURL=URL.createObjectURL(file);els.player.src=audioURL;els.player.hidden=false;els.player.playbackRate=Number(els.speed?.value||1);say(autoEnabled()?'Audio loaded. Auto Time Word is ON; add a regular LRC to generate word timing.':'Audio loaded. Auto Time Word is OFF.');});
 els.player.addEventListener('loadedmetadata',()=>{if(rows.length&&autoEnabled())autoTime(false);render();if(rows.length&&autoEnabled())say('Audio timing loaded. Auto Time Word recalculated the word timestamps.');});
 els.player.addEventListener('timeupdate',()=>{if(!loopLine||!rows[loopTarget])return;const end=lineEnd(loopTarget);if(els.player.currentTime>=end-.025){select(loopTarget,0,false);els.player.currentTime=Math.max(0,rows[loopTarget].start-.2);els.player.play().catch(()=>{});}});
 els.lrc.addEventListener('change',async()=>{try{const file=els.lrc.files?.[0];if(!file)return;if(!/\.lrc$/i.test(file.name))throw Error('Choose a file ending in .lrc.');if(file.size>512000)throw Error('LRC must be under 500 KB.');parseRegular(await file.text());}catch(error){rows=[];history=[];render();say(error.message);}});
 if(els.autoToggle)els.autoToggle.addEventListener('change',()=>{if(autoEnabled()){if(rows.length){pushHistory('Auto Time Word toggle');autoTime(false);}render();say(rows.length?'Auto Time Word is ON. Estimated word timestamps were regenerated.':'Auto Time Word is ON. Load an LRC to generate word timestamps automatically.');}else say('Auto Time Word is OFF. Existing timestamps are preserved for manual editing.');});
 if(els.speed)els.speed.addEventListener('change',()=>{els.player.playbackRate=Number(els.speed.value)||1;say(`Playback speed set to ${els.player.playbackRate.toFixed(2)}×.`);});
 els.auto.onclick=()=>autoTime();els.tap.onclick=tap;els.prev.onclick=()=>move(-1);els.next.onclick=()=>move(1);els.minus.onclick=()=>nudge(-.02);els.plus.onclick=()=>nudge(.02);els.minusBig.onclick=()=>nudge(-.1);els.plusBig.onclick=()=>nudge(.1);els.syncLine.onclick=syncLine;els.loop.onclick=toggleLoop;els.seek.onclick=seekSelected;els.undo.onclick=undo;$('enhance-export').onclick=exportLrc;
 enhancer?.addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea'))return;
  const key=event.key.toLowerCase();if(event.repeat&&!['arrowleft','arrowright'].includes(key))return;
  if(event.code==='Space'){event.preventDefault();playPause();return;}
  if(key==='t'){event.preventDefault();tap();}
  else if(key==='r'){event.preventDefault();syncLine();}
  else if(key==='l'){event.preventDefault();toggleLoop();}
  else if(key==='s'){event.preventDefault();seekSelected();}
  else if(key==='u'){event.preventDefault();undo();}
  else if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
  else if(event.key==='ArrowRight'){event.preventDefault();move(1);}
 });
 render();
})();
