'use strict';
// Wordbound: The Letter Quest - game code (needs art.js and words.js loaded first)
(function(){
const FAST=/[#&?]fast\b/.test(location.hash+location.search);   // used only by the automated tests

/* =====================================================================
  WORD SEARCH (COMMON = everyday words, RARE = uncommon words)
   Both lists are family-friendly and checked against a Scrabble word list.
   ===================================================================== */
const PREFIX=new Set();
for(const set of [COMMON,RARE]) for(const w of set) for(let i=1;i<=w.length;i++) PREFIX.add(w.slice(0,i));
const isWord=w=>COMMON.has(w)||RARE.has(w);

/* =====================================================================
   HELPERS, STORAGE, SETTINGS
   ===================================================================== */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,FAST?0:ms));
const store={
  get(k,d){try{const v=localStorage.getItem('wordbound_'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem('wordbound_'+k,JSON.stringify(v))}catch(e){}}
};
let S=Object.assign({tips:true,hintAnim:true,live:true,auto:false,fx:true,reduce:false,master:80,music:45,sfx:80,sound:true,difficulty:'normal'},store.get('settings',{}));
if(!['casual','normal','challenge'].includes(S.difficulty))S.difficulty='normal';
const saveS=()=>store.set('settings',S);

const OLD_LEVEL_INDEX_MAP=[0,1,2,5,6,7,10,11,12,15,16,17,18,19];
const SAVE_DEF=()=>({v:3,started:false,unlocked:1,stars:{},best:{},seen:{},items:{star:2,crystal:1,hour:1},
  coins:0,xp:0,shards:0,relics:{},keys:{},ach:{},endlessBest:0,
  stats:{words:0,rare:0,cleansed:0,hints:0,longest:'',levelsWon:0,endlessRuns:0,bought:0,maxCombo:0}});
function loadSave(){
  const d=SAVE_DEF(),s=store.get('save',{})||{};
  const out=Object.assign(d,s);
  out.items=Object.assign(SAVE_DEF().items,s.items||{});
  out.stats=Object.assign(SAVE_DEF().stats,s.stats||{});
  ['stars','best','seen','relics','keys','ach'].forEach(k=>{out[k]=Object.assign({},s[k]||{})});
  if((s.v||0)<3){
    for(const key of ['stars','best']){
      const remapped={};
      for(const [index,value] of Object.entries(s[key]||{})){
        const next=OLD_LEVEL_INDEX_MAP[Number(index)];
        if(next!==undefined)remapped[next]=value;
      }
      out[key]=remapped;
    }
    out.unlocked=OLD_LEVEL_INDEX_MAP[Math.max(0,Math.min(13,(s.unlocked||1)-1))]+1;
    out.v=3;
  }
  return out;
}
let SAVE=loadSave();
const saveP=()=>store.set('save',SAVE);
function applyReduce(){document.body.classList.toggle('reduce',!!S.reduce)}
const reducedMotion=()=>S.reduce||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);

/* player level from XP: level n needs 120*(n-1)^2 xp */
const lvlOf=xp=>1+Math.floor(Math.sqrt(Math.max(0,xp)/120));
const xpFor=n=>120*(n-1)*(n-1);
const totalStars=()=>Object.values(SAVE.stars).reduce((a,b)=>a+b,0);

/* =====================================================================
   SOUND (all synthesised, no files). Each area has its own little tune.
   ===================================================================== */
const MUSIC={
  title:  {root:220,   scale:[0,3,5,7,10],    pad:'sine',    bell:false,beat:.62,arp:.55},
  forest: {root:261.63,scale:[0,2,4,7,9],     pad:'triangle',bell:false,beat:.55,arp:.7},
  caverns:{root:293.66,scale:[0,2,3,7,9],     pad:'sine',    bell:true, beat:.66,arp:.6},
  library:{root:196,   scale:[0,3,5,7,10],    pad:'triangle',bell:false,beat:.72,arp:.5},
  wordwell:{root:174.61,scale:[0,2,4,6,7,11], pad:'sine',    bell:true, beat:.7, arp:.65},
  city:   {root:329.63,scale:[0,2,4,7,9],     pad:'triangle',bell:false,beat:.46,arp:.8}
};
const Snd={
  ctx:null,master:null,sfx:null,music:null,timer:null,scene:'title',beat:0,idx:5,tension:false,
  init(){
    if(this.ctx)return;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
    try{
      const c=this.ctx=new AC();
      this.master=c.createGain();this.sfx=c.createGain();this.music=c.createGain();
      this.sfx.connect(this.master);this.music.connect(this.master);this.master.connect(c.destination);
      // soft echo so the synth pads feel roomy
      const d=c.createDelay(1),fb=c.createGain(),lp=c.createBiquadFilter(),wet=c.createGain();
      d.delayTime.value=.36;fb.gain.value=.36;lp.type='lowpass';lp.frequency.value=1700;wet.gain.value=.5;
      this.music.connect(d);d.connect(lp);lp.connect(fb);fb.connect(d);lp.connect(wet);wet.connect(this.master);
      this.apply();this.startMusic();
    }catch(e){this.ctx=null}
  },
  apply(){
    if(!this.ctx)return;
    this.master.gain.value=S.sound?S.master/100:0;
    this.sfx.gain.value=S.sfx/100;
    this.music.gain.value=S.music/100*0.5;
  },
  tone(f,d,type,v,delay,dest){
    if(!this.ctx||!S.sound)return;
    const t=this.ctx.currentTime+(delay||0),o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type||'sine';o.frequency.setValueAtTime(f,t);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v||.2,t+.015);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    o.connect(g);g.connect(dest||this.sfx);o.start(t);o.stop(t+d+.05);
  },
  note(n){const p=[261.63,293.66,329.63,392,440];return p[((n%5)+5)%5]*Math.pow(2,Math.floor(n/5))},
  select(n){this.tone(this.note(n+3),.16,'triangle',.16)},
  success(len){for(let i=0;i<Math.min(len,7);i++)this.tone(this.note(i+4),.22,'triangle',.18,i*.06);this.tone(this.note(len+6),.5,'sine',.14,len*.06)},
  fail(){this.tone(150,.22,'sawtooth',.12);this.tone(110,.28,'sawtooth',.1,.08)},
  veyra(){this.tone(82,1,'sawtooth',.16);this.tone(87,1,'sawtooth',.12);this.tone(58,1.2,'sine',.2)},
  power(){[0,2,4,7].forEach((n,i)=>this.tone(this.note(n+5),.25,'sine',.15,i*.07))},
  win(){[0,2,4,5,7,9,11,12].forEach((n,i)=>this.tone(this.note(n%5+Math.floor(n/5)*5+3),.4,'triangle',.18,i*.11))},
  lose(){[7,5,3,0].forEach((n,i)=>this.tone(this.note(n),.5,'sine',.15,i*.18))},
  coin(){this.tone(988,.09,'square',.05);this.tone(1319,.22,'square',.05,.07)},
  combo(n){const b=this.note(6+Math.min(n,6));this.tone(b,.18,'triangle',.15);this.tone(b*1.5,.3,'sine',.12,.08)},
  praise(len){[0,2,4,7].slice(0,Math.min(4,len-3)).forEach((n,i)=>this.tone(this.note(n+8),.3,'sine',.12,i*.05))},
  trophy(){[0,4,7,12].forEach((n,i)=>this.tone(523.25*Math.pow(2,n/12),.35,'triangle',.14,i*.1))},
  levelup(){[0,4,7,12,16].forEach((n,i)=>this.tone(392*Math.pow(2,n/12),.4,'triangle',.16,i*.09))},
  buy(){this.tone(880,.08,'square',.06);this.tone(1174,.08,'square',.06,.07);this.tone(1568,.25,'square',.06,.14)},
  setScene(n){this.scene=MUSIC[n]?n:'title';this.idx=5},
  setTension(b){this.tension=!!b},
  startMusic(){
    if(this.timer)return;
    const tick=()=>{
      if(!this.ctx||document.hidden||!S.sound)return;
      const m=MUSIC[this.scene]||MUSIC.title,sc=m.scale,n=sc.length;
      const fr=i=>m.root*Math.pow(2,(sc[((i%n)+n)%n]+12*Math.floor(i/n))/12);
      const b=this.beat++;
      if(b%8===0){                                   // slow pad chord every 8 beats
        const deg=[0,3,2,4][(b/8)%4|0];
        this.tone(fr(deg-n),m.beat*8.5,m.pad,.11,0,this.music);
        this.tone(fr(deg-n+2),m.beat*8.5,'sine',.07,0,this.music);
        this.tone(fr(deg),m.beat*8.5,'sine',.05,0,this.music);
      }
      if(this.tension&&b%4===0)this.tone(m.root/4,m.beat*4,'triangle',.13,0,this.music);
      if(Math.random()<m.arp){                       // wandering arpeggio (stays on the scale)
        this.idx=Math.max(n-2,Math.min(n*2+2,this.idx+[-2,-1,-1,0,1,1,2][Math.floor(Math.random()*7)]));
        this.tone(fr(this.idx),1.1,'triangle',.07,0,this.music);
        if(m.bell&&Math.random()<.35)this.tone(fr(this.idx+n),1.6,'sine',.045,.04,this.music);
      }
    };
    tick();this.timer=setInterval(tick,Math.round(620));
  }
};
['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{Snd.init();if(Snd.ctx&&Snd.ctx.state==='suspended')Snd.ctx.resume()}));

/* =====================================================================
   ART: portraits and icons come from the magazine art; scenery is drawn in SVG
   ===================================================================== */
const im=(src,alt)=>`<img src="${src}" alt="${alt}" draggable="false">`;
const PORT={
 aria:im(ART.faceAria,'Aria Vale'),
 rowan:im(ART.faceRowan,'Rowan Quill'),
 veyra:im(ART.faceVeyra,'Veyra'),
 lumi:im(ART.faceLumi,'Lumi'),
 narrator:`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#2a1660"/><path d="M14 68L50 76L86 68L86 30L50 38L14 30Z" fill="#f2e2bd" stroke="#b98d4a" stroke-width="3"/><path d="M50 38V76" stroke="#b98d4a" stroke-width="3"/><g fill="#6A3BC2" font-family="Cinzel,serif" font-weight="900" font-size="14"><text x="24" y="58">A</text><text x="60" y="58">Z</text></g><path d="M50 8l4 9 9 2-9 2-4 9-4-9-9-2 9-2z" fill="#FFD166"/></svg>`
};
const NAMES={aria:'ARIA VALE',rowan:'ROWAN QUILL',veyra:'VEYRA',lumi:'LUMI',narrator:'LEXICONIA'};
const ICON={
 star:'<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .9-5.1 4.9 1.3 7L12 17.8 5.8 21.3l1.3-7L2 9.4l7-.9z"/></svg>',
 crystal:'<svg viewBox="0 0 24 24"><path d="M12 1l7 7-4 15H9L5 8z"/></svg>',
 hour:'<svg viewBox="0 0 24 24"><path d="M6 2h12v4l-4 6 4 6v4H6v-4l4-6-4-6z"/></svg>',
 hint:'<svg viewBox="0 0 24 24"><path d="M12 1l2.2 7.8L22 11l-7.8 2.2L12 21l-2.2-7.8L2 11l7.8-2.2z"/></svg>',
 gem:'<svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/></svg>',
 bag:'<svg viewBox="0 0 24 24"><path d="M9 2h6l1 3h2.5A1.5 1.5 0 0 1 20 6.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5A1.5 1.5 0 0 1 5.5 5H8zm1.4 2L10 5h4l-.4-1zM8 10v2h8v-2z"/></svg>'
};
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const sceneCache={};
function sceneSVG(name){
  if(sceneCache[name])return sceneCache[name];
  const R=rng(name.length*97+name.charCodeAt(1)*13);let s='<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">';
  if(name==='title'){
    for(let i=0;i<70;i++)s+=`<circle cx="${R()*1600}" cy="${R()*520}" r="${.8+R()*1.8}" fill="#fff" opacity="${.3+R()*.7}"/>`;
    s+='<circle cx="1180" cy="190" r="90" fill="#f4e6ff" opacity=".9"/><circle cx="1150" cy="170" r="90" fill="#2a1160" opacity=".35"/>';
    s+='<g stroke="#e23cf5" stroke-width="2" opacity=".5">';
    for(let i=-14;i<=14;i++)s+=`<line x1="800" y1="560" x2="${800+i*260}" y2="900"/>`;
    for(let i=0;i<9;i++){const y=560+Math.pow(i/8,2)*340;s+=`<line x1="0" y1="${y}" x2="1600" y2="${y}"/>`}
    s+='</g><rect x="0" y="556" width="1600" height="5" fill="#ff7be9" opacity=".4"/>';
  }else if(name==='forest'){
    s+='<polygon points="600,0 760,0 1000,900 520,900" fill="#eaffc8" opacity=".05"/><polygon points="1000,0 1100,0 1400,900 1050,900" fill="#eaffc8" opacity=".04"/>';
    for(let i=0;i<13;i++){const x=i*130+R()*60,w=36+R()*46;s+=`<ellipse cx="${x+w/2}" cy="${210+R()*110}" rx="${120+R()*60}" ry="${140+R()*60}" fill="#2EBB57" opacity="${.10+R()*.12}"/><rect x="${x}" y="${260+R()*60}" width="${w}" height="700" rx="10" fill="#08160f" opacity=".85"/>`}
    for(let i=0;i<22;i++)s+=`<circle class="fly" style="animation-delay:${-R()*4}s" cx="${R()*1600}" cy="${300+R()*520}" r="${2+R()*2.5}" fill="#FFD166"/>`;
    s+='<rect x="0" y="820" width="1600" height="80" fill="#07130c"/>';
  }else if(name==='caverns'){
    const cols=['#3A9DFF','#6A3BC2','#7fd0ff','#a06bff'];
    for(let i=0;i<16;i++){const x=i*105+R()*40,w=60+R()*70,h=180+R()*380;s+=`<polygon points="${x},900 ${x+w*.25},${900-h} ${x+w*.55},${900-h*.72} ${x+w},900" fill="${cols[i%4]}" opacity="${.35+R()*.3}"/>`}
    for(let i=0;i<12;i++){const x=i*140+R()*60,w=50+R()*70,h=120+R()*280;s+=`<polygon points="${x},0 ${x+w*.5},${h} ${x+w},0" fill="${cols[(i+1)%4]}" opacity="${.25+R()*.25}"/>`}
    for(let i=0;i<20;i++)s+=`<circle class="fly" style="animation-delay:${-R()*4}s" cx="${R()*1600}" cy="${200+R()*600}" r="${1.5+R()*2.5}" fill="#9bd8ff"/>`;
  }else if(name==='library'){
    s+='<path d="M640 900V300Q640 130 800 130Q960 130 960 300V900Z" fill="#ffe9b0" opacity=".12"/><path d="M700 900V310Q700 190 800 190Q900 190 900 310V900Z" fill="#9bd0ff" opacity=".10"/>';
    const bc=['#7a2b2b','#2b4a7a','#3a6a3a','#6a4a1a','#5a2b6a','#8a5a2a'];
    for(let row=0;row<4;row++){const y=120+row*200;s+=`<rect x="0" y="${y+150}" width="1600" height="16" fill="#3a2010"/>`;let x=R()*20;while(x<1600){if(R()<.22){x+=26;continue}const w=14+R()*20,h=90+R()*55;s+=`<rect x="${x}" y="${y+150-h}" width="${w}" height="${h}" fill="${bc[Math.floor(R()*6)]}" opacity=".75"/>`;x+=w+2}}
    for(let i=0;i<14;i++)s+=`<circle class="fly" style="animation-delay:${-R()*4}s" cx="${R()*1600}" cy="${100+R()*700}" r="${1.5+R()*2}" fill="#ffd98a"/>`;
  }else if(name==='city'){
    for(let i=0;i<70;i++)s+=`<circle cx="${R()*1600}" cy="${R()*400}" r="${.7+R()*1.6}" fill="#fff" opacity="${.3+R()*.6}"/>`;
    s+='<circle cx="1260" cy="180" r="72" fill="#ffe9b0" opacity=".92"/><circle cx="1236" cy="164" r="72" fill="#3a1f7a" opacity=".22"/>';
    s+='<path d="M0 640Q300 540 620 620T1200 600T1600 630V900H0Z" fill="#2d1a66" opacity=".85"/>';
    s+='<g fill="#160c3c"><rect x="700" y="340" width="200" height="420"/><polygon points="688,340 800,170 912,340"/><rect x="630" y="450" width="64" height="310"/><polygon points="620,450 662,340 704,450"/><rect x="906" y="450" width="64" height="310"/><polygon points="896,450 938,340 980,450"/></g>';
    for(let i=0;i<18;i++){const w=56+R()*44,h=130+R()*210,x=i*92-10+R()*30;if(x>600&&x<1000)continue;s+=`<rect x="${x}" y="${770-h}" width="${w}" height="${h+140}" fill="#1b0f45" opacity=".95"/><polygon points="${x-4},${770-h} ${x+w/2},${770-h-46} ${x+w+4},${770-h}" fill="#241458"/>`}
    for(let i=0;i<46;i++)s+=`<rect class="fly" style="animation-delay:${-R()*4}s" x="${R()*1560}" y="${380+R()*380}" width="8" height="12" rx="2" fill="#ffd166"/>`;
    s+='<rect x="0" y="770" width="1600" height="130" fill="#0c0626"/>';
  }else{
    for(let i=1;i<=8;i++)s+=`<ellipse cx="800" cy="640" rx="${i*95}" ry="${i*26}" fill="none" stroke="#9bd0ff" stroke-width="2" opacity="${.5-i*.05}"/>`;
    s+='<rect x="740" y="0" width="120" height="640" fill="#c9a4ff" opacity=".10"/>';
    const L='WORDLIFEHOPEMEMORYTRUTH';
    for(let i=0;i<26;i++)s+=`<text class="drift" style="animation-delay:${-R()*9}s" x="${R()*1560}" y="${80+R()*720}" font-family="Cinzel,serif" font-weight="900" font-size="${28+R()*40}" fill="#e6d7ff" opacity="${.08+R()*.18}">${L[Math.floor(R()*L.length)]}</text>`;
  }
  return sceneCache[name]=s+'</svg>';
}
const SCENE_ART={forest:ART.bgForest,caverns:ART.bgCaverns,library:ART.bgLibrary};
function setScene(name,sat){
  const el=$('#scenery');
  if(el.dataset.scene!==name){
    el.dataset.scene=name;el.className='scene-'+name;
    el.innerHTML=(SCENE_ART[name]?`<div class="art" style="background-image:url(${SCENE_ART[name]})"></div>`:'')+sceneSVG(name);
    Snd.setScene(name);
  }
  el.style.setProperty('--sat',sat==null?1:sat);
  el.style.setProperty('--bri',sat==null?1:(.75+sat*.25));
}

/* =====================================================================
   GAME DATA
   ===================================================================== */
const AREAS=[
 {id:'forest',name:'The Whispering Forest',diff:'Easy',blurb:'Small words. Simple puzzles.',art:ART.bgForest},
 {id:'caverns',name:'The Crystal Caverns',diff:'Medium',blurb:'Longer words. New obstacles.',art:ART.bgCaverns},
 {id:'library',name:'The Ancient Library',diff:'Hard',blurb:'Trickier grids. Less time.',art:ART.bgLibrary},
 {id:'wordwell',name:'The Wordwell',diff:'Extreme',blurb:'Strongest puzzles. The final challenge.',art:null},
 {id:'city',name:'Lexiconia City',diff:'Endless',blurb:'No target, no ending. Keep the words alive as long as you can.',art:ART.bgCity}
];
const BASE_LEVELS=[
 {a:0,title:'Fading Signs',moves:14,score:600,words:5,wl:'Restore 5 signs',
  story:'The signposts along the forest road have gone blank. Spell words to bring them back.',
  tip:'Short words still count. Try READ, PATH or SALE, then work toward longer ones.'},
 {a:0,title:'The Hushed Path',moves:14,score:900,long:{n:2,len:5},
  story:'The old trees have forgotten their names. Longer words wake them faster.',
  tip:'Look for endings like -ING, -ED and -ER. A short word plus a suffix is an easy way to get to five letters.'},
 {a:0,title:'Lantern Trail',moves:15,score:1100,long:{n:2,len:6},words:6,
  story:'Lumi leads the way through the dark roots. The trail only glows when the words come back to life.',
  tip:'Four-letter words count toward longer-word goals. Lumi can help when a path is hard to spot.'},
 {a:1,title:'Glowing Veins',moves:15,score:1200,long:{n:3,len:5},v:{every:5,kinds:['scramble'],voids:0},
  story:'The crystals hum with half-remembered speech. Something is watching from the dark.',
  tip:'Veyra will scramble the grid every few moves. Do not plan too far ahead.'},
 {a:1,title:"Veyra's Echo",moves:16,score:1400,hp:700,v:{every:4,kinds:['void','scramble'],voids:2},
  story:'Veyra steps out of the shadows. Every word you form pushes her back.',
  tip:'Dark Blank tiles cannot be used. Form a word next to one and it is cleansed.'},
 {a:1,title:'Shattered Lattice',moves:17,score:1800,hp:850,long:{n:3,len:6},v:{every:4,kinds:['void','scramble'],voids:3},
  story:'The cavern walls have cracked into broken glyphs. You can hear the city in every echo.',
  tip:'When Veyra acts, a short word is better than a stalled chain. Keep the board alive and move forward.'},
 {a:2,title:'Empty Shelves',moves:16,score:1700,long:{n:3,len:6},time:180,
  story:'Home, and the shelves are bare. Veyra is taking letters faster now, and time is short.',
  tip:'Words of four or more letters earn extra moves. Use them to stay ahead of the clock.'},
 {a:2,title:'The Locked Archive',moves:16,score:2000,long:{n:3,len:6},time:180,v:{every:5,kinds:['void','scramble'],voids:3},
  story:'The archive is sealed with a lock made of missing words. Break it open.',
  tip:'Stuck? Lumi can sniff out a word for free, five times per level.'},
 {a:2,title:'Astral Catalog',moves:17,score:2400,long:{n:3,len:7},time:200,v:{every:4,kinds:['void','scramble'],voids:3},
  story:'The library lifts its dusty ceilings as the first true names return. The shelves begin to remember their own shape.',
  tip:'Four-letter words count toward long-word goals, so look for a short path you can complete.'},
 {a:3,title:'The Dry Well',moves:17,score:2300,hp:1000,long:{n:2,len:7},time:210,v:{every:4,kinds:['scramble','void'],voids:3},
  story:'The Wordwell is almost dry. Veyra guards it, and she is stronger here.',
  tip:'Rare words are marked in purple, but every word follows the same simple score scale.'},
 {a:3,title:'Remember',moves:18,score:2800,hp:1500,words:10,long:{n:2,len:7},time:210,v:{every:4,kinds:['void','scramble'],voids:3},
  story:'This is the last stand. Fight the Blank the only way Aria can: by remembering.',
  tip:'Use every power-up you have. Nothing is worth saving now.'},
 {a:3,title:'The Tenth Lantern',moves:18,score:3300,hp:1700,long:{n:2,len:8},time:225,v:{every:4,kinds:['void','scramble'],voids:3},
  story:'The last lantern still burns in the shadows. Veyra has learned to hide in the very edges of the grid.',
  tip:'A strong chain is better than a rushed word. Look for a long word you can finish from the edge.'},
 {a:3,title:'The Name of Light',moves:19,score:3900,hp:2000,words:12,long:{n:2,len:8},time:240,v:{every:3,kinds:['void','scramble'],voids:4},
  story:'The Wordwell answers only to names that still mean something. Say the right one and the dark will part.',
  tip:'If the grid feels messy, pause for one beat and hunt for the tallest word. The longest path usually wins.'},
 {a:3,title:'The Last Bell',moves:20,score:4600,hp:2500,words:14,long:{n:3,len:8},time:255,v:{every:3,kinds:['void','scramble'],voids:4},
  story:'The final bell of Lexiconia is ringing in silence. Every letter must be chosen with care.',
  tip:'High-value words are worth more than safety. If you see a long word, take it and keep the streak alive.'}
];
const LEVELS=[
 ...BASE_LEVELS.slice(0,3),
 {a:0,title:'The Greenway',moves:15,score:1250,words:6,
  story:'The path opens into a green stretch where the old trail markers glow again.',
  tip:'A few short words can carry you through this level. Use Lumi if a path is hard to spot.'},
 {a:0,title:'The Living Signs',moves:16,score:1450,long:{n:2,len:5},words:7,
  story:'The final forest signs point toward a cavern beneath the roots.',
  tip:'Look for a four-letter word first. Longer words still earn extra moves.'},
 ...BASE_LEVELS.slice(3,6),
 {a:1,title:'Crystal Crossing',moves:16,score:1550,long:{n:2,len:5},v:{every:6,kinds:['scramble'],voids:1},
  story:'A bridge of crystal spans the cavern. Each restored word lights another step.',
  tip:'The tiles stay settled longer here. Try a four-letter word to keep your moves up.'},
 {a:1,title:'The Echo Chamber',moves:17,score:1750,hp:950,long:{n:2,len:6},v:{every:6,kinds:['void','scramble'],voids:2},
  story:'Veyra waits in the echo chamber, where every word returns stronger.',
  tip:'Lumi has five free hints. Use one whenever you need a clear path.'},
 ...BASE_LEVELS.slice(6,9),
 {a:2,title:'The Hidden Stacks',moves:17,score:2100,long:{n:2,len:6},time:210,
  story:'A hidden aisle appears behind the archive shelves, filled with books that still remember.',
  tip:'Four-letter words count toward the longer-word goal and can earn you another move.'},
 {a:2,title:'The Star Index',moves:18,score:2300,long:{n:2,len:7},time:220,v:{every:6,kinds:['void','scramble'],voids:2},
  story:'The star index reveals the route to the Wordwell at the heart of the library.',
  tip:'Take your time. You only need two words of four or more letters for the bonus goal.'},
 ...BASE_LEVELS.slice(9)
];
const ENDLESS={a:4,endless:true,title:'Endless Mode',moves:12,score:0,
  story:'The Blank never sleeps. Keep forming words, defuse Veyra\'s fuse traps, and beat your personal best.',
  tip:'Words of four or more letters earn extra moves. If a tile gets a fuse, use it in a word before the countdown ends.'};

const DIALOGUE={
 prologue:{scene:'library',lines:[
  ['narrator','In Lexiconia, every word is a small light. Together, they keep the whole kingdom alive.'],
  ['rowan','Aria, look at this book. The words are... leaving it.'],
  ['aria','The ink just slid off the page, Rowan. Even the titles are gone.'],
  ['rowan','It began with signs and shop names. Now it is taking names from people\'s memories.'],
  ['aria','But the letters still answer me. I can see them. I can move them.'],
  ['rowan','Then you are a Word Seeker, and the Wordwell needs one. The words are fading... Only you can restore them, Aria.'],
  ['aria','Then let\'s bring them back. One word at a time.']]},
 forest:{scene:'forest',lines:[
  ['rowan','The Whispering Forest was the first to lose its words. Every signpost is blank.'],
  ['aria','Where do I start?'],
  ['rowan','Small. Even a short word pushes the Blank back a little.'],
  ['lumi','Mrrp! (Lumi will sniff out a word whenever you are stuck.)']]},
 caverns:{scene:'caverns',lines:[
  ['rowan','The crystals here store echoes of old speech. But something is stirring in the deep.'],
  ['veyra','Another seeker. How tiresome.'],
  ['aria','Who are you?'],
  ['veyra','A guardian, once. Then nobody came to guard against forgetting, and I stopped waiting.'],
  ['veyra','Watch your letters, little seeker.']]},
 library:{scene:'library',lines:[
  ['aria','Home... but the shelves are empty.'],
  ['rowan','Veyra is stealing letters faster now. We have less time than before.'],
  ['aria','Then we work faster. Longer words, bigger echoes.']]},
 wordwell:{scene:'wordwell',lines:[
  ['rowan','The Wordwell. The source of every word in Lexiconia, and it is nearly dry.'],
  ['veyra','I am not the Blank, Aria. I am what the Blank left behind. Nobody kept my name.'],
  ['aria','Then I will remember it. Veyra.']]},
 city:{scene:'city',lines:[
  ['narrator','Lexiconia City glows against the evening. Every window is a word someone still remembers.'],
  ['lumi','Mrrp! (Lumi says the Blank is creeping in from the edges. Keep the words coming!)'],
  ['rowan','There is no last word here, Aria. Only the next one.']]},
 ending:{scene:'wordwell',lines:[
  ['aria','Veyra. Guardian of the Wordwell. I remember you.'],
  ['veyra','You... remembered.'],
  ['rowan','Language only survives when someone bothers to protect it.'],
  ['aria','Every letter is power.'],
  ['rowan','Every word is hope.'],
  ['narrator','Color returned to Lexiconia, one word at a time. The Wordwell shone again.']]}
};
const VQUOTES={scramble:['Forget them.','Let the letters scatter.','Your words are only noise.'],void:['Let there be blank.','Nothing lasts.','Fade.'],trap:['A word too slow, and it all goes dark.','The fuse is lit. Make this word count.','Can you reach it in time?']};
const LUMI_LINES=['Try adding -S, -ED or -ING to a short word.','Look for the vowels first, then build around them.','Long words score up to 10 points.','Dark tiles vanish when a word touches them.','Two words in a row of 4+ letters starts a combo.'];

/* items you can hold, buy and use */
const ITEMS=[
 {id:'star',name:'Star Surge',desc:'Doubles your next word score, up to 10 points.',price:60},
 {id:'crystal',name:'Crystal Shuffle',desc:'Reshuffles the grid and cleanses every Blank tile.',price:90},
 {id:'hour',name:'Hourglass',desc:'+3 moves (and +20 seconds on timed levels).',price:70}
];
/* relics are earned by finishing an area, and work automatically */
const RELICS=[
 {id:'quill',name:'Quill of Echoes',sym:'Q',area:0,desc:'Echo moves start one letter earlier: 5 or more letters earns +1 move.'},
 {id:'shard',name:'Shard of Stillness',sym:'S',area:1,desc:'Veyra waits one extra move before she acts.'},
 {id:'lantern',name:"Lumi's Lantern",sym:'L',area:2,desc:'Lumi will find a fourth word for you on every level.'},
 {id:'heart',name:'Heart of the Wordwell',sym:'H',area:3,desc:'Every word of 4 or more letters earns one extra move.'}
];
const KEYITEMS=[
 {id:'tome',name:'The Ancient Tome',desc:'The book whose words began to leave. Rowan let you keep it.',when:'Start a new game'},
 {id:'chalk',name:'Signpost Chalk',desc:'A stub of chalk that writes words which stay written.',when:'Clear Level 1'},
 {id:'mask',name:"Veyra's Mask Shard",desc:'A cold sliver of white mask. It hums when words are spoken nearby.',when:"Clear Level 6"},
 {id:'archivekey',name:'Archive Key',desc:'Cut from the letters of a hundred forgotten words.',when:'Clear Level 8'}
];
const hasRelic=id=>!!SAVE.relics[id];

/* trophies */
const TROPHIES=[
 {id:'first',name:'First Words',desc:'Restore your first word.',prog:()=>[SAVE.stats.words,1]},
 {id:'sm6',name:'Wordsmith',desc:'Form a word of 6 or more letters.',prog:()=>[SAVE.stats.longest.length,6]},
 {id:'sm8',name:'Lexicon',desc:'Form a word of 8 or more letters.',prog:()=>[SAVE.stats.longest.length,8]},
 {id:'rare',name:'Rare Finds',desc:'Restore 10 rare words.',prog:()=>[SAVE.stats.rare,10]},
 {id:'combo',name:'Combo Caster',desc:'Chain 6 words of 4+ letters in a row.',prog:()=>[SAVE.stats.maxCombo,6]},
 {id:'blank',name:'Blank Breaker',desc:'Cleanse 25 Blank tiles.',prog:()=>[SAVE.stats.cleansed,25]},
 {id:'lumi',name:"Lumi's Friend",desc:'Ask Lumi for 10 hints.',prog:()=>[SAVE.stats.hints,10]},
 {id:'star3',name:'Perfect Chapter',desc:'Earn 3 stars on a level.',prog:()=>[Object.values(SAVE.stars).some(s=>s>=3)?1:0,1]},
 {id:'stars12',name:'Star Collector',desc:'Collect 12 stars.',prog:()=>[totalStars(),12]},
 {id:'pure',name:'Pure Seeker',desc:'Win a level without power-ups or hints.',prog:()=>[SAVE.ach.pure?1:0,1]},
 {id:'end',name:'Veyra Remembered',desc:'Finish the story.',prog:()=>[SAVE.ach.storyDone?1:0,1]},
 {id:'endless',name:'City Guardian',desc:'Score 3,000 in Endless Mode.',prog:()=>[SAVE.endlessBest,3000]},
 {id:'shop',name:'Regular Customer',desc:'Buy something from the shop.',prog:()=>[SAVE.stats.bought,1]},
 {id:'lv5',name:'Seasoned Seeker',desc:'Reach Aria level 5.',prog:()=>[lvlOf(SAVE.xp),5]},
 {id:'words250',name:'Living Dictionary',desc:'Restore 250 words in total.',prog:()=>[SAVE.stats.words,250]}
];

/* =====================================================================
   BOARD LOGIC
   ===================================================================== */
const DIST={e:12,a:9,i:9,o:8,n:6,r:6,t:6,l:4,s:5,u:4,d:4,g:3,b:2,c:2,m:2,p:2,f:2,h:2,v:1,w:2,y:2,k:1,j:1,x:1,z:1};
const BAG=Object.entries(DIST).flatMap(([k,v])=>Array(v).fill(k));
const VOW=BAG.filter(c=>'aeiou'.includes(c)),CON=BAG.filter(c=>!'aeiou'.includes(c));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const BOARD_SIDE=6,BOARD_CELLS=BOARD_SIDE*BOARD_SIDE;
const NEI=Array.from({length:BOARD_CELLS},(_,i)=>{const r=Math.floor(i/BOARD_SIDE),c=i%BOARD_SIDE,a=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr>=0&&rr<BOARD_SIDE&&cc>=0&&cc<BOARD_SIDE)a.push(rr*BOARD_SIDE+cc)}return a});
function freshLetters(n,existingVowels,existingTotal){
  const out=[];let v=existingVowels||0,t=existingTotal||0;
  for(let i=0;i<n;i++){
    const ratio=t?v/t:.36;let c;
    if(ratio<.3)c=pick(VOW);else if(ratio>.44)c=pick(CON);else c=pick(BAG);
    if('aeiou'.includes(c))v++;t++;out.push(c);
  }
  return out;
}
/* finds words on a set of letters. commonOnly=true ignores the rare list (used for fair boards and hints) */
function solve(letters,maxWords,commonOnly){
  const found=new Map(),shortFound=new Map(),used=Array(BOARD_CELLS).fill(false),path=[];
  function dfs(i,s){
    if(found.size>=maxWords)return;
    s+=letters[i];if(!PREFIX.has(s))return;
    used[i]=true;path.push(i);
    if(s.length>=3&&(commonOnly?COMMON.has(s):isWord(s))&&!found.has(s)&&!shortFound.has(s)){
      if(s.length>=4)found.set(s,path.slice());
      else if(shortFound.size<maxWords)shortFound.set(s,path.slice());
    }
    if(s.length<10)for(const n of NEI[i])if(!used[n]&&letters[n])dfs(n,s);
    used[i]=false;path.pop();
  }
  for(let i=0;i<BOARD_CELLS;i++)if(letters[i])dfs(i,'');
  return new Map([...found,...shortFound]);
}
function randomGrid(){return freshLetters(BOARD_CELLS)}
function goodGrid(){
  for(let t=0;t<150;t++){
    const L=randomGrid();
    const words=solve(L,60,true);
    const longWords=Array.from(words.keys()).filter(w=>w.length>=4);
    const hasFiveLetterWord=longWords.some(w=>w.length>=5);
    if(longWords.length>=8&&hasFiveLetterWord)return L;
  }
  return randomGrid();
}
function bestWordMove(letters,usedWords=new Set()){ 
  const list=[...solve(letters,80,true).entries()]
    .filter(([w])=>w.length>=3&&!usedWords.has(w))
    .sort((a,b)=>{
      const pa=wordPoints(a[0]).p+(a[0].length*20), pb=wordPoints(b[0]).p+(b[0].length*20);
      return pb-pa;
    });
  return list[0]||null;
}
function wordPoints(w){
  const n=w.length;
  const p=n<=3?5:n===4?6:n===5?8:10;
  const rare=RARE.has(w)&&!COMMON.has(w);
  return{p,rare};
}

/* =====================================================================
   GAME STATE
   ===================================================================== */
let G=null,modalOpen=false,tid=0,tickTimer=null,dragging=false,dragMoved=false,pointerStartCell=-1,toastT=null;
const boardEl=$('#board'),frameEl=$('#frame');

function lettersOf(){return G.board.map(t=>t&&!t.void?t.ch:null)}
function makeEl(t,startR){
  const el=document.createElement('div');
  el.className='tile'+(t.void?' void':'');
  el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-label',t.void?'Blank tile, unusable':'Letter '+t.ch.toUpperCase());
  el.innerHTML='<div class="face"><span class="letter">'+(t.void?'':t.ch)+'</span><span class="trap-fuse" aria-hidden="true"></span></div>';
  el.style.setProperty('--c',t.c);el.style.setProperty('--r',startR==null?t.r:startR);
  boardEl.appendChild(el);t.el=el;
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(canPlay()&&!t.void)selectCell(G.board.indexOf(t))}
  });
  if(startR!=null){el.getBoundingClientRect();el.style.setProperty('--r',t.r)}
}
function setPos(t){t.el.style.setProperty('--r',t.r);t.el.style.setProperty('--c',t.c)}
function setLetter(t,ch){t.ch=ch;t.el.querySelector('.letter').textContent=t.void?'':ch;t.el.setAttribute('aria-label',t.void?'Blank tile, unusable':'Letter '+ch.toUpperCase())}
function setVoid(t,isVoid){
  t.void=isVoid;t.el.classList.toggle('void',isVoid);t.el.querySelector('.letter').textContent=isVoid?'':t.ch||'e';
  t.el.tabIndex=isVoid?-1:0;t.el.setAttribute('aria-disabled',String(isVoid));
  t.el.setAttribute('aria-label',isVoid?'Blank tile, unusable':'Letter '+(t.ch||'e').toUpperCase());
}
function setTrap(t,fuse){
  t.trap=Math.max(0,fuse);
  t.el.classList.toggle('trap',t.trap>0);
  t.el.querySelector('.trap-fuse').textContent=t.trap>0?t.trap:'';
}
function buildBoard(letters){
  [...boardEl.querySelectorAll('.tile')].forEach(e=>e.remove());
  G.board=[];
  for(let i=0;i<BOARD_CELLS;i++){const t={id:++tid,ch:letters[i],r:Math.floor(i/BOARD_SIDE),c:i%BOARD_SIDE,void:false,trap:0,el:null};G.board[i]=t;makeEl(t)}
}
function toast(msg){
  const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1700);
}
function setBanner(word,cls,lbl,pts,fx){
  $('#ban-word').textContent=word;$('#ban-word').className='word '+cls;
  $('#ban-lbl').textContent=lbl;$('#ban-pts').textContent=pts||'';$('#ban-fx').textContent=fx||'';
}
function idleBanner(){setBanner('Tap adjacent letters, then Restore Word. You can also drag or type.','idle','SPELL A WORD','','')}
const chainWord=()=>G.chain.map(i=>G.board[i].ch).join('');
function drawChain(){
  const pts=G.chain.map(i=>((i%BOARD_SIDE)+.5)+','+(Math.floor(i/BOARD_SIDE)+.5)).join(' ');
  $('#chain-line').setAttribute('points',pts);
}
function selectCell(i,fromDrag=false){
  if(!G||!G.board[i]||G.board[i].void)return;
  const ch=G.chain,last=ch[ch.length-1];
  if(!ch.length){
    clearHints();
    ch.push(i);Snd.select(ch.length);refreshChain();
    return;
  }
  if(i===last){
    if(fromDrag && ch.length>=3){submitChain();}
    else if(!fromDrag && ch.length>=3){submitChain();}
    return;
  }
  if(ch.includes(i))return;
  if(!NEI[last].includes(i)){
    G.chain=[i];clearHints();Snd.select(1);refreshChain();
    return;
  }
  if(ch.length>=10)return;
  clearHints();
  ch.push(i);Snd.select(ch.length);refreshChain();
  if(!fromDrag && canAutoSubmit()){submitChain();}
}
function refreshChain(){
  G.board.forEach(t=>t&&t.el.classList.remove('sel'));
  G.chain.forEach(i=>G.board[i].el.classList.add('sel'));
  drawChain();
  const w=chainWord();
  const ok=w.length>=3&&isWord(w)&&!G.wordSet.has(w);
  boardEl.classList.toggle('valid',S.live&&ok);
  if(w){
    setBanner(w,ok&&S.live?'ok':'','BUILDING',ok&&S.live?'Valid word':'','');
  } else {
    idleBanner();
  }
}
function cellAt(e){
  const rect=boardEl.getBoundingClientRect(),cs=rect.width/BOARD_SIDE;
  const x=e.clientX-rect.left,y=e.clientY-rect.top,c=Math.floor(x/cs),r=Math.floor(y/cs);
  if(c<0||c>=BOARD_SIDE||r<0||r>=BOARD_SIDE)return -1;
  if(Math.hypot(x-(c+.5)*cs,y-(r+.5)*cs)>cs*.46)return -1;
  return r*BOARD_SIDE+c;
}
function canPlay(){return G&&G.started&&!G.busy&&!G.over&&!G.paused&&!modalOpen}
/* auto-submit: a valid word that cannot grow any longer on this grid */
function canAutoSubmit(){
  if(!S.auto||G.chain.length<3)return false;
  const w=chainWord();if(!isWord(w)||G.wordSet.has(w))return false;
  const last=G.chain[G.chain.length-1];
  for(const n of NEI[last]){const t=G.board[n];if(!G.chain.includes(n)&&t&&!t.void&&PREFIX.has(w+t.ch))return false}
  return true;
}
function handleMove(e){
  const i=cellAt(e);if(i<0)return;
  const t=G.board[i];if(!t||t.void)return;
  const ch=G.chain,last=ch[ch.length-1];
  if(i===last)return;
  if(ch.length>=2&&ch[ch.length-2]===i){ch.pop();Snd.select(ch.length);refreshChain();return}
  if(ch.includes(i))return;
  if(ch.length&&!NEI[last].includes(i))return;
  if(ch.length>=10)return;
  clearHints();
  ch.push(i);Snd.select(ch.length);refreshChain();
  if(canAutoSubmit()){dragging=false;submitChain()}
}
// Both tap-to-build and drag-to-spell are supported. A tap keeps the chain
// selected so players can choose letters one at a time; dragging submits on release.
boardEl.addEventListener('pointerdown',e=>{
  if(!canPlay())return;e.preventDefault();
  try{boardEl.setPointerCapture(e.pointerId)}catch(_ ){}
  pointerStartCell=cellAt(e);dragMoved=false;dragging=true;
  if(pointerStartCell>=0&&G.chain.length){
    const last=G.chain[G.chain.length-1];
    if(pointerStartCell!==last&&!G.chain.includes(pointerStartCell)&&!NEI[last].includes(pointerStartCell))G.chain=[];
  }
  handleMove(e);
});
boardEl.addEventListener('pointermove',e=>{
  if(!dragging||!canPlay())return;
  if(cellAt(e)!==pointerStartCell&&cellAt(e)>=0)dragMoved=true;
  handleMove(e);
});
boardEl.addEventListener('pointerup',()=>{
  if(!dragging)return;dragging=false;
  if(canPlay()&&dragMoved)submitChain();
  else if(G&&G.chain.length)refreshChain();
  pointerStartCell=-1;
});
boardEl.addEventListener('pointercancel',()=>{dragging=false;dragMoved=false;pointerStartCell=-1;if(G){G.chain=[];refreshChain()}});
$('#btn-submit-word').addEventListener('click',()=>{if(canPlay()&&G.chain.length)submitChain();else toast('Tap at least 3 adjacent letters first.')});

function clearChain(){G.chain=[];refreshChain()}
function submitChain(){
  const idxs=G.chain.slice();
  if(idxs.length<3){
    if(idxs.length){G.moves--;toast('Words need at least 3 letters (-1 move)');clearChain();hud();checkEnd()}
    else clearChain();
    return;
  }
  submitWord(idxs);
}
function reject(msg){
  if(!G||G.over||G.busy)return;
  G.moves--;hud();
  Snd.fail();toast(msg+' (-1 move)');
  frameEl.classList.remove('shake');void frameEl.offsetWidth;frameEl.classList.add('shake');
  clearChain();
  checkEnd();
}

/* ---------- keyboard typing (PC): type a word and the game finds the path ---------- */
function findPath(word){
  const L=lettersOf(),used=Array(BOARD_CELLS).fill(false),path=[];
  if(G.chain.length===word.length-1&&G.chain.length){
    const last=G.chain[G.chain.length-1];
    for(const n of NEI[last])if(!G.chain.includes(n)&&L[n]===word[word.length-1])return G.chain.concat(n);
  }
  function dfs(i,k){
    if(L[i]!==word[k])return false;
    used[i]=true;path.push(i);
    if(k===word.length-1)return true;
    for(const n of NEI[i])if(!used[n]&&L[n]&&dfs(n,k+1))return true;
    used[i]=false;path.pop();return false;
  }
  for(let i=0;i<BOARD_CELLS;i++){used.fill(false);path.length=0;if(L[i]===word[0]&&dfs(i,0))return path.slice()}
  return null;
}
function typeLetter(ch){
  if(!canPlay()||G.chain.length>=10)return;
  const w=(G.chain.length?chainWord():'')+ch,p=findPath(w);
  if(!p){Snd.fail();frameEl.classList.remove('shake');void frameEl.offsetWidth;frameEl.classList.add('shake');toast('No path spells "'+w.toUpperCase()+'"');return}
  clearHints();G.chain=p;Snd.select(p.length);refreshChain();
  if(canAutoSubmit())submitChain();
}
function typeBack(){if(!canPlay()||!G.chain.length)return;G.chain.pop();refreshChain()}


/* ---------- presentation polish ---------- */
/* Small, reusable UI animations layered on top of the core mechanics. */
function animateElement(el, cls){
  if(!el || reducedMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function pulseHUD(id){
  const el=$(id);
  if(el) animateElement(el,'hud-pulse');
}
function boardCelebration(intensity=1){
  if(reducedMotion()) return;
  const colors=['#ffd166','#b58cff','#7fd0ff','#f7e9d0'];
  const rect=frameEl.getBoundingClientRect();
  for(let i=0;i<Math.round(18*intensity);i++){
    const p=document.createElement('i');
    p.className='celebrate-particle';
    p.style.left=(42+Math.random()*16)+'%';
    p.style.top=(34+Math.random()*18)+'%';
    p.style.setProperty('--dx',((Math.random()-.5)*360)+'px');
    p.style.setProperty('--dy',(-70-Math.random()*260)+'px');
    p.style.setProperty('--rot',((Math.random()-.5)*720)+'deg');
    p.style.background=colors[i%colors.length];
    p.style.animationDelay=(Math.random()*.16)+'s';
    frameEl.appendChild(p);
    setTimeout(()=>p.remove(),1500);
  }
  animateElement(frameEl,'victory-pulse');
}
function spawnFloatingWord(text, x=50, y=35, tone='gold'){
  if(reducedMotion() || !text) return;
  const el=document.createElement('div');
  el.className='floating-word';
  el.textContent=text.toUpperCase();
  el.style.left=x+'%';
  el.style.top=y+'%';
  el.style.setProperty('--word-glow', tone==='violet' ? 'rgba(181,140,255,.9)' : 'rgba(255,209,102,.92)');
  el.style.setProperty('--word-start', tone==='violet' ? '#d7c2ff' : '#fff8d9');
  el.style.setProperty('--word-end', tone==='violet' ? '#8a5be0' : '#ff9d3a');
  frameEl.appendChild(el);
  setTimeout(()=>el.remove(),1200);
}
function tileCelebration(idxs){
  if(reducedMotion() || !idxs?.length) return;
  idxs.forEach((idx,n)=>{
    const t=G?.board?.[idx]?.el;
    if(t){
      t.style.setProperty('--celebrate-delay',(n*35)+'ms');
      animateElement(t,'tile-celebrate');
    }
  });
}
function showAreaUnlock(){
  const el=document.createElement('div');
  el.className='area-unlock';
  el.innerHTML='<span>✦</span><b>THE WORDWELL RESPONDS</b><small>Lexiconia is regaining its color.</small>';
  document.body.appendChild(el);
  setTimeout(()=>el.classList.add('on'),30);
  setTimeout(()=>el.remove(),2200);
}
function introBurst(label='',duration=1500){
  if(reducedMotion()) return;
  const wrap=document.createElement('div');
  wrap.className='intro-burst'+(duration>1500?' slow':'');
  wrap.innerHTML=`<span>${label||'WORDBOUND'}</span>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(()=>wrap.classList.add('on'));
  setTimeout(()=>wrap.remove(),duration);
}

/* ---------- visual effects ---------- */
const fxc=$('#fx'),fxx=fxc.getContext('2d');
let parts=[],fxRun=false;
function fxResize(){
  const r=frameEl.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);
  if(fxc.width!==Math.round(r.width*d)||fxc.height!==Math.round(r.height*d)){fxc.width=Math.round(r.width*d);fxc.height=Math.round(r.height*d)}
  fxc._d=d;
}
function tileCenter(i){
  const fr=frameEl.getBoundingClientRect(),br=boardEl.getBoundingClientRect(),cs=br.width/BOARD_SIDE;
  return{x:br.left-fr.left+(i%BOARD_SIDE+.5)*cs,y:br.top-fr.top+(Math.floor(i/BOARD_SIDE)+.5)*cs,cs};
}
function fxStart(){if(!fxRun){fxRun=true;requestAnimationFrame(fxLoop)}}
function burst(idxs,word,big){
  if(!S.fx||reducedMotion())return;
  fxResize();
  const cols=['#ffd166','#fff4d6','#b58cff','#7fd0ff','#9bd0ff'];
  idxs.forEach((i,k)=>{
    const c=tileCenter(i);
    const count=big?12:8;
    for(let j=0;j<count;j++){
      const a=Math.random()*6.283;
      const sp=1.1+Math.random()*3.8;
      parts.push({x:c.x,y:c.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.5,life:1.2,dec:.018+Math.random()*.025,r:1.8+Math.random()*2.8,col:cols[j%cols.length],g:.09,delay:0});
    }
    const glyph=(word[k]||'').toUpperCase();
    if(glyph){
      parts.push({x:c.x,y:c.y,vx:(Math.random()-.5)*1.1,vy:-2.2-Math.random()*1.6,life:1.5,dec:.013,glyph,size:c.cs*.42,col:'#fff4d6',g:-.005,delay:k*2});
    }
  });
  fxStart();
}
function sparks(i,cols,n,spread){
  if(!S.fx||reducedMotion())return;
  fxResize();const c=tileCenter(i);
  for(let j=0;j<n;j++){const a=Math.random()*6.283,sp=.6+Math.random()*(spread||2.4);parts.push({x:c.x,y:c.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,dec:.018+Math.random()*.02,r:1.5+Math.random()*3,col:cols[j%cols.length],g:.02,delay:0})}
  fxStart();
}
function fxLoop(){
  const d=fxc._d||1;fxx.setTransform(d,0,0,d,0,0);fxx.clearRect(0,0,fxc.width/d,fxc.height/d);
  parts=parts.filter(p=>p.life>0);
  for(const p of parts){
    if(p.delay>0){p.delay--;continue}
    p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.life-=p.dec;
    fxx.globalAlpha=Math.max(0,Math.min(1,p.life));
    if(p.glyph){fxx.font='900 '+p.size+'px Cinzel,Georgia,serif';fxx.textAlign='center';fxx.textBaseline='middle';fxx.fillStyle=p.col;fxx.shadowColor='#b58cff';fxx.shadowBlur=12;fxx.fillText(p.glyph,p.x,p.y);fxx.shadowBlur=0}
    else{fxx.fillStyle=p.col;fxx.beginPath();fxx.arc(p.x,p.y,p.r*Math.max(.2,p.life),0,6.283);fxx.fill()}
  }
  fxx.globalAlpha=1;
  if(parts.length)requestAnimationFrame(fxLoop);else{fxRun=false;fxx.setTransform(1,0,0,1,0,0);fxx.clearRect(0,0,fxc.width,fxc.height)}
}
function praise(text,sub){
  const el=document.createElement('div');el.className='praise';el.innerHTML=text+(sub?'<small>'+sub+'</small>':'');
  frameEl.appendChild(el);setTimeout(()=>el.remove(),1350);
}
function flash(gold){
  if(reducedMotion())return;
  const f=$('#flash');f.classList.remove('on','gold');void f.offsetWidth;if(gold)f.classList.add('gold');f.classList.add('on');
}
function updateCombo(bump){
  const c=$('#combo');
  if(G&&G.streak>=2){
    const m=1+.1*Math.min(G.streak-1,5);
    const label=G.streak>=6?'CHAIN':'COMBO';
    c.textContent=label+' x'+m.toFixed(1)+' • '+G.streak;
    c.classList.add('on');
    if(bump){c.classList.remove('bump');void c.offsetWidth;c.classList.add('bump')}
    const banner=$('#banner');
    if(banner && G.streak>=2){
      banner.classList.remove('combo-burst');
      void banner.offsetWidth;
      banner.classList.add('combo-burst');
      clearTimeout(banner._comboPulse);
      banner._comboPulse=setTimeout(()=>banner.classList.remove('combo-burst'),260);
    }
  }else{
    c.classList.remove('on','bump');
    const banner=$('#banner');if(banner)banner.classList.remove('combo-burst');
  }
}
function addCoins(n){
  if(!n)return;SAVE.coins+=n;
  const c=$('#coinchip');if(c){c.classList.remove('gain');void c.offsetWidth;c.classList.add('gain')}
  const h=$('#hud-coins');if(h)h.textContent=SAVE.coins;
}

/* ---------- scoring a word ---------- */
const PRAISE={5:'Great!',6:'Excellent!',7:'Brilliant!',8:'Legendary!',9:'Legendary!',10:'Legendary!'};
async function submitWord(idxs){
  if(!G||G.busy||G.over)return;
  const g=G,lv=g.lv;
  const word=idxs.map(i=>g.board[i].ch).join('');
  if(!isWord(word))return reject('"'+word.toUpperCase()+'" is not in the Wordwell\'s memory');
  if(g.wordSet.has(word))return reject('Already restored this level');
  const challengeFuses=S.difficulty==='challenge'&&!lv.endless;
  const defusedTrap=(lv.endless||challengeFuses)&&idxs.some(i=>g.board[i].trap>0);
  g.busy=true;clearHints();
  let {p,rare}=wordPoints(word);
  const fx=[];
  if(word.length>=4)g.streak++;else g.streak=0;
  g.maxStreak=Math.max(g.maxStreak,g.streak);
  if(g.streak>=2){const mult=1+.1*Math.min(g.streak-1,5);p=Math.min(20,Math.round(p*mult));fx.push('Combo x'+mult.toFixed(1));}
  if(g.surge){p=Math.min(10,p*2);g.surge=false;fx.push('Star Surge (up to 10 pts)')}
  if(hasRelic('heart')&&word.length>=4){g.moves++;fx.push('Heart: +1 move')}
  g.score+=p;g.moves--;g.nWords++;g.wordSet.add(word);g.words.push({w:word,rare,p});
  const t1=4-(hasRelic('quill')?1:0);
  if(word.length>=t1+2){g.moves+=2;fx.push('Echo: +2 moves')}
  else if(word.length>=t1){g.moves+=1;fx.push('Echo: +1 move')}
  if(lv.time&&word.length>=6){g.time+=5;fx.push('+5 sec')}
  if(lv.hp)g.hp=Math.max(0,g.hp-p);
  if(lv.endless)endlessScale(g);
  const cn=Math.max(1,word.length-2);g.coins+=cn;addCoins(cn);
  const st=SAVE.stats;st.words++;if(rare)st.rare++;
  if(word.length>st.longest.length)st.longest=word;
  st.maxCombo=Math.max(st.maxCombo,g.streak);
  if(word.length>(g.longest||'').length)g.longest=word;
  Snd.success(word.length);if(g.streak>=2)Snd.combo(g.streak);if(word.length>=5)Snd.praise(word.length);
  setBanner('Word submitted! '+word,'ok','RESTORED','+'+p+' PTS',fx.join(' · '));
  tileCelebration(idxs); pulseHUD('#hud-score'); pulseHUD('#hud-coins'); if(g.streak>=2) animateElement($('#combo'),'combo-super');
  boardEl.classList.remove('valid');
  const f=document.createElement('div');f.className='float';f.textContent='+'+p;frameEl.appendChild(f);setTimeout(()=>f.remove(),1300);
  if(g.nWords===1){
    fx.push('First word');
  }
  if(word.length>=5)praise(PRAISE[word.length],rare?'RARE WORD':'');
  else if(rare)praise('Rare find!','');
  if(word.length>=8)flash(true);
  if(word.length>=6) spawnFloatingWord(word, 50, 33, rare ? 'violet' : 'gold');
  burst(idxs,word,word.length>=6);
  updateCombo(true);
  // Celebrate meaningful combo milestones without changing the existing score balance.
  if(g.streak===3){
    praise('Word Streak!','3 strong words in a row');
    flash(false);
  }else if(g.streak===5){
    praise('MAGIC CHAIN!','5 words — keep the spell alive');
    flash(true);
    Snd.combo(g.streak);
  }else if(g.streak===8){
    praise('WORD MASTER!','Incredible consistency');
    flash(true);
    Snd.levelup();
  }
  if(g.streak>=2){
    const banner=$('#banner');
    if(banner){banner.classList.remove('combo-burst');void banner.offsetWidth;banner.classList.add('combo-burst');clearTimeout(banner._comboPulse);banner._comboPulse=setTimeout(()=>banner.classList.remove('combo-burst'),300);}
  }

  // clear used tiles + cleanse adjacent Blank tiles
  const remove=new Set(idxs);
  idxs.forEach(i=>NEI[i].forEach(n=>{const t=g.board[n];if(t&&t.void)remove.add(n)}));
  let cleansed=0;remove.forEach(i=>{if(g.board[i].void){cleansed++;sparks(i,['#b04dff','#ffd166','#fff'],10,3)}});
  if(cleansed){
    g.cleansed+=cleansed;SAVE.shards+=cleansed;st.cleansed+=cleansed;addCoins(cleansed*2);g.coins+=cleansed*2;
    toast('Blank cleansed!');
  }
  g.chain=[];refreshChain();
  remove.forEach(i=>g.board[i].el.classList.add('clearing'));
  hud();
  await sleep(300);if(G!==g)return;
  remove.forEach(i=>{g.board[i].el.remove();g.board[i]=null});
  await collapse();if(G!==g)return;
  hud();
  await sleep(120);if(G!==g)return;
  if(playableCount() < 3){
    ensurePlayable();
    toast('New letters are ready — the board is alive again.');
  }
  saveP();checkTrophies();
  if(checkEnd())return;
  if(lv.endless||(S.difficulty==='challenge'&&!lv.endless)){
    if(defusedTrap){
      g.trapsDefused++;
      toast('Fuse defused! Keep chasing your best.');
    }else{
      const activeTraps=g.board.filter(t=>t&&t.trap>0);
      activeTraps.forEach(t=>setTrap(t,t.trap-1));
      if(activeTraps.some(t=>t.trap===0)){
        toast('Fuse exploded! Run over.');
        endLevel(false,'trap');
        return;
      }
    }
    if(S.difficulty==='challenge'&&!lv.endless&&g.nWords%3===0&&!g.board.some(t=>t&&t.trap>0)){
      placeEndlessTrap(g);toast('A fuse tile appeared! Use it in your next word.');
    }
  }
  if(lv.v){   // Veyra's turn
    g.vTimer--;
    if(g.vTimer<=0){await veyraAct(g);if(G!==g)return;g.vTimer=vEvery(lv)}
    hud();
  }
  ensurePlayable();
  g.busy=false;
  if(S.tips&&g.nWords===1&&g.i===0)toast('Nice! Longer words earn more.');
  setTimeout(()=>{if(G===g&&!g.over&&!g.busy&&g.words.length&&!g.chain.length)idleBanner()},2200);
}
const vEvery=lv=>lv.v.every+(hasRelic('shard')?1:0);
function endlessScale(g){
  const n=g.nWords;
  g.lv.v.every=Math.max(3,6-Math.floor(n/8));
  g.lv.v.voids=Math.min(4,2+Math.floor(n/10));
}
async function collapse(){
  const vow=G.board.filter(t=>t&&!t.void&&'aeiou'.includes(t.ch)).length,tot=G.board.filter(t=>t&&!t.void).length;
  let missingTotal=0;const news=[];
  for(let c=0;c<BOARD_SIDE;c++){
    const col=[];for(let r=BOARD_SIDE-1;r>=0;r--){const t=G.board[r*BOARD_SIDE+c];if(t)col.push(t)}
    for(let r=BOARD_SIDE-1,k=0;r>=0;r--,k++){
      if(k<col.length){const t=col[k];t.r=r;t.c=c;G.board[r*BOARD_SIDE+c]=t;setPos(t)}else G.board[r*BOARD_SIDE+c]=null;
    }
    const miss=BOARD_SIDE-col.length;missingTotal+=miss;
    for(let r=0;r<miss;r++)news.push({r,c});
  }
  const letters=freshLetters(missingTotal,vow,tot);
  news.forEach((n,i)=>{
    const t={id:++tid,ch:letters[i],r:n.r,c:n.c,void:false,el:null};
    G.board[n.r*BOARD_SIDE+n.c]=t;makeEl(t,n.r-BOARD_SIDE);
  });
  await sleep(420);
}
function playableCount(){
  const f=solve(lettersOf(),60,true);let n=0;for(const w of f.keys())if(w.length>=4&&!G.wordSet.has(w))n++;return n;
}
function hintCandidates(){
  if(!G)return [];
  const board=lettersOf();
  let pool=[...solve(board,200,true).entries()].filter(([w])=>!G.wordSet.has(w));
  if(!pool.length)pool=[...solve(board,200,false).entries()].filter(([w])=>!G.wordSet.has(w));
  return pool
    .map(([w,path])=>({word:w,path,score:wordPoints(w).p + w.length*.01}))
    .sort((a,b)=>b.score-a.score||b.word.length-a.word.length);
}
function ensurePlayable(){
  let tries=0;
  while(playableCount()<6&&tries<40){
    const normals=G.board.filter(t=>t&&!t.void);
    const L=normals.length===BOARD_CELLS?randomGrid():freshLetters(normals.length);
    normals.forEach((t,i)=>{setLetter(t,L[i]);t.el.classList.remove('flip');void t.el.offsetWidth;t.el.classList.add('flip')});
    tries++;
  }
  if(tries)toast('Lumi rearranged the letters');
}
function scramble(){
  const normals=G.board.filter(t=>t&&!t.void);
  const chars=normals.map(t=>t.ch);
  for(let i=chars.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[chars[i],chars[j]]=[chars[j],chars[i]]}
  normals.forEach((t,i)=>{setLetter(t,chars[i]);t.el.classList.remove('flip');void t.el.offsetWidth;t.el.classList.add('flip')});
}
function voidify(n){
  const voids=G.board.filter(t=>t&&t.void).length;
  if(voids>=6)return scramble();
  const c=G.board.filter(t=>t&&!t.void&&!t.trap);
  for(let k=0;k<n&&c.length;k++){
    const t=c.splice(Math.floor(Math.random()*c.length),1)[0];
    setVoid(t,true);
    sparks(G.board.indexOf(t),['#8d3fd0','#150a2a','#b04dff'],8,2);
  }
}
function placeEndlessTrap(g){
  if(g!==G)return;
  const choices=g.board.filter(t=>t&&!t.void&&!t.trap);
  if(!choices.length){scramble();return}
  const tile=pick(choices);
  setTrap(tile,3);
  toast('Fuse trap! Use this tile within 3 words!');
}
async function veyraAct(g){
  const v=g.lv.v;const kind=v.kinds[g.vCount++%v.kinds.length];
  const q=pick(VQUOTES[kind]);
  $('#vbubble-text').textContent=q;$('#vbubble').classList.add('on');
  Snd.veyra();flash(false);
  await sleep(1000);if(G!==g)return;
  if(kind==='scramble')scramble();
  else if(kind==='trap'&&g.lv.endless)placeEndlessTrap(g);
  else voidify(v.voids||2);
  await sleep(800);
  $('#vbubble').classList.remove('on');
}

/* ---------- objectives, HUD ---------- */
function objectives(){
  const lv=G.lv,o=[];
  if(lv.endless)return o;
  o.push({txt:'Reach '+lv.score+' points',cur:Math.min(G.score,lv.score),max:lv.score});
  if(lv.words)o.push({txt:lv.wl||('Form '+lv.words+' words'),cur:Math.min(G.nWords,lv.words),max:lv.words});
  if(lv.long){const n=G.words.filter(x=>x.w.length>=lv.long.len).length,unit=lv.long.n===1?'word':'words';o.push({txt:'Form '+lv.long.n+' '+unit+' of '+lv.long.len+'+ letters',cur:Math.min(n,lv.long.n),max:lv.long.n})}
  if(lv.hp)o.push({txt:'Push Veyra back to zero',cur:G.hpMax-G.hp,max:G.hpMax,pct:true});
  return o;
}
function hud(){
  const lv=G.lv,ob=objectives();
  $('#hud-score').textContent=G.score;
  $('#hud-moves').textContent=G.moves;$('#st-moves').classList.toggle('low',G.moves<=3);
  $('#lbl-target').textContent=lv.endless?'BEST':'TARGET';
  $('#hud-target').textContent=lv.endless?Math.max(SAVE.endlessBest,G.score):lv.score;
  $('#hud-lvl').textContent=lv.endless?'Endless Mode':'Level '+(G.i+1)+' of '+LEVELS.length;
  $('#hud-coins').textContent=SAVE.coins;
  if(lv.time){$('#st-time').style.display='';const m=Math.floor(Math.max(0,G.time)/60),s=Math.max(0,G.time)%60;$('#hud-time').textContent=m+':'+String(s).padStart(2,'0');$('#st-time').classList.toggle('low',G.time<=20)}else $('#st-time').style.display='none';
  if(lv.endless){
    $('#objs').innerHTML=`<li><span class="chk">★</span><span>Personal best <em>${Math.max(SAVE.endlessBest,G.score)}</em></span></li><li><span class="chk">#</span><span>Words restored <em>${G.nWords}</em></span></li><li><span class="chk">L</span><span>Longest word <em>${G.longest?G.longest.toUpperCase():'-'}</em></span></li><li><span class="chk">!</span><span>Fuse traps defused <em>${G.trapsDefused||0}</em></span></li>`;
  }else{
    $('#objs').innerHTML=ob.map(o=>{const d=o.cur>=o.max;return `<li class="${d?'done':''}"><span class="chk">✓</span><span>${o.txt} <em>${o.pct?Math.round(o.cur/o.max*100)+'%':o.cur+'/'+o.max}</em></span></li>`}).join('');
  }
  $('#wl').innerHTML=G.words.length?G.words.map((x,i)=>`<li class="${x.rare?'rare':''}${i===G.words.length-1?' new':''}">${x.w} ✓</li>`).join(''):'<li class="empty">Nothing restored yet.</li>';
  const prog=lv.endless?1:Math.min(1,G.score/lv.score);
  $('#hud-meter').style.width=Math.round((lv.endless?Math.min(1,G.score/Math.max(1000,SAVE.endlessBest)):prog)*100)+'%';
  setScene(AREAS[lv.a].id,lv.endless?1:.25+.75*prog);
  const vb=$('#vbar');
  if(lv.v||lv.hp){
    vb.classList.add('on');
    $('#vbar-hpwrap').style.display=lv.hp?'':'none';
    if(lv.hp)$('#vbar-hp').style.width=Math.round(G.hp/G.hpMax*100)+'%';
    const nextKind=lv.endless&&lv.v?lv.v.kinds[G.vCount%lv.v.kinds.length]:'';
    $('#vbar-when').textContent=lv.v?(G.vTimer===1?(nextKind==='trap'?'Trap may appear next move':'Veyra acts next move'):'Veyra acts in '+G.vTimer+' moves'):'';
    $('#vbar-name').textContent=lv.hp?'Veyra, Corrupted Guardian':'The Blank stirs';
  }else vb.classList.remove('on');
  frameEl.classList.toggle('danger',!!(lv.v&&G.vTimer===1&&!G.over&&G.started));
  puUpdate();
}
function puUpdate(){
  const it=SAVE.items,maxH=3+(hasRelic('lantern')?1:0);
  const set=(id,n,armed)=>{const b=$(id);b.innerHTML=b.dataset.ic+'<span class="n">'+n+'</span><span class="pu-key">'+b.dataset.key+'</span>';b.disabled=!G||G.over||!G.started||n<=0;b.classList.toggle('armed',!!armed)};
  set('#pu-star',it.star,G&&G.surge);set('#pu-crystal',it.crystal);set('#pu-hour',it.hour);set('#pu-hint',G?G.hints:0);
  $('#pu-hint-lbl').innerHTML='Lumi hint<br>'+maxH+' per level';
}
/* ---------- power-ups ---------- */
function usePower(kind){
  if(!G||G.busy||G.over||!G.started||G.paused||modalOpen)return;
  if(kind==='star'){
    if(G.surge||SAVE.items.star<=0)return;
    SAVE.items.star--;G.surge=true;Snd.power();toast('Star Surge ready: next word scores x2');
  }else if(kind==='crystal'){
    if(SAVE.items.crystal<=0)return;
    SAVE.items.crystal--;Snd.power();
    G.board.forEach((t,i)=>{if(t&&t.void){setVoid(t,false);sparks(i,['#ffd166','#fff','#7fd0ff'],8,2.5)}});
    const normals=G.board.filter(t=>t);const L=freshLetters(normals.length);
    normals.forEach((t,i)=>{setLetter(t,L[i]);t.el.classList.remove('flip');void t.el.offsetWidth;t.el.classList.add('flip')});
    ensurePlayable();toast('Crystal shuffle: the Blank is cleansed');
  }else if(kind==='hour'){
    if(SAVE.items.hour<=0)return;
    SAVE.items.hour--;G.moves+=3;if(G.lv.time)G.time+=20;Snd.power();toast('+3 moves'+(G.lv.time?' and +20 seconds':''));
  }else if(kind==='hint'){
    if(G.hints<=0)return;
    const best=hintCandidates()[0];
    if(!best){
      const hadWords=playableCount()>0;
      if(hadWords){toast('Lumi can\'t find a strong lead. Try a different word shape.');}
      else{ensurePlayable();toast('The board felt stale. Lumi refreshed it.');}
      return;
    }
    const {word,wPath}=best.path?{word:best.word,wPath:best.path}:best;
    G.hints--;SAVE.stats.hints++;clearHints();
    G.board[wPath[0]].el.classList.add('hint');G.board[wPath[1]].el.classList.add('hint');
    boardEl.classList.toggle('hintstill',!S.hintAnim);
    G.hintT=setTimeout(clearHints,6000);
    Snd.power();
    const score=wordPoints(word).p;
    setBanner(word.toUpperCase(),'ok','LUMI HINT','+'+score+' PTS','Best move');
    toast('Lumi sees "'+word.toUpperCase()+'" — '+word.length+' letters');
  }
  G.usedPower=true;
  saveP();hud();checkTrophies();
}
function clearHints(){if(!G)return;clearTimeout(G.hintT);boardEl.querySelectorAll('.tile.hint').forEach(e=>e.classList.remove('hint'))}
[['star','1'],['crystal','2'],['hour','3'],['hint','Sp']].forEach(([k,key])=>{const b=$('#pu-'+k);b.dataset.ic=ICON[k];b.dataset.key=key;b.onclick=()=>usePower(k)});
$('#pu-hint').dataset.ic=im(ART.faceLumi,'Lumi');

/* ---------- trophies ---------- */
let ttQueue=[],ttBusy=false;
function checkTrophies(){
  let got=false;
  for(const t of TROPHIES){
    if(SAVE.ach['t_'+t.id])continue;
    const [a,b]=t.prog();
    if(a>=b){SAVE.ach['t_'+t.id]=1;ttQueue.push(t);got=true}
  }
  if(got){saveP();runTrophyToasts()}
}
async function runTrophyToasts(){
  if(ttBusy)return;ttBusy=true;
  while(ttQueue.length){
    const t=ttQueue.shift(),el=$('#tt');
    el.innerHTML=`<div class="medal">★</div><div><b>TROPHY UNLOCKED</b><span>${t.name}</span></div>`;
    el.classList.add('on');Snd.trophy();
    await new Promise(r=>setTimeout(r,FAST?50:2800));
    el.classList.remove('on');
    await new Promise(r=>setTimeout(r,FAST?10:600));
  }
  ttBusy=false;
}

/* ---------- win / lose ---------- */
function checkEnd(){
  if(G.over)return true;
  if(!G.lv.endless&&objectives().every(o=>o.cur>=o.max)){endLevel(true);return true}
  if(G.moves<=0){endLevel(false,'moves');return true}
  return false;
}
const isLastOfArea=i=>LEVELS.filter(l=>l.a===LEVELS[i].a).pop()===LEVELS[i];
const KEY_AT={0:'chalk',5:'mask',7:'archivekey'};
function grant(R){
  addCoins(R.coins);
  const before=lvlOf(SAVE.xp);SAVE.xp+=R.xp;const after=lvlOf(SAVE.xp);
  R.lvUp=after-before;R.lv=after;
  if(R.lvUp>0){R.lvCoins=50*R.lvUp;addCoins(R.lvCoins);Snd.levelup()}
}
function endLevel(win,why){
  const g=G;if(!g||g.over)return;
  g.over=true;g.busy=true;clearInterval(tickTimer);clearHints();Snd.setTension(false);
  frameEl.classList.remove('danger');
  const lv=g.lv,R={coins:0,xp:0,relic:null,key:null,lvUp:0,reward:'',stars:0};
  if(lv.endless){
    R.newBest=g.score>SAVE.endlessBest;
    SAVE.endlessBest=Math.max(SAVE.endlessBest,g.score);SAVE.stats.endlessRuns++;
    R.coins=Math.floor(g.score/100);R.xp=Math.floor(g.score/6);
    grant(R);saveP();checkTrophies();hud();Snd.lose();
    setTimeout(()=>showResult(g,false,R,why),700);return;
  }
  if(win){
    const first=!SAVE.stars[g.i];
    const ratio=g.moves/lv.moves;
    let stars=1;if(g.score>=lv.score*1.25)stars++;if(ratio>=.25)stars++;
    R.stars=stars;
    SAVE.stars[g.i]=Math.max(SAVE.stars[g.i]||0,stars);
    SAVE.best[g.i]=Math.max(SAVE.best[g.i]||0,g.score);
    SAVE.unlocked=Math.max(SAVE.unlocked,Math.min(LEVELS.length,g.i+2));
    SAVE.stats.levelsWon++;
    const kinds=['star','crystal','hour'],k=kinds[g.i%3];
    SAVE.items[k]=Math.min(9,SAVE.items[k]+1);
    R.reward={star:'Star Surge',crystal:'Crystal Shuffle',hour:'Hourglass'}[k];
    if(stars===3){SAVE.items.star=Math.min(9,SAVE.items.star+1);R.reward+=' and a bonus Star Surge'}
    R.coins=Math.round((30+15*stars)*(first?1:.5));R.xp=Math.round(g.score/4*(first?1:.4));
    if(!g.usedPower)SAVE.ach.pure=1;
    if(isLastOfArea(g.i)){const rel=RELICS.find(r=>r.area===lv.a);if(rel&&!SAVE.relics[rel.id]){SAVE.relics[rel.id]=1;R.relic=rel}}
    if(KEY_AT[g.i]&&!SAVE.keys[KEY_AT[g.i]]){SAVE.keys[KEY_AT[g.i]]=1;R.key=KEYITEMS.find(k=>k.id===KEY_AT[g.i])}
    if(g.i===LEVELS.length-1)SAVE.ach.storyDone=1;
    grant(R);saveP();checkTrophies();hud();Snd.win();setScene(AREAS[lv.a].id,1);flash(true);
    setTimeout(()=>showResult(g,true,R),700);
  }else{
    Snd.lose();
    setTimeout(()=>showResult(g,false,R,why),700);
  }
}

/* ---------- level flow ---------- */
function setupLevel(i){
  const source=i<0?Object.assign({},ENDLESS,{v:{every:8,kinds:['scramble','void','trap'],voids:1}}):LEVELS[i];
  const diff=S.difficulty||'normal';
  const moveBonus=diff==='casual'?14:diff==='challenge'?6:10;
  const timeBonus=diff==='casual'?120:diff==='challenge'?60:90;
  const lv=Object.assign({},source,{
    moves:source.moves+moveBonus,
    score:source.endless?source.score:Math.min(100,Math.max(30,Math.round(source.score/50))),
    time:source.time?source.time+timeBonus:source.time
  });
  if(source.words){lv.words=Math.max(2,source.words-3);if(source.wl)lv.wl='Restore '+lv.words+' signs'}
  if(source.long)lv.long={n:Math.max(1,source.long.n-2),len:Math.min(4,source.long.len)};
  if(source.v)lv.v=Object.assign({},source.v,{every:source.v.every+4,voids:Math.max(0,(source.v.voids||0)-2)});
  if(source.hp)lv.hp=Math.min(100,Math.max(20,Math.round(source.hp/25)));
  clearInterval(tickTimer);
  const hintCount=diff==='casual'?7:diff==='challenge'?3:5;
  G={i,lv,score:0,moves:lv.moves,time:lv.time||0,words:[],wordSet:new Set(),nWords:0,hp:lv.hp||0,hpMax:lv.hp||0,
    vTimer:lv.v?vEvery(lv):0,vCount:0,hints:hintCount+(hasRelic('lantern')?1:0),surge:false,chain:[],busy:false,paused:false,over:false,started:false,
    board:[],hintT:null,streak:0,maxStreak:0,coins:0,cleansed:0,usedPower:false,longest:'',trapsDefused:0};
  buildBoard(goodGrid());
  if(diff==='challenge'&&!lv.endless){placeEndlessTrap(G);toast('Challenge mode: defuse the fuse tile before it expires!')}
  $('#vbubble').classList.remove('on');
  updateCombo(false);
  frameEl.classList.remove('danger');
  idleBanner();refreshChain();
  showScreen('scr-game');hud();
  if(!reducedMotion()){
    spawnFloatingWord(lv.title, 50, 20, lv.a>=3 ? 'violet' : 'gold');
    introBurst(lv.title.toUpperCase(),lv.title==='The Last Bell'?10000:1500);
  }
}
function startTimer(){
  clearInterval(tickTimer);
  if(!G.lv.time)return;
  tickTimer=setInterval(()=>{
    if(!G||!G.started||G.paused||G.over||modalOpen)return;
    G.time--;hud();
    if(G.time<=0){G.time=0;endLevel(false,'time')}
  },1000);
}
function startLevel(i,skipStory){
  const lv=i<0?ENDLESS:LEVELS[i],a=AREAS[lv.a];
  setScene(a.id,i<0?1:.25);
  const go=()=>{setupLevel(i);showBriefing()};
  if(!skipStory&&!SAVE.seen[a.id]){SAVE.seen[a.id]=1;saveP();playDialogue(a.id,go)}
  else go();
}
function resetProfile(){
  SAVE=SAVE_DEF();
  SAVE.started=true;SAVE.keys.tome=1;saveP();
}
function restartLevel(i){
  resetProfile();
  startLevel(i,true);
}
function confirmRestartLevel(i){
  openModal('<header>Restart and erase progress?</header><div class="inner"><p>This resets Aria to Level 1 and erases Lumens, stars, unlocked levels, items and trophies before restarting this level.</p><div class="row"><button class="btn small" id="restart-cancel" autofocus>Cancel</button><button class="btn primary" id="restart-confirm">Erase and restart</button></div></div>');
  $('#restart-cancel').onclick=()=>{closeModal();if(G&&!G.over)G.paused=false};
  $('#restart-confirm').onclick=()=>{closeModal();restartLevel(i)};
}

/* =====================================================================
   RESULT, BRIEFING, PAUSE
   ===================================================================== */
function showResult(g,win,R,why){
  const lv=g.lv,last=!lv.endless&&g.i===LEVELS.length-1;
  const rows=[['Score',g.score],['Words restored',g.nWords]];
  if(g.longest)rows.push(['Longest word',g.longest.toUpperCase()]);
  if(g.maxStreak>=2)rows.push(['Best combo','x'+(1+.1*Math.min(g.maxStreak-1,5)).toFixed(1)]);
  if(lv.endless)rows.push(['Best score',SAVE.endlessBest]);
  else if(win)rows.push(['Best score',SAVE.best[g.i]||g.score]);
  if(win||lv.endless){rows.push(['Lumens earned',g.coins+R.coins]);rows.push(['Aria XP','+'+R.xp])}
  if(win&&R.reward)rows.push(['Reward',R.reward]);
  const extra=[];
  if(R.lvUp>0)extra.push(`<div class="lvlup"><span>Level up!</span><big>Aria is now Lv ${R.lv}</big><small>+${R.lvCoins} Lumens</small></div>`);
  if(R.relic)extra.push(`<div class="relic"><div class="ico relic">${R.relic.sym}</div><div><b>New relic: ${R.relic.name}</b><small>${R.relic.desc}</small></div></div>`);
  if(R.key)extra.push(`<div class="keyitem"><div class="ico key">&#9993;</div><div><b>Key item: ${R.key.name}</b><small>${R.key.desc}</small></div></div>`);
  const title=lv.endless?(R.newBest?'New best!':why==='trap'?'Fuse detonated':'Run over'):win?'Level Complete!':(why==='time'?'Out of time':'Out of moves');
  const body=lv.endless?`<p>${why==='trap'?'A fuse trap exploded. Use a word containing the marked tile before its countdown ends.':R.newBest?'A new personal best. The city glows a little brighter.':'The Blank creeps in. Every word still counted.'}</p>`
    :win?`<div class="bigstars">${[0,1,2].map(i=>i<R.stars?`<span style="animation-delay:${.15*i}s">★</span>`:'<span class="off">★</span>').join('')}</div>`
    :`<p>The Blank spreads a little further. Ask Lumi for hints, or spend a power-up, and try again.</p>`;
  if(win && !reducedMotion()){ boardCelebration(1.8); flash(true); showAreaUnlock(); }
  openModal(`<header>${title}</header><div class="inner">${body}
    <div class="res">${rows.map(r=>`<span>${r[0]}</span><span>${r[1]}</span>`).join('')}</div>${extra.join('')}
    <div class="row">
      <button class="btn small" id="r-chapters">${lv.endless?'Main menu':'Chapter Select'}</button>
      <button class="btn small" id="r-retry">${lv.endless?'Play again':win?'Replay':'Restart level'}</button>
      ${win&&!lv.endless?`<button class="btn primary small" id="r-next">${last?'Finish the story':'Continue'}</button>`:''}
    </div></div>`,'',true);
  $('#r-chapters').onclick=()=>{closeModal();lv.endless?goTitle():goChapters()};
  $('#r-retry').onclick=()=>{closeModal();confirmRestartLevel(g.i)};
  if(win&&!lv.endless)$('#r-next').onclick=()=>{
    closeModal();
    if(last)playDialogue('ending',()=>showEnd());
    else startLevel(g.i+1);
  };
}
function showEnd(){
  setScene('wordwell',1);
  openModal(`<header>The End</header><div class="inner"><p>The Wordwell is full again, and Lexiconia has its words back. Thank you for playing Wordbound: The Letter Quest.</p><p class="hint-line">Lexiconia City is open in Endless Mode, and there are trophies and relics left to find.</p><div class="row"><button class="btn small" id="e-credits">Credits</button><button class="btn small" id="e-chapters">Replay a level</button><button class="btn primary small" id="e-title">Main menu</button></div></div>`);
  $('#e-credits').onclick=()=>{closeModal();showCredits(showEnd)};
  $('#e-chapters').onclick=()=>{closeModal();goChapters()};
  $('#e-title').onclick=()=>{closeModal();goTitle()};
}
function showBriefing(){
  const lv=G.lv,a=AREAS[lv.a];
  const ob=objectives().map(o=>'<li><span class="chk"></span><span>'+o.txt+'</span></li>').join('');
  const extras=[];
  if(lv.time)extras.push('Time limit: '+Math.floor(lv.time/60)+':'+String(lv.time%60).padStart(2,'0'));
  if(lv.v)extras.push(lv.endless?'Veyra gets bolder as you go':'Veyra interferes every '+vEvery(lv)+' moves');
  const bg=a.art?`background-image:url(${a.art})`:'background:radial-gradient(ellipse at 50% 100%,#8a4ff0,#1d0e52)';
  const stars=lv.endless?'':`<div class="starnote"><span>Clear the level</span><span>Score ${Math.ceil(lv.score*1.25)} or more</span><span>Finish with ${Math.ceil(lv.moves*.25)} or more moves left</span></div>`;
  openModal(`<header>${a.name}</header><div class="inner">
    <div class="brief-art" style="${bg}"><span class="badge">${a.diff}</span></div>
    <div class="stack"><b style="font-family:var(--font-display);font-size:1.15rem">${lv.endless?'Endless Mode':'Level '+(G.i+1)+': '+lv.title}</b><p>${lv.story}</p></div>
    <ul class="objs">${ob}<li><span class="chk"></span><span>${lv.moves} moves${extras.length?'. '+extras.join('. ')+'.':'.'}</span></li></ul>
    ${stars}
    ${S.tips?`<div class="tip"><div class="portrait">${PORT.rowan}</div><div><b>TIP FROM ARCHIVIST ROWAN</b>${lv.tip}</div></div>`:''}
    <div class="row"><button class="btn small" id="b-back">Back</button><button class="btn primary" id="b-go" autofocus>Begin</button></div></div>`,'',true);
  $('#b-back').onclick=()=>{closeModal();lv.endless?goTitle():goChapters()};
  $('#b-go').onclick=()=>{closeModal();G.started=true;Snd.setTension(!!(lv.v||lv.hp));startTimer();hud()};
}
function pauseGame(){
  if(!G||G.over||!G.started||G.paused)return;
  G.paused=true;dragging=false;clearChain();
  openModal(`<header>Paused</header><div class="inner"><p class="hint-line">Restarting erases the saved profile, resets Aria to Level 1, and clears Lumens, stars and items.</p><div class="stack">
    <button class="btn primary" id="p-resume" autofocus>Resume</button>
    <button class="btn" id="p-restart">Restart Level</button>
    <button class="btn" id="p-inv">Inventory</button>
    <button class="btn" id="p-options">Options</button>
    <button class="btn" id="p-menu">Main Menu</button></div></div>`);
  const resume=()=>{closeModal();G.paused=false};
  $('#p-resume').onclick=resume;
  $('#p-restart').onclick=()=>{const i=G.i;closeModal();confirmRestartLevel(i)};
  $('#p-inv').onclick=()=>{closeModal();showInventory('Items',()=>{G.paused=false;pauseGame()})};
  $('#p-options').onclick=()=>{closeModal();openOptions(()=>{G.paused=false;pauseGame()})};
  $('#p-menu').onclick=()=>{closeModal();G.over=true;clearInterval(tickTimer);Snd.setTension(false);goTitle()};
}
$('#btn-pause').onclick=pauseGame;
$('#btn-bag').onclick=()=>{
  if(!G||G.busy||G.over||!G.started||G.paused||modalOpen)return;
  G.paused=true;dragging=false;clearChain();
  showInventory('Items',()=>{G.paused=false;hud()});
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&G&&G.started&&!G.over&&!modalOpen&&$('#scr-game').classList.contains('active'))pauseGame()});

/* =====================================================================
   SCREENS, MODALS, DIALOGUE
   ===================================================================== */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
  const active=document.getElementById(id);
  if(active && !reducedMotion()){active.classList.remove('screen-enter');void active.offsetWidth;active.classList.add('screen-enter');}
  window.scrollTo(0,0);
}
let modalReturnFocus=null;
function openModal(html,cls,noX){
  const m=$('#modal');modalReturnFocus=document.activeElement;
  m.innerHTML='<div class="scrim"></div><div class="card'+(cls?' '+cls:'')+'" role="dialog" aria-modal="true" tabindex="-1">'+html+'</div>';
  m.classList.add('open');modalOpen=true;
  const card=m.querySelector('.card');
  card.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const items=[...card.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if(!items.length){e.preventDefault();card.focus();return}
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===card)){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
  requestAnimationFrame(()=>{if(!card.isConnected)return;const f=card.querySelector('[autofocus]')||card.querySelector('button:not([disabled]),input:not([disabled]),select:not([disabled])');(f||card).focus()});
  return card;
}
function closeModal(){const m=$('#modal');m.classList.remove('open');m.innerHTML='';modalOpen=false;if(modalReturnFocus&&modalReturnFocus.isConnected)modalReturnFocus.focus();modalReturnFocus=null}

function goTitle(){
  setScene('title');showScreen('scr-title');
  $('#m-continue').disabled=!SAVE.started;
  $('#btn-sound').textContent='Sound: '+(S.sound?'on':'off');
  $('#title-status').innerHTML=`<span class="chip">Aria Lv ${lvlOf(SAVE.xp)}</span><span class="chip">★ ${totalStars()}/${LEVELS.length*3}</span><span class="chip gem">${ICON.gem}${SAVE.coins}</span>`;
}
function goChapters(){
  setScene('title');showScreen('scr-chapters');
  $('#ch-total').textContent='★ '+totalStars()+' / '+LEVELS.length*3+'   ·   Lumens '+SAVE.coins;
  const card=(a,ai)=>{
    const lv=LEVELS.map((l,i)=>({l,i})).filter(x=>x.l.a===ai);
    const levels=lv.map(({l,i},chapterLevel)=>{
      const st=SAVE.stars[i]||0,locked=i+1>SAVE.unlocked;
      return `<button class="lvl" data-i="${i}" ${locked?'disabled':''}>Level ${chapterLevel+1}: ${l.title}<span>${locked?'Locked':(st?'Best '+(SAVE.best[i]||0):'Not cleared')}</span><span class="stars">${[0,1,2].map(k=>k<st?'★':'<i class="off" style="font-style:normal">★</i>').join('')}</span></button>`}).join('');
    if(ai===3)return `<article class="panel area wordwell-area"><div class="art ${a.id} wordwell-place"><span class="well-ring" aria-hidden="true"></span><span class="well-light" aria-hidden="true"></span><b>${a.name}</b><i>${a.diff}</i></div><div class="body"><p>${a.blurb}</p><div class="lvls">${levels}</div></div></article>`;
    return `<article class="panel area"><div class="art ${a.id}" style="${a.art?`background-image:url(${a.art})`:''}"><b>${a.name}</b><i>${a.diff}</i></div><div class="body"><p>${a.blurb}</p><div class="lvls">${levels}</div></div></article>`;
  };
  const e=AREAS[4];
  $('#areas').innerHTML=AREAS.slice(0,4).map(card).join('')+
    `<article class="panel area endless"><div class="art city" style="background-image:url(${e.art})"><b>${e.name}</b><i>${e.diff}</i></div><div class="body"><p>${e.blurb}</p><div class="row2"><span class="tot" style="color:var(--royal)">Best: ${SAVE.endlessBest}</span><button class="btn primary small" id="ch-endless">Play Endless</button></div></div></article>`;
  $$('.lvl,.map-node').forEach(b=>b.onclick=()=>{SAVE.started=true;saveP();startLevel(+b.dataset.i)});
  $('#ch-endless').onclick=()=>{SAVE.started=true;saveP();startLevel(-1)};
}
function showCredits(back){
  openModal(`<header>Team Credits</header><div class="inner"><div class="credits">
    <div><b>Justiniani, Dave Cleo G.</b><span>Project Manager / Programmer</span></div>
    <div><b>Borces, Karylle MJ A.</b><span>Programmer</span></div>
    <div><b>Ardina, Mark Wayne Z.</b><span>UI/UX Designer</span></div>
    <div><b>Torres, Jude C.</b><span>Audio Designer</span></div>
    <div><b>Borres, Kim C.</b><span>QA Tester</span></div></div>
    <p class="hint-line">Character and environment art from the Wordbound: The Letter Quest magazine.</p>
    <div class="row"><button class="btn primary small" id="c-close" data-close autofocus>Close</button></div></div>`);
  $('#c-close').onclick=()=>{closeModal();if(back)back()};
}
function showHow(){
  openModal(`<header>How to Play</header><div class="inner">
    <ol class="steps"><li>Click or tap a letter, then keep selecting adjacent letters one by one (up, down, sideways or diagonal) to build a word of 3 or more letters. You can also drag across the board if you prefer.</li>
    <li>Click the last tile again or press Submit / Enter to lock it in. Every submitted attempt costs one move, even if the word is invalid or too short. Valid words score points, earn Lumens and restore the world.</li>
    <li>Used tiles clear and new letters fall in. Longer words can earn extra moves.</li>
    <li>Chain words of 4+ letters in a row to build a combo and multiply your score.</li></ol>
    <p>Veyra scrambles the grid and spreads dark Blank tiles you cannot use. Form a word next to a Blank tile to cleanse it and collect a Crystal Shard. Drag back over your last tile to undo a letter. Invalid or too-short attempts cost one move.</p>
    <p>Choose Casual, Normal, or Challenge in Options. Challenge adds fuse tiles: include a marked tile in a word before its countdown reaches zero. Spend Lumens in the Shop, find relics by finishing each area, and unlock trophies as you play.</p>
    <div class="row"><button class="btn primary small" id="h-close" data-close autofocus>Got it</button></div></div>`);
  $('#h-close').onclick=closeModal;
}
function openOptions(back){
  let tab='Gameplay';
  const card=openModal('');
  const sw=(k,l)=>`<div class="setrow"><label for="s-${k}">${l}</label><span class="switch"><input type="checkbox" id="s-${k}" ${S[k]?'checked':''}><i></i></span></div>`;
  const sl=(k,l)=>`<div class="setrow"><label for="s-${k}">${l}</label><input type="range" id="s-${k}" min="0" max="100" value="${S[k]}"></div>`;
  function render(){
    card.innerHTML=`<header>Options</header><div class="inner"><div class="tabs">${['Gameplay','Audio','Video','Controls'].map(t=>`<button data-t="${t}" class="${t===tab?'on':''}">${t}</button>`).join('')}</div>
      <div>${tab==='Gameplay'?`<div class="setrow"><label for="s-difficulty">Difficulty</label><select id="s-difficulty" class="difficulty-select"><option value="casual" ${S.difficulty==='casual'?'selected':''}>Casual — more moves and hints</option><option value="normal" ${S.difficulty==='normal'?'selected':''}>Normal — balanced</option><option value="challenge" ${S.difficulty==='challenge'?'selected':''}>Challenge — fewer hints and fuse tiles</option></select></div>`+sw('tips','Tutorial tips')+sw('hintAnim','Hint animations')+sw('live','Tiles highlight (show valid words while dragging)')+sw('auto','Auto submit word (when it cannot grow longer)'):
        tab==='Audio'?sl('master','Master volume')+sl('music','Music volume')+sl('sfx','Sound effects')+sw('sound','Sound on'):
        tab==='Video'?sw('fx','Particle effects')+sw('reduce','Reduce motion and effects')+'<p style="margin-top:.6rem">The game also follows your device\'s reduced motion setting.</p>':
        `<div class="list"><p><kbd>A</kbd>-<kbd>Z</kbd> type a word, the game finds it on the grid</p><p><kbd>Enter</kbd> submit &nbsp; <kbd>Backspace</kbd> undo a letter</p><p><kbd>1</kbd> Star Surge &nbsp; <kbd>2</kbd> Crystal Shuffle &nbsp; <kbd>3</kbd> Hourglass</p><p><kbd>Space</kbd> ask Lumi for a hint</p><p><kbd>Esc</kbd> clear the word, or pause</p><p><b>Mouse or touch:</b> click/tap adjacent tiles in sequence, or drag across them. Click the last selected tile again to submit.</p></div>`}</div>
      <div class="row"><button class="btn primary small" id="o-close" data-close autofocus>Done</button></div></div>`;
    card.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});
    const difficulty=card.querySelector('#s-difficulty');if(difficulty)difficulty.onchange=()=>{S.difficulty=difficulty.value;saveS();toast('Difficulty saved for your next level')};
    card.querySelectorAll('input[type=checkbox]').forEach(i=>i.onchange=()=>{S[i.id.slice(2)]=i.checked;saveS();applyReduce();Snd.apply()});
    card.querySelectorAll('input[type=range]').forEach(i=>i.oninput=()=>{S[i.id.slice(2)]=+i.value;saveS();Snd.apply()});
    $('#o-close').onclick=()=>{closeModal();if(back)back()};
  }
  render();
}

/* ---------- inventory, shop, trophies ---------- */
function playerCard(){
  const lv=lvlOf(SAVE.xp),a=xpFor(lv),b=xpFor(lv+1),pct=Math.round((SAVE.xp-a)/(b-a)*100);
  return `<div class="pcard"><div class="portrait">${PORT.aria}</div><div><b>Aria Vale, Lv ${lv}</b><div class="xp"><i style="width:${pct}%"></i></div><small>${SAVE.xp-a} / ${b-a} XP to level ${lv+1} &nbsp;·&nbsp; ${SAVE.coins} Lumens</small></div></div>`;
}
function showInventory(tab,back){
  tab=tab||'Items';
  const card=openModal('','wide');
  function render(){
    let body='';
    if(tab==='Items'){
      body='<div class="list">'+ITEMS.map(it=>`<div class="shoprow" style="grid-template-columns:auto 1fr auto"><div class="ico ${it.id}">${ICON[it.id]}</div><div><b>${it.name}</b><small>${it.desc}</small></div><span class="own">x${SAVE.items[it.id]}</span></div>`).join('')+
        `<div class="shoprow" style="grid-template-columns:auto 1fr auto"><div class="ico hint"><span style="width:38px;height:38px;border-radius:50%;overflow:hidden;display:block">${PORT.lumi}</span></div><div><b>Lumi's hints</b><small>Free every level. Lumi points out the start of a word.</small></div><span class="own">${3+(hasRelic('lantern')?1:0)}/level</span></div></div>`;
    }else if(tab==='Relics'){
      body='<div class="list">'+RELICS.map(r=>{const own=hasRelic(r.id);return `<div class="relic ${own?'':'locked'}"><div class="ico relic">${own?r.sym:'?'}</div><div><b>${own?r.name:'Unknown relic'}</b><small>${own?r.desc:'Finish '+AREAS[r.area].name+' to earn it.'}</small></div></div>`}).join('')+'</div>';
    }else if(tab==='Materials'){
      body=`<div class="list"><div class="matrow"><div class="ico shard">${ICON.crystal}</div><div><b>Crystal Shards</b><small>Collected whenever a word cleanses a Blank tile. Five shards make one Crystal Shuffle.</small></div><span class="own">x${SAVE.shards}</span></div>
        <div class="row" style="justify-content:flex-start"><button class="btn small primary" id="craft" ${SAVE.shards>=5&&SAVE.items.crystal<9?'':'disabled'}>Craft Crystal Shuffle (5 shards)</button></div></div>`;
    }else{
      body='<div class="list">'+KEYITEMS.map(k=>{const own=SAVE.keys[k.id]||(k.id==='tome'&&SAVE.started);return `<div class="keyitem ${own?'':'locked'}"><div class="ico key">${own?'&#9993;':'?'}</div><div><b>${own?k.name:'Unknown item'}</b><small>${own?k.desc:'Found when you: '+k.when.toLowerCase()+'.'}</small></div></div>`}).join('')+'</div>';
    }
    card.innerHTML=`<header>Inventory<button class="x" data-close aria-label="Close">&times;</button></header><div class="inner">${playerCard()}
      <div class="tabs">${['Items','Relics','Materials','Key Items'].map(t=>`<button data-t="${t}" class="${t===tab?'on':''}">${t}</button>`).join('')}</div>${body}
      <div class="row"><button class="btn primary small" id="i-close" data-close>Close</button></div></div>`;
    card.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});
    const cr=$('#craft');if(cr)cr.onclick=()=>{if(SAVE.shards<5||SAVE.items.crystal>=9)return;SAVE.shards-=5;SAVE.items.crystal++;saveP();Snd.power();if(G)hud();render()};
    const close=()=>{closeModal();if(back)back()};
    $('#i-close').onclick=close;card.querySelector('.x').onclick=close;
  }
  render();
}
function showShop(back){
  const card=openModal('','wide');
  function render(msg){
    card.innerHTML=`<header>Shop<button class="x" data-close aria-label="Close">&times;</button></header><div class="inner">
      <div class="shopkeeper"><div class="portrait">${PORT.rowan}</div><div class="wallet"><span>${msg||'Ink is cheap. Memory is priceless.'}</span><span class="chip gem">${ICON.gem}${SAVE.coins}</span></div></div>
      <div class="list">${ITEMS.map(it=>{const full=SAVE.items[it.id]>=9,cant=SAVE.coins<it.price;return `<div class="shoprow"><div class="ico ${it.id}">${ICON[it.id]}</div><div><b>${it.name}</b><small>${it.desc} You have ${SAVE.items[it.id]}.</small></div><button class="btn small buy" data-id="${it.id}" ${full||cant?'disabled':''}><span class="price">${ICON.gem}${it.price}</span> ${full?'Full':'Buy'}</button></div>`}).join('')}</div>
      <p class="hint-line">Earn Lumens by restoring words, cleansing Blank tiles and clearing levels. You can hold up to 9 of each item.</p>
      <div class="row"><button class="btn primary small" id="s-close" data-close>Close</button></div></div>`;
    card.querySelectorAll('.buy').forEach(b=>b.onclick=()=>{
      const it=ITEMS.find(x=>x.id===b.dataset.id);
      if(SAVE.coins<it.price||SAVE.items[it.id]>=9)return;
      SAVE.coins-=it.price;SAVE.items[it.id]++;SAVE.stats.bought++;saveP();Snd.buy();checkTrophies();
      render('Yours. Use it well.');
    });
    const close=()=>{closeModal();if(back)back()};
    $('#s-close').onclick=close;card.querySelector('.x').onclick=close;
  }
  render();
}
function showTrophies(back){
  const done=TROPHIES.filter(t=>SAVE.ach['t_'+t.id]).length;
  const card=openModal(`<header>Trophies (${done}/${TROPHIES.length})<button class="x" data-close aria-label="Close">&times;</button></header><div class="inner"><div class="list">${TROPHIES.map(t=>{
    const ok=!!SAVE.ach['t_'+t.id],[a,b]=t.prog(),pct=Math.min(100,Math.round(a/b*100));
    return `<div class="trophy ${ok?'done':'locked'}"><div class="medal">${ok?'★':'?'}</div><div><b>${t.name}</b><small>${t.desc}</small>${ok?'':`<div class="pbar"><i style="width:${pct}%"></i></div>`}</div><span class="st">${ok?'Unlocked':Math.min(a,b)+' / '+b}</span></div>`}).join('')}</div>
    <div class="row"><button class="btn primary small" id="t-close" data-close>Close</button></div></div>`,'wide');
  const close=()=>{closeModal();if(back)back()};
  $('#t-close').onclick=close;card.querySelector('.x').onclick=close;
}

/* ---------- dialogue ---------- */
let dlgState=null;
function playDialogue(key,done){
  const d=DIALOGUE[key];
  setScene(d.scene, (d.scene === 'forest' || d.scene === 'caverns') ? .5 : .7);
  dlgState={lines:d.lines,i:0,done,typing:false,timer:null,full:''};
  $('#dlg').classList.add('open');modalOpen=true;
  dlgShow();
}
function dlgShow(){
  const [who,text]=dlgState.lines[dlgState.i];
  $('#d-portrait').innerHTML=PORT[who];$('#dbox').classList.toggle('narr',who==='narrator');
  $('#d-name').textContent=NAMES[who];
  const tx=$('#d-text');tx.textContent='';dlgState.full=text;dlgState.typing=true;let n=0;
  clearInterval(dlgState.timer);
  dlgState.timer=setInterval(()=>{n+=2;tx.textContent=text.slice(0,n);if(n>=text.length){clearInterval(dlgState.timer);dlgState.typing=false}},22);
}
function dlgAdvance(){
  if(!dlgState)return;
  if(dlgState.typing){clearInterval(dlgState.timer);$('#d-text').textContent=dlgState.full;dlgState.typing=false;return}
  dlgState.i++;
  if(dlgState.i>=dlgState.lines.length)dlgEnd();else dlgShow();
}
function dlgEnd(){
  clearInterval(dlgState.timer);const cb=dlgState.done;dlgState=null;
  $('#dlg').classList.remove('open');modalOpen=false;if(cb)cb();
}
$('#dlg').addEventListener('click',e=>{if(e.target.id==='dlg-skip')return;dlgAdvance()});
$('#dlg-skip').addEventListener('click',e=>{e.stopPropagation();if(dlgState)dlgEnd()});

/* =====================================================================
   KEYBOARD
   ===================================================================== */
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key;
  if(dlgState){if(k===' '||k==='Enter'){e.preventDefault();dlgAdvance()}return}
  if(modalOpen&&k==='Tab'){
    const card=$('#modal .card');
    if(card&&!card.contains(document.activeElement)){
      const items=[...card.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      e.preventDefault();(e.shiftKey?items[items.length-1]:items[0]||card).focus();
    }
    return;
  }
  if(k==='Escape'){
    if(modalOpen){
      if(G&&G.paused&&$('#p-resume'))$('#p-resume').click();
      else{const c=$('#modal [data-close]');if(c)c.click()}
    }else if($('#scr-game').classList.contains('active')&&G){
      if(G.chain.length&&!G.busy){clearChain()}else pauseGame();
    }
    return;
  }
  if(modalOpen||!G||!$('#scr-game').classList.contains('active'))return;
  if(/^[a-zA-Z]$/.test(k)){e.preventDefault();typeLetter(k.toLowerCase())}
  else if(k==='Backspace'){e.preventDefault();typeBack()}
  else if(k==='Enter'){e.preventDefault();if(canPlay()&&G.chain.length)submitChain()}
  else if(k===' '){e.preventDefault();usePower('hint')}
  else if(k==='1')usePower('star');
  else if(k==='2')usePower('crystal');
  else if(k==='3')usePower('hour');
});

/* =====================================================================
   MENU WIRING + START
   ===================================================================== */
$('#m-continue').onclick=()=>{const i=Math.min(SAVE.unlocked,LEVELS.length)-1;startLevel(i)};
$('#m-new').onclick=()=>{
  const go=()=>{
    resetProfile();
    playDialogue('prologue',()=>startLevel(0));
  };
  if(SAVE.started){
    openModal('<header>Start a new game?</header><div class="inner"><p>This erases all saved progress, including Aria\'s level, Lumens, stars, unlocked levels, items and trophies.</p><div class="row"><button class="btn small" id="n-no" data-close autofocus>Keep my progress</button><button class="btn primary small" id="n-yes">Erase progress</button></div></div>');
    $('#n-no').onclick=closeModal;$('#n-yes').onclick=()=>{closeModal();go()};
  }else go();
};
$('#m-chapters').onclick=goChapters;
$('#m-endless').onclick=()=>{SAVE.started=true;saveP();startLevel(-1)};
$('#m-inv').onclick=()=>showInventory('Items');
$('#m-shop').onclick=()=>showShop(goTitle);
$('#m-trophies').onclick=()=>showTrophies();
$('#m-how').onclick=showHow;
$('#m-options').onclick=()=>openOptions();
$('#m-credits').onclick=()=>showCredits();
$('#ch-back').onclick=goTitle;
$('#btn-sound').onclick=()=>{S.sound=!S.sound;saveS();Snd.apply();$('#btn-sound').textContent='Sound: '+(S.sound?'on':'off')};
$('#btn-full').onclick=()=>{
  const d=document;
  if(!d.fullscreenElement){(d.documentElement.requestFullscreen||function(){}).call(d.documentElement)}
  else if(d.exitFullscreen)d.exitFullscreen();
};
$('#logo-img').src=ART.logo;
$('#hud-portrait').innerHTML=PORT.aria;$('#vbar-portrait').innerHTML=PORT.veyra;$('#vbubble-portrait').innerHTML=PORT.veyra;

applyReduce();checkTrophies();
if(!SAVE.seen.prologue){
  SAVE.seen.prologue=1;saveP();
  playDialogue('prologue',goTitle);
}else goTitle();

/* small hook so the game can be smoke-tested */
window.__wordbound={state:()=>G,setupLevel,submitWord,solve,isWord,LEVELS,startNow:()=>{G.started=true},endLevel,SAVE:()=>SAVE,typeLetter,lettersOf,usePower,closeModal,startLevel,COMMON};
})();
