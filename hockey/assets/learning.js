(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('learningData').textContent);
  const root = document.getElementById('screenRoot');
  const lessons = new Map(D.lessons.map(x => [x.id, x]));
  const episodes = new Map(D.episodes.map(x => [x.id, x]));
  const STORE = 'hockey-stap-voor-stap-v1';
  const FOLDER = D.delivery?.mode === 'folder';
  const PAGE_DEFAULTS = {'START.html':'#start','coachmoment.html':'#coach-0','met-de-bal.html':'#momenten-bal','elkaar-helpen.html':'#momenten-helpen','samen-verdedigen.html':'#momenten-verdedigen','naslag.html':'#naslag'};
  const GROUP_PAGES = {bal:'met-de-bal.html',helpen:'elkaar-helpen.html',verdedigen:'samen-verdedigen.html'};
  const CURRENT_PAGE = Object.hasOwn(PAGE_DEFAULTS,D.delivery?.page) ? D.delivery.page : 'START.html';
  const DEFAULT_ROUTE = PAGE_DEFAULTS[CURRENT_PAGE];
  const PROGRESS_IDS = D.recommendedOrder.slice();
  const PROGRESS_MAX = (1 << PROGRESS_IDS.length) - 1;
  const COACH_COUNT = 4 + D.comparison.comparisons.length * 2 + (D.comparison.comparisons.length ? 1 : 0);
  function routeOwner(hash){
    let m;
    if(hash==='#start'||hash==='#momenten')return 'START.html';
    if((m=String(hash).match(/^#momenten-(bal|helpen|verdedigen)$/)))return GROUP_PAGES[m[1]];
    if((m=String(hash).match(/^#coach-(\d+)$/))&&Number(m[1])<COACH_COUNT)return 'coachmoment.html';
    if((m=String(hash).match(/^#les-([A-Z]\d{2})-([0-4])$/))&&lessons.has(m[1]))return GROUP_PAGES[lessons.get(m[1]).group]||null;
    if(hash==='#naslag'||hash==='#naslag-bronnen')return 'naslag.html';
    if((m=String(hash).match(/^#naslag-([A-Z]\d{2})$/))&&episodes.has(m[1]))return 'naslag.html';
    return null;
  }
  function validResume(hash){return typeof hash==='string'&&hash.length<40&&/^#(?:les-|coach-)/.test(hash)&&Boolean(routeOwner(hash));}
  function progressQuery(){
    let mask=0;PROGRESS_IDS.forEach((id,i)=>{if(saved.completed.includes(id))mask|=1<<i;});
    return `p=${mask}&c=${saved.coachDone?1:0}${validResume(saved.last)?'&r='+encodeURIComponent(saved.last):''}`;
  }
  function routeURL(hash){if(hash==='#main')return hash;const owner=routeOwner(hash);return !owner||!FOLDER?hash:`${owner}?${progressQuery()}${hash}`;}
  function internalRoute(href){
    if(typeof href!=='string')return null;
    if(href.startsWith('#'))return routeOwner(href)?href:null;
    const m=href.match(/^(?:\.\/)?([^/?#]+)(?:\?[^#]*)?(#[^]*)?$/);
    if(!m||!Object.hasOwn(PAGE_DEFAULTS,m[1]))return null;
    const hash=m[2]||PAGE_DEFAULTS[m[1]];return routeOwner(hash)?hash:null;
  }
  function rewriteLinks(){document.querySelectorAll('a[href]').forEach(a=>{const hash=a.hasAttribute('data-open-sources')?'#naslag-bronnen':a.dataset.route||internalRoute(a.getAttribute('href'));if(hash){a.setAttribute('data-route',hash);a.setAttribute('href',routeURL(hash));}});}

  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const fmt = value => { const n=Math.max(0,Number(value)||0); return `${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`; };
  const seconds = n => Number(n.toFixed(1)).toLocaleString('nl-NL');
  let saved = {completed:[],last:null,coachDone:false};
  try { const read=JSON.parse(localStorage.getItem(STORE)||'null'); if(read&&typeof read==='object'){saved.completed=Array.isArray(read.completed)?read.completed.filter(id=>lessons.has(id)):[]; saved.last=validResume(read.last)?read.last:null; saved.coachDone=read.coachDone===true;} } catch (_) {}
  // file:// storage can be scoped per HTML file. Internal links also carry only
  // a validated progress bitmask, coach completion flag and resumable route.
  if(FOLDER){try{const q=new URLSearchParams(location.search||''),raw=q.get('p');if(raw!==null&&/^\d{1,5}$/.test(raw)){const mask=Number(raw);if(Number.isInteger(mask)&&mask>=0&&mask<=PROGRESS_MAX)PROGRESS_IDS.forEach((id,i)=>{if((mask&(1<<i))&&!saved.completed.includes(id))saved.completed.push(id);});}if(q.get('c')==='1')saved.coachDone=true;const resume=q.get('r');if(validResume(resume))saved.last=resume;}catch(_){}}
  let activePlayer=null, activeRoute=null, activeImage=null, filter='all', initial=true, suppressFullClose=false;
  const revealed=new Set(), imageCache=new Map();
  const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify(saved));}catch(_){}};
  function imageURI(assetId){const meta=D.images[assetId];if(meta?.url)return meta.url;if(!imageCache.has(assetId)){const node=$(assetId);if(!meta||!node)return '';imageCache.set(assetId,`data:${meta.mime};base64,${node.textContent.trim()}`);}return imageCache.get(assetId);}
  function nearestStill(clipId,time){const c=D.clips[clipId];return c.snapshots.reduce((a,b)=>Math.abs(b.time-time)<Math.abs(a.time-time)?b:a,c.snapshots[0]);}
  function stillFor(lesson){return nearestStill(lesson.still.clipId,lesson.still.time);}
  function saveLast(hash){saved.last=hash;persist();}
  function navigate(hash){const owner=routeOwner(hash);if(FOLDER&&owner&&owner!==CURRENT_PAGE){persist();location.href=routeURL(hash);return;}if(location.hash===hash)render();else location.hash=hash;}
  function pauseActive(){if(activePlayer)activePlayer.video.pause();}
  function cleanupPlayer(){const p=activePlayer;activePlayer=null;if(!p)return;p.abort.abort();cancelAnimationFrame(p.raf);try{p.video.pause();p.video.removeAttribute('src');p.video.load();}catch(_){}if(p.url)URL.revokeObjectURL(p.url);}
  function setNav(type){document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===type)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  function sourceBadge(episodeId){const e=episodes.get(episodeId);return `<span class="pill">Wedstrijd ${e.series}</span><span class="quiet">Wij: groen · tegenstander: ${esc(e.opponent)}</span>`;}
  function revealBox(key,question,body,label='Toon toelichting'){
    const open=revealed.has(key),id=`answer-${key}`;
    return `<div class="question-box"><p class="eyebrow">Analysevraag</p><h3>${esc(question)}</h3><button class="btn" type="button" data-reveal="${esc(key)}" data-target="${esc(id)}" data-label="${esc(label)}" aria-expanded="${open}" aria-controls="${esc(id)}">${open?'Toelichting verbergen':esc(label)}</button><div class="answer-box" id="${esc(id)}" ${open?'':'hidden'}>${body}</div></div>`;
  }
  function stillHTML(snapshot,caption,lessonId){const focus=D.focusRegions?.[lessonId];const mark=focus?`<span class="focus-ellipse" aria-hidden="true" style="left:${focus.x}%;top:${focus.y}%;width:${focus.w}%;height:${focus.h}%"></span>`:'';return `<figure class="still-figure"><button class="still-open" type="button" data-image="${esc(snapshot.assetId)}" data-caption="${esc(caption)}" ${focus?`data-focus="${lessonId}"`:''} aria-label="Vergroot het stilstaande beeld"><span class="still-visual"><img src="${imageURI(snapshot.assetId)}" alt="Stilstaand wedstrijdbeeld bij ${esc(caption)}${focus?' Gemarkeerd: '+esc(focus.description):''}">${mark}</span><span class="zoom-label">Vergroot beeld ↗</span></button><figcaption>${focus?`Geel gemarkeerd: ${esc(focus.description)} · `:'Stilstaand beeld · '}brontijd ${fmt(snapshot.time)}</figcaption></figure>`;}
  function videoHTML(range,{full=false,listen=false}={}){
    const c=D.clips[range.clipId],duration=range.end-range.start,prefix=full?'full':'step';
    return `<div class="video-box"><video id="${prefix}Video" playsinline preload="metadata" ${full?'controls':''} poster="${imageURI(c.poster)}" aria-label="${listen?'Coachgesprek':'Wedstrijdfragment'} uit wedstrijd ${episodes.get(c.episodeId).series}"></video></div><div class="player-controls"><button class="btn primary" type="button" id="${prefix}PlayClip" disabled>${listen?'Gesprek afspelen':'Fragment afspelen'}</button><button class="btn" type="button" id="${prefix}RestartClip" disabled>Fragment herhalen</button><button class="btn small speed-toggle" type="button" id="${prefix}SlowClip" aria-pressed="false">Halve snelheid</button>${c.hasAudio?`<button class="btn small" type="button" id="${prefix}SoundClip" aria-pressed="true">Geluid: aan</button>`:''}</div><p class="player-status" id="${prefix}PlayerStatus" role="status">Fragment laden…</p><p class="video-error" id="${prefix}VideoError" hidden></p>${!c.hasAudio?'<p class="audio-hint">Dit fragment heeft geen geluid.</p>':listen?'<p class="audio-hint">Zet je geluid aan om het gesprek te horen.</p>':''}<div class="clip-meta"><span>${full?'Volledig fragment':listen?'Gesprek':'Geselecteerd fragment'} · ${seconds(duration)} seconden</span><span>Brontijd <output id="${prefix}SourceClock">${fmt(range.start)}</output></span></div>${full?`<details class="source-detail"><summary>Over dit fragment</summary><p>${esc(c.source)} · ${fmt(c.start)}–${fmt(c.end)} · ${esc(c.label)}</p></details>`:''}`;
  }
  function videoBlob(clip){const base=$(clip.assetId).textContent.trim(),parts=[],chunk=1024*1024;for(let offset=0;offset<base.length;offset+=chunk){const binary=atob(base.slice(offset,offset+chunk)),bytes=new Uint8Array(binary.length);for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);parts.push(bytes);}return new Blob(parts,{type:'video/mp4'});}
  function setupVideo(range,{full=false,listen=false}={}){
    cleanupPlayer();
    const prefix=full?'full':'step',get=name=>$(prefix+name);
    const video=get('Video'),clip=D.clips[range.clipId];if(!video||!clip)return;
    const p={video,clip,range,full,listen,abort:new AbortController(),raf:0,url:null,ready:false,ended:false};activePlayer=p;
    const signal=p.abort.signal,play=get('PlayClip'),restart=get('RestartClip'),status=get('PlayerStatus'),error=get('VideoError'),clock=get('SourceClock');
    const localStart=Math.max(0,range.start-clip.start), localEnd=Math.min(clip.duration,range.end-clip.start);
    const valid=()=>activePlayer===p;
    const on=(name,fn)=>video.addEventListener(name,fn,{signal});
    function update(){if(!valid())return;clock.textContent=fmt(clip.start+video.currentTime);if(!full&&p.ready&&!video.seeking&&video.currentTime>=localEnd-0.018){p.ended=true;video.pause();if(Math.abs(video.currentTime-localEnd)>.025){try{video.currentTime=localEnd;}catch(_){}}play.textContent='Opnieuw afspelen';status.textContent='De selectie is afgelopen.';}}
    function tick(){if(!valid()||video.paused)return;update();if(!video.paused)p.raf=requestAnimationFrame(tick);}
    function setStart(){p.ended=false;try{video.currentTime=localStart;}catch(_){}clock.textContent=fmt(range.start);}
    function ready(){if(!valid()||p.ready)return;p.ready=true;setStart();play.disabled=false;restart.disabled=false;status.textContent=listen?'Gesprek gereed.':full?'Volledig fragment gereed.':'Het fragment stopt aan het einde van de selectie.';}
    async function run(restartFromStart=false){if(!valid()||!p.ready)return;if(restartFromStart||p.ended||video.currentTime>=localEnd-.04||video.currentTime<localStart-.05)setStart();error.hidden=true;try{await video.play();}catch(err){if(valid()&&err.name!=='AbortError'){error.textContent='Het afspelen is nog niet gestart. Selecteer opnieuw Afspelen.';error.hidden=false;}}}
    on('loadedmetadata',ready);on('canplay',ready);on('timeupdate',update);on('seeking',()=>{if(!full&&p.ready&&video.currentTime<localStart-.1)setStart();});
    on('play',()=>{if(!valid())return;p.ended=false;play.textContent='Pauze';status.textContent=listen?'Gesprek wordt afgespeeld.':'Let op het aangegeven aandachtspunt.';cancelAnimationFrame(p.raf);p.raf=requestAnimationFrame(tick);});
    on('pause',()=>{if(!valid())return;cancelAnimationFrame(p.raf);play.textContent=p.ended?'Opnieuw afspelen':'Afspelen hervatten';if(!p.ended)status.textContent='Gepauzeerd.';});
    on('ended',()=>{if(!valid())return;p.ended=true;play.textContent='Opnieuw afspelen';status.textContent='Fragment afgelopen.';});
    on('error',()=>{if(!valid())return;error.textContent=clip.url?`Deze video is niet gevonden of kon niet worden geopend: ${clip.url}. Pak alle vijf ZIP-bestanden uit in dezelfde map, zodat START.html en de map media samen in Hockey_stap_voor_stap staan. Open daarna START.html opnieuw.`:'De browser kon deze video niet afspelen. Open het gedownloade HTML-bestand in een actuele browser.';error.hidden=false;status.textContent='De video is niet beschikbaar.';play.disabled=true;restart.disabled=true;});
    play.addEventListener('click',()=>video.paused?run():video.pause(),{signal});
    restart.addEventListener('click',()=>run(true),{signal});
    get('SlowClip').addEventListener('click',event=>{const slow=video.playbackRate!==.5;video.playbackRate=slow?.5:1;event.currentTarget.setAttribute('aria-pressed',String(slow));},{signal});
    const sound=get('SoundClip');if(sound)sound.addEventListener('click',()=>{video.muted=!video.muted;sound.textContent=video.muted?'Geluid: uit':'Geluid: aan';sound.setAttribute('aria-pressed',String(!video.muted));},{signal});
    try{if(clip.url){video.src=clip.url;}else{p.url=URL.createObjectURL(videoBlob(clip));video.src=p.url;}video.load();if(video.readyState>=1)ready();}catch(_){error.textContent=clip.url?`Het bestand ${clip.url} kon niet worden klaargezet. Pak alle vijf ZIP-bestanden uit in dezelfde map Hockey_stap_voor_stap en open START.html opnieuw.`:'Het fragment kon niet worden klaargezet. Open het gedownloade bestand opnieuw.';error.hidden=false;status.textContent='De video is niet beschikbaar.';}
  }
  function renderHome(){
    const count=new Set(saved.completed).size;
    root.innerHTML=`${saved.last?`<div class="resume-row"><p><strong>Welkom terug.</strong> ${count?`${count} van de 14 momenten afgerond.`:'Je kunt verdergaan waar je was.'}</p><a class="btn small" href="${esc(saved.last)}">Verdergaan →</a></div>`:''}<section class="hero"><div><p class="eyebrow">Hockey · analyse van jullie wedstrijden</p><h1 id="viewHeading" tabindex="-1">Inzicht in jullie samenspel.</h1><p class="intro">Per moment: de situatie, de beelden, de analyse en één toepassing voor het veld.</p></div><aside class="hero-note"><p class="eyebrow">Werkwijze</p><p>Elke analyse behandelt één aandachtspunt.</p><p class="quiet">Kies een moment en doorloop de vijf stappen.</p></aside></section><div class="route-grid"><section class="route-card featured"><span class="route-tag">Het coachmoment</span><h2>Waarom is de coach zo enthousiast?</h2><p>Bekijk het coachmoment en vergelijk het samenspel met momenten uit de eerste wedstrijd.</p><div class="actions"><a class="btn primary" href="#coach-0">Bekijk het coachmoment →</a></div><p class="quiet" style="margin-top:15px">Korte vergelijkingen met de eerste wedstrijd.</p></section><section class="route-card"><span class="route-tag">Ruimte benutten</span><h2>Voortbouwen op wat al werkt.</h2><p>Bekijk hoe een gerichte dribbel de aanval vooruithelpt in de eerste wedstrijd.</p><div class="actions"><a class="btn" href="#les-E05-0">Bekijk de dribbel →</a></div><p class="quiet" style="margin-top:15px">Van wedstrijdbeeld naar toepassing in vijf stappen.</p></section></div><p class="home-footnote">Een ander onderwerp bekijken? <a href="#momenten">Bekijk de 14 wedstrijdmomenten.</a> De uitgebreide analyses staan bij <a href="#naslag">Naslag</a>.</p>`;
  }
  const stepNames=['Situatie','Fragment','Analyse','Toepassing','Kernpunt'];
  function lessonFooter(lesson,step){const i=D.recommendedOrder.indexOf(lesson.id),next=D.recommendedOrder[i+1];return `<div class="learning-footer">${step>0?`<a class="btn ghost" href="#les-${lesson.id}-${step-1}">← Vorige</a>`:'<a class="btn ghost" href="#momenten">← Alle momenten</a>'}<span class="position">Stap ${step+1} van 5</span>${step<4?`<a class="btn primary next-btn" href="#les-${lesson.id}-${step+1}">${['Naar het fragment','Naar de analyse','Naar de toepassing','Naar het kernpunt'][step]} →</a>`:`<button class="btn primary next-btn" type="button" data-complete="${lesson.id}" data-next="${next||''}">${next?'Afronden en volgend moment':'Analyse afronden'} ✓</button>`}</div>`;}
  function renderLesson(id,step){const l=lessons.get(id),e=episodes.get(id),group=D.curriculum.find(g=>g.id===l.group),index=D.recommendedOrder.indexOf(id)+1;saveLast(`#les-${id}-${step}`);
    let body='';
    if(step===0)body=`<p class="large-copy">${esc(l.intro)}</p><div class="goal-box"><p class="eyebrow">Aandachtspunt</p><p>${esc(l.goal)}</p></div><p class="quiet" style="margin-top:23px">Het fragment duurt ${seconds(l.watch.end-l.watch.start)} seconden en richt zich op dit aandachtspunt.</p>`;
    if(step===1)body=`<div class="focus-line"><span class="focus-label">Let op</span><span>${esc(l.focus)}</span></div>${videoHTML(l.watch)}`;
    if(step===2)body=`${stillHTML(stillFor(l),l.question,id)}${revealBox(`lesson-${id}`,l.question,`<h3>Waarneming</h3><p>${esc(l.answer)}</p>`)}<p class="quiet" style="margin-top:18px">Vergelijk je observatie met de toelichting.</p>`;
    if(step===3)body=`<div class="action-card"><p class="eyebrow">Toepassing in het veld</p><p>${esc(l.action)}</p></div><div class="support-card"><h3>Rol van medespeelsters</h3><p>${esc(l.teammate)}</p></div><details class="boundary"><summary>Nuance</summary><p>${esc(l.nuance)}</p></details>`;
    if(step===4)body=`<p class="takeaway">${esc(l.takeaway)}</p><p>Pas dit aandachtspunt toe in de volgende wedstrijd.</p>${l.extraListen?'<div class="actions"><a class="btn" href="#coach-0">Bekijk het coachmoment</a></div>':''}`;
    root.innerHTML=`<section class="lesson-shell"><div class="route-head"><p class="eyebrow">${esc(group?.label||'Wedstrijdmoment')} · moment ${index} van 14</p><a class="text-link" href="#momenten">Kies een ander moment</a></div><ol class="stepper" aria-label="Stappen in deze analyse">${stepNames.map((name,i)=>`<li><button type="button" data-lesson-step="${i}" data-lesson-id="${id}" ${i===step?'aria-current="step"':''}><span class="step-num">${i+1}</span><span class="step-word">${name}</span></button></li>`).join('')}</ol><article class="step-card"><p class="eyebrow">${stepNames[step]}</p><h2 id="viewHeading" tabindex="-1">${esc(l.simpleTitle)}</h2><div class="step-context">${sourceBadge(id)}</div>${body}</article>${lessonFooter(l,step)}<div class="lesson-help"><button class="text-link" type="button" data-full="${id}">Bekijk het volledige fragment</button><a class="text-link" href="#naslag-${id}">Uitgebreide analyse bij dit moment</a></div></section>`;
    if(step===1)setupVideo(l.watch);
  }
  function makeCoachSteps(){const c=D.comparison,steps=[{kind:'listen',title:'Het compliment en de reactie van de bank',section:'Het coachmoment',range:c.coach,focus:c.coach.focus}];c.comparisons.forEach((pair,i)=>{steps.push({kind:'first',title:pair.title,section:`Vergelijking ${i+1} van ${c.comparisons.length}`,pair,index:i,range:pair.first,focus:pair.first.focus});steps.push({kind:'second',title:pair.title,section:`Vergelijking ${i+1} van ${c.comparisons.length}`,pair,index:i,range:pair.second,focus:pair.second.focus});if(i===0)steps.push({kind:'why',title:'De aanval gaat door na een lastige pass',section:'Vervolg van de aanval',range:{...c.coach.why[1],episodeId:'L02'},focus:'Blijf groen volgen nadat de pass in het bereik van de witte stick komt.'});});steps.push({kind:'follow',title:c.followUp.title,section:'Het moment na het compliment',range:c.followUp,focus:c.followUp.focus});steps.push({kind:'already',title:c.alreadyGood.title,section:'Voortbouwen op wat al werkt',range:c.alreadyGood,focus:'Volg groen met de bal. Kijk hoe zij terrein wint richting het doel.'});steps.push({kind:'summary',title:'Kernpunten uit de vergelijking',section:'Samenvatting'});return steps;}
  const coachSteps=makeCoachSteps();
  function renderCoach(index){const c=D.comparison,s=coachSteps[index];saveLast(`#coach-${index}`);let body='';
    if(s.kind==='summary')body=`<p class="large-copy">${esc(c.coach.summary)}</p><div class="comparison-recap">${c.comparisons.map((p,i)=>`<div class="recap-item"><p class="eyebrow">${i+1}</p><h3>${esc(p.remember)}</h3></div>`).join('')}</div><details class="boundary"><summary>Aandachtspunten</summary><p>${esc(c.stillLearning.text)}</p><div class="inline-links">${c.stillLearning.episodeIds.map(id=>`<a href="#les-${id}-0">${esc(lessons.get(id).simpleTitle)}</a>`).join('')}</div></details><p style="margin-top:24px">${esc(c.closing)}</p>`;
    else {
      const label=s.kind==='listen'?'Het gesprek met de bank':s.kind==='first'?'Eerste wedstrijd':s.kind==='already'?'Dit lukte al in de eerste wedstrijd':'Tweede wedstrijd';
      body=`<span class="comparison-label ${s.kind==='listen'?'listen':s.kind==='first'||s.kind==='already'?'':'second'}">${label}</span>${s.kind==='listen'?'<p>Jullie coach is enthousiast over de aanval. De volgende fragmenten laten zien welke acties bij dat compliment passen.</p>':''}${s.kind==='second'&&s.index===2?'<p class="quiet">Dit moment komt later dan het compliment. Het laat ook bij het verdedigen goed samenspel zien.</p>':''}<div class="focus-line"><span class="focus-label">${s.kind==='listen'?'Luister':'Let op'}</span><span>${esc(s.focus)}</span></div>${videoHTML(s.range,{listen:s.kind==='listen'})}`;
      if(s.kind==='listen')body+=revealBox('coach-listen','Wat zeggen de coach en de bank?',`<h3>De strekking van het gesprek</h3><p>${esc(c.coach.meaning)}</p><p class="quiet">${esc(c.coach.sourceNote)}</p>`,'Lees de strekking')+`<details class="boundary"><summary>Welke beelden vergelijken we?</summary><p>${esc(c.scopeNote)}</p></details>`;
      if(s.kind==='first')body+=`<p class="comparison-caption">${esc(s.pair.first.caption)}</p><p class="quiet" style="margin-top:15px">Het volgende fragment toont een beter vervolg in de tweede wedstrijd.</p>`;
      if(s.kind==='second')body+=revealBox(`coach-pair-${s.index}`,s.pair.question,`<h3>Het zichtbare verschil</h3><p>${esc(s.pair.difference)}</p><h3 style="margin-top:18px">Effect op het samenspel</h3><p>${esc(s.pair.benefit)}</p>`,'Bekijk het verschil')+`<details class="boundary"><summary>Context van de vergelijking</summary><p>${esc(s.pair.nuance)}</p></details>`;
      if(s.kind==='why')body+=revealBox('coach-continue','Wat doet groen na de lastige pass?',`<h3>Groen zet de aanval voort</h3><p>${esc(c.coach.why[1].text)}</p><p>De aanval krijgt een vervolg doordat teamgenoten beschikbaar blijven na de pass.</p>`);
      if(s.kind==='follow')body+=revealBox('coach-follow','Hoe krijgt de aanval een vervolg na het eerste duel?',`<h3>Groen vervolgt de aanval</h3><p>${esc(c.followUp.text)}</p><p>${esc(c.followUp.remember)}</p>`)+`<p class="boundary">${esc(c.followUp.nuance)}</p>`;
      if(s.kind==='already')body+=`<p class="comparison-caption">${esc(c.alreadyGood.text)}</p>`;
    }
    const nextLabel=s.kind==='first'?'Bekijk wedstrijd 2':s.kind==='listen'?'Bekijk het eerste verschil':s.kind==='summary'?'Naar de wedstrijdmomenten':'Volgende stap';
    root.innerHTML=`<section class="lesson-shell"><div class="route-head"><p class="eyebrow">Waarom de coach enthousiast is</p><a class="text-link" href="#start">Naar start</a></div><div class="comparison-progress"><span>${esc(s.section)}</span><progress max="${coachSteps.length}" value="${index+1}" aria-label="Voortgang in de coachroute"></progress><span>${index+1} / ${coachSteps.length}</span></div><article class="step-card"><h2 id="viewHeading" tabindex="-1">${esc(s.title)}</h2>${body}</article><div class="learning-footer">${index>0?`<a class="btn ghost" href="#coach-${index-1}">← Vorige</a>`:'<a class="btn ghost" href="#start">← Start</a>'}<span class="position">Eén aandachtspunt per moment</span>${s.kind==='summary'?`<button class="btn primary next-btn" type="button" data-coach-done>${nextLabel} →</button>`:`<a class="btn primary next-btn" href="#coach-${index+1}">${nextLabel} →</a>`}</div>${s.range?`<div class="lesson-help"><button class="text-link" type="button" data-full="${esc(D.clips[s.range.clipId].episodeId)}" data-clip="${esc(s.range.clipId)}">Bekijk het volledige fragment</button><a class="text-link" href="#les-${D.clips[s.range.clipId].episodeId}-0">Analyse van dit moment</a></div>`:''}</section>`;
    if(s.range)setupVideo(s.range,{listen:s.kind==='listen'});
  }
  function renderLibrary(){const selected=D.recommendedOrder.map(id=>lessons.get(id)).filter(l=>filter==='all'||l.group===filter);root.innerHTML=`<section><div class="library-intro"><p class="eyebrow">Eén aandachtspunt per moment</p><h1 id="viewHeading" tabindex="-1">Wedstrijdmomenten per thema</h1><p>Kies een moment of een thema. Elke analyse volgt vijf stappen: situatie, fragment, analyse, toepassing en kernpunt.</p></div>${saved.completed.length?`<div class="progress-summary"><span>${new Set(saved.completed).size} van de 14 momenten afgerond.</span><span class="quiet">De analyses blijven beschikbaar om opnieuw te bekijken.</span></div>`:''}<div class="category-tabs" role="group" aria-label="Kies een onderwerp"><button type="button" data-group="all" aria-pressed="${filter==='all'}">Alle momenten</button>${D.curriculum.map(g=>`<button type="button" data-group="${g.id}" aria-pressed="${filter===g.id}">${esc(g.label)}</button>`).join('')}</div><div class="lesson-grid">${selected.map(l=>`<article class="lesson-card"><div class="card-top"><span>Wedstrijd ${episodes.get(l.id).series} · 5 stappen</span>${saved.completed.includes(l.id)?'<span class="done-badge">Afgerond ✓</span>':''}</div><h3>${esc(l.simpleTitle)}</h3><p>${esc(l.goal)}</p><a class="btn small" href="#les-${l.id}-0">${saved.completed.includes(l.id)?'Analyse heropenen':'Open analyse'} →</a></article>`).join('')}</div></section>`;}
  function renderArchive(id){const selected=id&&episodes.has(id)?id:'E05';root.innerHTML=`<section><div class="archive-intro"><p class="eyebrow">Verdieping</p><h1 id="viewHeading" tabindex="-1">Uitgebreide analyses.</h1><p>Hier staan de volledige analyses van beide wedstrijden, met alle fragmenten, beelden en aanvullende toelichting.</p></div><div class="archive-controls"><label for="archiveSelect">Kies een moment</label><select id="archiveSelect">${D.episodes.map(e=>`<option value="${e.id}" ${e.id===selected?'selected':''}>${e.id} · ${esc(lessons.get(e.id).simpleTitle)}</option>`).join('')}</select><button class="btn small" type="button" data-full="${selected}">Alle beelden bij dit moment</button><a class="btn small" href="#les-${selected}-0">Naar de analyse in stappen</a></div><div class="archive-content" id="originalDetail"></div>${D.appendices.map(a=>`<details class="archive-details" ${a.id==='appendix-bronnen'?'id="sourcesDetails"':''}><summary>${esc(a.title)}</summary><div class="archive-content" data-appendix="${esc(a.id)}"></div></details>`).join('')}<div class="actions"><button class="btn" type="button" data-print>Print de kernpunten</button></div><p class="quiet" style="margin-top:16px">Je voortgang wordt op dit apparaat opgeslagen als de browser dit toestaat.</p></section>`;
    const template=$(`detail-${selected}`);if(template)$('originalDetail').append(template.content.cloneNode(true));
    document.querySelectorAll('[data-appendix]').forEach(container=>{const t=$(container.dataset.appendix);if(t)container.append(t.content.cloneNode(true));});
    $('archiveSelect').addEventListener('change',e=>navigate(`#naslag-${e.target.value}`));
  }
  function openFull(episodeId,clipId){const e=episodes.get(episodeId);if(!e)return;pauseActive();const selected=e.clips.includes(clipId)?clipId:e.clips[0],c=D.clips[selected];$('fullTitle').textContent=lessons.get(episodeId).simpleTitle;$('fullBody').innerHTML=`<div class="step-context">${sourceBadge(episodeId)}</div>${e.clips.length>1?`<div class="clip-tabs" role="group" aria-label="Kies een deel">${e.clips.map(id=>`<button class="btn small" type="button" data-full="${episodeId}" data-clip="${id}" aria-pressed="${id===selected}">${esc(D.clips[id].label)}</button>`).join('')}</div>`:''}${videoHTML({clipId:selected,start:c.start,end:c.end},{full:true})}<h3 style="margin-top:24px">Alle stilstaande beelden bij dit fragment</h3><div class="snapshot-list">${c.snapshots.map(s=>`<article class="snapshot-item"><button type="button" data-image="${s.assetId}" data-caption="${esc(s.caption)}" aria-label="Vergroot: ${esc(s.label)}"><img src="${imageURI(s.assetId)}" alt="${esc(s.label)}" loading="lazy"></button><p>${esc(s.label)}</p><button class="text-link" type="button" data-seek="${s.time}">Bekijk vanaf ${fmt(s.time)}</button></article>`).join('')}</div><p class="full-note">Dit zijn de volledige fragmenten en sleutelbeelden uit de eerdere analyses. De analyses in stappen richten zich op een selectie binnen deze fragmenten.</p>`;const dialog=$('fullDialog');if(!dialog.open)dialog.showModal();setupVideo({clipId:selected,start:c.start,end:c.end},{full:true});}
  function positionImage(){const current=activeImage;if(!current)return;requestAnimationFrame(()=>{if(activeImage!==current)return;const box=$('imageScroll'),canvas=$('imageCanvas'),c=D.clips[D.images[current.assetId].clipId],w=canvas.clientWidth,h=canvas.clientHeight||w*c.height/c.width;const x=current.focus?(current.focus.x+current.focus.w/2)/100:.5,y=current.focus?(current.focus.y+current.focus.h/2)/100:.5;box.scrollLeft=current.zoom>1?Math.max(0,w*x-box.clientWidth/2):0;box.scrollTop=current.zoom>1?Math.max(0,h*y-box.clientHeight/2):0;});}
  function zoomImage(detail){if(!activeImage)return;activeImage.zoom=detail?activeImage.focus?Math.max(2,Math.min(4,65/activeImage.focus.w)):2:1;$('imageCanvas').style.width=activeImage.zoom*100+'%';$('imagePanHint').hidden=!detail;document.querySelectorAll('[data-image-zoom]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.imageZoom==='detail')===detail)));positionImage();}
  function openImage(assetId,caption,focusId){const m=D.images[assetId];if(!m)return;pauseActive();$('imageTitle').textContent=`Stilstaand beeld · ${fmt(m.time)}`;$('imageView').src=imageURI(assetId);$('imageView').alt=caption||m.label;$('imageCaption').textContent=caption||m.caption;const focus=focusId&&lessons.get(focusId)?.still.assetId===assetId?D.focusRegions?.[focusId]:null,mark=$('imageFocus');mark.hidden=!focus;if(focus){mark.style.left=focus.x+'%';mark.style.top=focus.y+'%';mark.style.width=focus.w+'%';mark.style.height=focus.h+'%';$('imageCaption').textContent=`${caption} Geel gemarkeerd: ${focus.description}`;}activeImage={assetId,focus,zoom:1};if(!$('imageDialog').open)$('imageDialog').showModal();zoomImage(Boolean(focus));}
  function render(focus=true){cleanupPlayer();if($('imageDialog').open)$('imageDialog').close();if($('fullDialog').open){suppressFullClose=true;$('fullDialog').close();}const requested=location.hash||(FOLDER?DEFAULT_ROUTE:'#start'),hash=FOLDER&&!routeOwner(requested)?DEFAULT_ROUTE:requested;let match;const owner=routeOwner(hash);if(FOLDER&&owner&&owner!==CURRENT_PAGE){navigate(hash);return;}
    if((match=hash.match(/^#les-([A-Z]\d{2})-([0-4])$/))&&lessons.has(match[1])){activeRoute={type:'lesson',id:match[1],step:+match[2]};setNav('momenten');renderLesson(match[1],+match[2]);}
    else if((match=hash.match(/^#coach-(\d+)$/))&&+match[1]<coachSteps.length){activeRoute={type:'coach',step:+match[1]};setNav('coach');renderCoach(+match[1]);}
    else if((match=hash.match(/^#momenten(?:-(bal|helpen|verdedigen))?$/))){filter=match[1]||'all';activeRoute={type:'library',group:filter};setNav('momenten');renderLibrary();}
    else if(hash==='#naslag-bronnen'){activeRoute={type:'archive'};setNav('naslag');renderArchive();const det=$('sourcesDetails');if(det){det.open=true;det.scrollIntoView();}}
    else if((match=hash.match(/^#naslag(?:-([A-Z]\d{2}))?$/))){activeRoute={type:'archive',id:match[1]};setNav('naslag');renderArchive(match[1]);}
    else{activeRoute={type:'home'};setNav('start');renderHome();}
    rewriteLinks();persist();if(focus&&!initial){$('viewHeading')?.focus({preventScroll:true});if(hash!=='#naslag-bronnen')$('main').scrollIntoView({block:'start',behavior:'auto'});}initial=false;
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.getAttribute('href')==='#main'){event.preventDefault();$('viewHeading')?.focus();return;}
    if(target.tagName?.toLowerCase()==='a'&&target.dataset.route&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&(event.button===undefined||event.button===0)){event.preventDefault();navigate(target.dataset.route);return;}
    if(target.dataset.lessonStep!==undefined){event.preventDefault();navigate(`#les-${target.dataset.lessonId}-${target.dataset.lessonStep}`);}
    else if(target.dataset.reveal){pauseActive();const key=target.dataset.reveal,box=$(target.dataset.target),open=!revealed.has(key);if(open)revealed.add(key);else revealed.delete(key);box.hidden=!open;target.setAttribute('aria-expanded',String(open));target.textContent=open?'Toelichting verbergen':target.dataset.label;}
    else if(target.dataset.group){navigate(target.dataset.group==='all'?'#momenten':`#momenten-${target.dataset.group}`);}
    else if(target.dataset.complete){const id=target.dataset.complete;if(!saved.completed.includes(id))saved.completed.push(id);persist();navigate(target.dataset.next?`#les-${target.dataset.next}-0`:'#momenten');}
    else if(target.hasAttribute('data-coach-done')){saved.coachDone=true;persist();navigate('#momenten');}
    else if(target.dataset.full){event.preventDefault();openFull(target.dataset.full,target.dataset.clip);}
    else if(target.dataset.image){event.preventDefault();openImage(target.dataset.image,target.dataset.caption,target.dataset.focus);}
    else if(target.dataset.imageZoom){zoomImage(target.dataset.imageZoom==='detail');}
    else if(target.dataset.seek){const p=activePlayer;if(p){p.video.pause();p.video.currentTime=Math.max(0,Math.min(p.clip.duration,Number(target.dataset.seek)-p.clip.start));p.ended=false;}}
    else if(target.dataset.closeDialog){$(target.dataset.closeDialog)?.close();}
    else if(target.hasAttribute('data-print')){window.print();}
    else if(target.hasAttribute('data-open-sources')){event.preventDefault();navigate('#naslag-bronnen');}
  });
  $('fullDialog').addEventListener('close',()=>{if(suppressFullClose){suppressFullClose=false;return;}render(false);});
  $('imageDialog').addEventListener('close',()=>{activeImage=null;$('imageView').removeAttribute('src');});
  $('imageView').addEventListener('load',positionImage);
  window.addEventListener('hashchange',()=>render());
  window.addEventListener('pagehide',cleanupPlayer);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseActive();});
  render(false);
})();
