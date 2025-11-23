/* FINAL script.js — full game logic restored, using your repo image filenames */

const ASSETS_BASE = 'https://raw.githubusercontent.com/yusufchaiwala/fold-and-spore-assets/main/images/';

// image handles
let IMG = {
  tile_sun: null,
  tile_rock: null,
  tile_dry: null,
  tile_moist: null,
  tile_shade: null,
  tile_goal: null,
  tile_lock: null,
  char_mimosa: null,
  char_moss_fresh: null,
  char_moss_danger: null
};

/* ---------- AUDIO VARIABLES ---------- */
const AUDIO_BASE = 'https://raw.githubusercontent.com/yusufchaiwala/fold-and-spore-assets/main/';
let s_bg_menu = null, s_bg_game = null;
let s_step_mimosa = null, s_step_moss = null;
let s_danger = null, s_dew_spawn = null, s_dew_collect = null;
let s_moisten = null, s_shade = null, s_unlock = null, s_reach_gate = null;
let s_finish = null;

/* ---------- helpers for sound ---------- */
function safePlay(sound, vol=1){
  if(!sound) return;
  try{ if(typeof sound.setVolume === 'function') sound.setVolume(vol); if(typeof sound.play === 'function') sound.play(); }catch(e){ console.warn('safePlay failed', e); }
}
function startBG(sound, opts={volume:0.5}){
  if(!sound) return;
  try{
    if(typeof sound.loop === 'function'){
      if(typeof sound.isPlaying === 'function' && sound.isPlaying()) return;
      sound.setVolume(0);
      sound.loop();
      sound.setVolume(opts.volume||0.5, 0.6);
    } else if(typeof sound.play === 'function') sound.play();
  }catch(e){ console.warn('startBG failed', e); }
}
function stopBG(sound){
  if(!sound) return;
  try{
    if(typeof sound.setVolume === 'function'){ sound.setVolume(0,0.45); setTimeout(()=>{ try{ if(typeof sound.stop === 'function') sound.stop(); }catch(e){} },480); }
    else if(typeof sound.stop === 'function') sound.stop();
  }catch(e){ console.warn('stopBG failed', e); }
}

/* ---------- Load audio & images in preload (p5) ---------- */
function preload(){
  // audio loader (safe)
  if(typeof loadSound === 'function'){
    function tryLoad(filename){
      try { return loadSound(AUDIO_BASE + filename); }
      catch(e){
        try { return loadSound(AUDIO_BASE + encodeURIComponent(filename)); }
        catch(e2){ console.warn('Audio failed', filename, e2); return null; }
      }
    }
    s_bg_menu      = tryLoad('menu.mp3');
    s_bg_game      = tryLoad('level.mp3');
    s_step_mimosa  = tryLoad('jump_mimosa.mp3');
    s_step_moss    = tryLoad('jump_moss.mp3');
    s_danger       = tryLoad('clock.mp3');
    s_dew_spawn    = tryLoad('diamond.mp3');
    s_dew_collect  = tryLoad('diamond.mp3');
    s_moisten      = tryLoad('water_steps.mp3');
    s_shade        = tryLoad('ice_steps.mp3');
    s_unlock       = tryLoad('portal_open.mp3');
    s_reach_gate   = tryLoad('portal_close.mp3');
    s_finish       = tryLoad('finish.mp3');
  }

  // image loader (p5 or fallback)
  function li(path){
    if(typeof loadImage === 'function') {
      try { return loadImage(path); }
      catch(e){ console.warn('loadImage failed', path, e); return null; }
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = path;
      return img;
    }
  }

  IMG.tile_sun = li(ASSETS_BASE + 'tile-sun.png');
  IMG.tile_rock = li(ASSETS_BASE + 'tile-rock.png');
  IMG.tile_dry = li(ASSETS_BASE + 'tile-dry.png');
  IMG.tile_moist = li(ASSETS_BASE + 'tile-moist.png');
  IMG.tile_shade = li(ASSETS_BASE + 'tile-shade.png');
  IMG.tile_goal = li(ASSETS_BASE + 'tile-goal.png');
  IMG.tile_lock = li(ASSETS_BASE + 'tile_lock.png');

  IMG.char_mimosa = li(ASSETS_BASE + 'char-mimosa-fresh.png');
  IMG.char_moss_fresh = li(ASSETS_BASE + 'char-moss-fresh.png');
  IMG.char_moss_danger = li(ASSETS_BASE + 'char-moss-danger.png');

  console.log('Image preload attempted', IMG);
}

/* ---------- helper: draw rounded-rect clip and draw image inside ---------- */
function drawImageRounded(img, x, y, w, h, r){
  if(!img) {
    push();
    noStroke();
    fill('#e0e0e0');
    rect(x,y,w,h,r);
    pop();
    return;
  }
  push();
  const ctx = drawingContext;
  ctx.save();
  const corner = r || 8;
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + w, y, x + w, y + h, corner);
  ctx.arcTo(x + w, y + h, x, y + h, corner);
  ctx.arcTo(x, y + h, x, y, corner);
  ctx.arcTo(x, y, x + w, y, corner);
  ctx.closePath();
  ctx.clip();
  try {
    image(img, x, y, w, h);
  } catch(e){
    try { ctx.drawImage(img, x, y, w, h); } catch(e2){ /* ignore */ }
  }
  ctx.restore();
  pop();
}

/* ---------- Game constants & state ---------- */
const TILE = { ROCK:'R', SUN:'S', DRY:'D', MOIST:'M', SHADE:'H', GOAL_A:'A', GOAL_B:'B' };
const WIDTH = 11, HEIGHT = 9, TILESIZE = 72;
const PADDING = 4;
const INNER_SIZE = TILESIZE - PADDING*2;
const REQ_SHADES = 5;

let grid = [];
let levels = [];
let levelIndex = 0;

let mimosa = { x:1, y:1, px:0, py:0, name:'Mimosa', color:'#7fd7a8', size:0.80, shadeSet:new Set() };
let moss   = { x:2, y:HEIGHT-2, px:0, py:0, name:'Moss', color:'#3ea68f', size:0.80, moisture:0 };

let dewRemaining = 0;
let gateA = { x:0,y:0,open:false, name:'A', owner:'Mimosa' }, gateB = { x:0,y:0,open:false, name:'B', owner:'Moss' };
let switchT = { x:0,y:0,active:false }, switchL = { x:0,y:0,active:false };

let gameState = 'menu';
let timeLeft = 120000, timerRunning = false;
let dangerState = { active:false, player:null, x:0, y:0, expiresAt:0, duration:7000 };

let particles = [];
let dewSpawnIntervalId = null;
let currentLevelInitialDew = 0;

/* ---------- DOM utils ---------- */
function $(id){ return document.getElementById(id); }
function setText(id, t){ const e = $(id); if(e) e.innerText = t; }

/* ---------- p5 setup ---------- */
function setup(){
  const c = createCanvas(WIDTH*TILESIZE, HEIGHT*TILESIZE);
  c.parent('canvas-container');
  frameRate(60);

  levels = [
    { name:'Tutorial Field', dew:3, sun:5, dry:3, ice:0, bounce:2, spike:0 },
    { name:'Valley Slide', dew:4, sun:5, dry:4, ice:0, bounce:3, spike:1 },
    { name:'Labyrinth Glen', dew:5, sun:6, dry:5, ice:0, bounce:4, spike:2 }
  ];

  attachUI();
  renderTutorialSlide(0);
  showOnboardStep(1);

  try { playMenuMusic(); } catch(e){}

  loadLevel(0);
}

/* ---------- UI attachment (and legend update) ---------- */
function attachUI(){
  function bind(id, fn){ const el = $(id); if(!el) return; if(el.__bound) return; el.addEventListener('click', fn); el.__bound=true; }

  bind('onboard-next', ()=> renderTutorialSlide(Math.min(2, onboardSlide+1)));
  bind('onboard-prev', ()=> renderTutorialSlide(Math.max(0, onboardSlide-1)));
  bind('onboard-start', ()=> showOnboardStep(2));
  bind('onboard-skip', ()=> { resumeAudioFromUserGesture(); showOnboardStep(2); });

  bind('name-back', ()=> showOnboardStep(1));
  bind('name-next', ()=> { resumeAudioFromUserGesture(); startLoadingScreen(); });

  bind('loading-skip', ()=> { resumeAudioFromUserGesture(); finishLoading(); });
  bind('loading-start', ()=> { resumeAudioFromUserGesture(); finishLoading(); });

  bind('btn-pause', ()=> togglePause());
  bind('btn-restart', ()=> { stopDewSpawner(); loadLevel(levelIndex); startGame(); });
  bind('btn-tutorial', ()=> showOnboardStep(1));
  bind('btn-home', ()=> {
    showOnboardStep(1);
    playMenuMusic();
    stopDangerSound();
  });

  bind('popup-goal-close', ()=> { const p = $('popup-goal'); if(p) p.style.display='none'; });
  bind('popup-info-close', ()=> { const p = $('popup-info'); if(p) p.style.display='none'; });

  bind('end-home', ()=> {
    stopDewSpawner();
    const p = $('popup-end'); if(p) p.style.display='none';
    showOnboardStep(1);
    playMenuMusic();
    stopDangerSound();
  });
  bind('end-next', ()=> { stopDewSpawner(); const p = $('popup-end'); if(p) p.style.display='none'; levelIndex = Math.min(levelIndex+1, levels.length-1); loadLevel(levelIndex); startGame(); });

  const im = $('input-mimosa'); if(im) im.addEventListener('input',(e)=>{ mimosa.name = e.target.value || 'Mimosa'; applyGateNames(); updateHUD(); });
  const is = $('input-moss'); if(is) is.addEventListener('input',(e)=>{ moss.name = e.target.value || 'Moss'; applyGateNames(); updateHUD(); });

  setText('req-shade', REQ_SHADES);

  // update legend to show PNG thumbnails
  setTimeout(()=> {
    try {
      const legend = $('legend');
      if(legend){
        legend.innerHTML = `
          <div class="legend-row"><img src="${ASSETS_BASE}tile-sun.png" style="width:22px;height:16px;border-radius:4px;object-fit:cover"/> Sun (danger)</div>
          <div class="legend-row"><img src="${ASSETS_BASE}tile-dry.png" style="width:22px;height:16px;border-radius:4px;object-fit:cover"/> Dry (needs moisture)</div>
          <div class="legend-row"><img src="${ASSETS_BASE}tile-moist.png" style="width:22px;height:16px;border-radius:4px;object-fit:cover"/> Dew / Moist (collect)</div>
          <div class="legend-row"><img src="${ASSETS_BASE}tile-shade.png" style="width:22px;height:16px;border-radius:4px;object-fit:cover"/> Shade (fold)</div>
          <div class="legend-row"><img src="${ASSETS_BASE}tile-goal.png" style="width:22px;height:16px;border-radius:4px;object-fit:cover"/> Gate A (Mimosa)</div>
          <div class="legend-row"><img src="${ASSETS_BASE}tile-goal.png" style="width:22px;height:16px;border-radius:4px;object-fit:cover"/> Gate B (Moss)</div>
          <div class="legend-row" style="grid-column:1/3; font-size:13px; color:var(--muted);">Switch labels: T opens Gate A, L opens Gate B</div>
        `;
      }
    } catch(e){}
  }, 120);
}

/* ---------- audio resume (one-time unlock) ---------- */
let audioResumed = false;
function resumeAudioFromUserGesture(){
  if(audioResumed) return;
  audioResumed = true;
  if(typeof userStartAudio === 'function'){
    userStartAudio().then(()=>{ playMenuMusic(); }).catch((e)=>{ console.warn('userStartAudio failed', e); playMenuMusic(); });
  } else playMenuMusic();
}

/* ---------- onboarding / loading ---------- */
let onboardSlide = 0;
function renderTutorialSlide(i){
  const slides = document.querySelectorAll('#onboard-modal .slide');
  slides.forEach((s, idx)=> s.style.display = (idx === i) ? 'block' : 'none');
  onboardSlide = i;
  const prev = $('onboard-prev'), next = $('onboard-next'), start = $('onboard-start');
  if(prev) prev.style.display = i===0 ? 'none' : 'inline-block';
  if(next) next.style.display = i===2 ? 'none' : 'inline-block';
  if(start) start.style.display = i===2 ? 'inline-block' : 'none';
}
function showOnboardStep(n){
  document.querySelectorAll('.onboard-step').forEach(el => el.style.display='none');
  const t = $('onboard-step-' + n); if(t) t.style.display='block';
  const modal = $('onboard-modal'); if(modal) modal.style.display='flex';
  if($('stage')) $('stage').classList.add('blurred');

  if(n === 1){
    playMenuMusic();
    stopDangerSound();
    const oneTimeUnlock = (ev) => { try { resumeAudioFromUserGesture(); } catch(e) { console.warn(e); } modal.removeEventListener('pointerdown', oneTimeUnlock); modal.removeEventListener('click', oneTimeUnlock); };
    modal.addEventListener('pointerdown', oneTimeUnlock);
    modal.addEventListener('click', oneTimeUnlock);
  }
}

/* loading UI */
let loadingInterval = null;
function startLoadingScreen(){
  const n1 = ($('input-mimosa') && $('input-mimosa').value.trim()) || '';
  const n2 = ($('input-moss') && $('input-moss').value.trim()) || '';
  if(n1) mimosa.name = n1; if(n2) moss.name = n2;
  setText('role-mimosa-name', mimosa.name); setText('role-moss-name', moss.name);
  applyGateNames();

  showOnboardStep(3);
  let t = 15, total=15;
  const fill = $('loading-fill'); if(fill) fill.style.width='0%';
  if($('loading-skip')) $('loading-skip').style.display='inline-block';
  if($('loading-start')) $('loading-start').style.display='none';
  if($('loading-timer')) $('loading-timer').innerText = `${t}s`;

  resumeAudioFromUserGesture();

  loadingInterval = setInterval(()=> {
    t--;
    if($('loading-timer')) $('loading-timer').innerText = `${t}s`;
    const pct = Math.round(((total - t) / total) * 100);
    if(fill) fill.style.width = pct + '%';
    if(t <= 0) finishLoading();
    else if(t <= total-1 && $('loading-start')) $('loading-start').style.display='inline-block';
  }, 1000);
}
function finishLoading(){
  clearInterval(loadingInterval);
  const fill = $('loading-fill'); if(fill) fill.style.width='100%';
  const modal = $('onboard-modal'); if(modal) modal.style.display='none';
  const st = $('stage'); if(st) st.classList.remove('blurred');

  stopMenuMusic();
  stopBG(s_bg_menu);
  safePlay(s_step_mimosa, 0.7);
  startBG(s_bg_game, {volume:0.5});

  loadLevel(levelIndex);
  startGame();
}

/* ---------- safeTile + count ---------- */
function safeTile(x, y){
  if(!grid || !Array.isArray(grid) || !grid[y] || !grid[y][x]){
    return { type: TILE.ROCK, dew:false, dewPulse:0, bounce:false, spike:false, shadeUntil:0 };
  }
  return grid[y][x];
}
function countDew(){
  if(!grid || !Array.isArray(grid)) return 0;
  let ct = 0;
  for(let y=0;y<HEIGHT;y++){
    if(!grid[y]) continue;
    for(let x=0;x<WIDTH;x++){
      const t = safeTile(x,y);
      if(t.dew) ct++;
    }
  }
  return ct;
}

/* ---------- loadLevel (with >=5 suns, no ice) ---------- */
function loadLevel(i){
  const preset = levels[Math.min(i, levels.length-1)];
  levelIndex = i;
  currentLevelInitialDew = preset.dew;

  stopDewSpawner();

  let rawGrid = [];
  for(let y=0;y<HEIGHT;y++){
    rawGrid[y]=[];
    for(let x=0;x<WIDTH;x++) rawGrid[y][x] = { type:TILE.ROCK, dew:false, dewPulse:0, bounce:false, spike:false, shadeUntil:0 };
  }

  grid = makeSafeGrid(rawGrid);

  grid[HEIGHT-1][0].type = TILE.GOAL_A;
  grid[HEIGHT-1][WIDTH-1].type = TILE.GOAL_B;
  gateA.x=1; gateA.y=HEIGHT-1; gateA.open = false;
  gateB.x=WIDTH-2; gateB.y=HEIGHT-1; gateB.open = false;

  switchL.x = Math.max(1, Math.floor(WIDTH*0.25)); switchL.y = Math.max(1, Math.floor(HEIGHT*0.55)); switchL.active=false;
  switchT.x = Math.min(WIDTH-2, Math.floor(WIDTH*0.75)); switchT.y = Math.max(1, Math.floor(HEIGHT*0.4)); switchT.active=false;

  placeCluster(Math.max(1, Math.floor(preset.dew/2)), 'right');
  placeCluster(Math.max(0, preset.dew - Math.floor(preset.dew/2)), 'mid');

  let dewPlaced = countDew();
  let pool = [];
  for(let y=1;y<HEIGHT-1;y++) for(let x=1;x<WIDTH-1;x++) if(!grid[y][x].dew && grid[y][x].type===TILE.ROCK) pool.push({x,y});
  shuffleArray(pool);
  while(dewPlaced < preset.dew && pool.length){ let p = pool.pop(); triggerDewAt(p.x, p.y); dewPlaced++; }

  // ensure >=5 sun tiles at start
  const neededSun = Math.max(preset.sun || 0, 5);
  pool = [];
  for(let y=1;y<HEIGHT-1;y++) for(let x=1;x<WIDTH-1;x++) if(grid[y][x].type===TILE.ROCK && !grid[y][x].dew) pool.push({x,y});
  shuffleArray(pool);
  for(let k=0;k<neededSun && pool.length;k++){
    let p = pool.pop();
    grid[p.y][p.x].type = TILE.SUN;
  }

  // place dry tiles
  pool = [];
  for(let y=1;y<HEIGHT-1;y++) for(let x=1;x<WIDTH-1;x++) if(grid[y][x].type===TILE.ROCK && !grid[y][x].dew) pool.push({x,y});
  shuffleArray(pool);
  for(let k=0;k<preset.dry && pool.length;k++){ let p = pool.pop(); grid[p.y][p.x].type = TILE.DRY; }

  // bounce + spike
  pool = [];
  for(let y=1;y<HEIGHT-1;y++) for(let x=1;x<WIDTH-1;x++) if(grid[y][x].type===TILE.ROCK && !grid[y][x].dew) pool.push({x,y});
  shuffleArray(pool);
  for(let k=0;k<preset.bounce && pool.length;k++){ let p = pool.pop(); grid[p.y][p.x].bounce = true; }
  for(let k=0;k<preset.spike && pool.length;k++){ let p = pool.pop(); grid[p.y][p.x].spike = true; }

  // ensure a decent active tile count if sparse
  let activeCount = 0;
  for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++){ const c = grid[y][x]; if(c.type!==TILE.ROCK || c.dew || c.bounce || c.spike) activeCount++; }
  const minActive = Math.ceil(WIDTH*HEIGHT*0.5);
  for(let y=0;y<HEIGHT && activeCount<minActive;y++){
    for(let x=0;x<WIDTH && activeCount<minActive;x++){
      if(grid[y][x].type===TILE.ROCK && !grid[y][x].dew && !(x===switchL.x && y===switchL.y) && !(x===switchT.x && y===switchT.y)){
        grid[y][x].type = TILE.DRY; activeCount++;
      }
    }
  }

  dewRemaining = countDew();

  mimosa.x=1; mimosa.y=1; mimosa.px = mimosa.x*TILESIZE; mimosa.py = mimosa.y*TILESIZE; mimosa.shadeSet = new Set();
  moss.x=2; moss.y=HEIGHT-2; moss.px = moss.x*TILESIZE; moss.py = moss.y*TILESIZE; moss.moisture = 0;
  gateA.open=false; gateB.open=false; switchL.active=false; switchT.active=false;
  dangerState.active=false; timeLeft=120000; timerRunning=false; gameState='menu';

  applyGateNames();
  updateHUD();
}

/* ---------- cluster placement ---------- */
function placeCluster(count, region){
  let cx = Math.floor(WIDTH/2), cy = Math.floor(HEIGHT/2);
  if(region==='left') cx = Math.floor(WIDTH*0.2);
  if(region==='right') cx = Math.floor(WIDTH*0.75);
  let cells=[];
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const x=cx+dx,y=cy+dy; if(x>0 && x<WIDTH-1 && y>0 && y<HEIGHT-1) cells.push({x,y}); }
  shuffleArray(cells);
  let placed=0;
  for(let i=0;i<cells.length && placed<count;i++){ const c=cells[i]; if(grid[c.y][c.x].type===TILE.ROCK && !grid[c.y][c.x].dew){ grid[c.y][c.x].dew = true; grid[c.y][c.x].dewPulse = millis() + 2200; placed++; } }
  return placed;
}

/* ---------- draw loop ---------- */
function draw(){
  if(!grid || !Array.isArray(grid) || grid.length === 0){
    background('#eaf3ea');
    fill(0); textAlign(CENTER,CENTER); textSize(16); text('Loading level...', width/2, height/2);
    return;
  }

  clear();
  background('#eaf3ea');

  for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++) drawTile(x,y);

  // draw gates & switches overlays (goal tile lock overlay handled in drawGate)
  drawGate(gateA.x, gateA.y, gateA);
  drawGate(gateB.x, gateB.y, gateB);
  drawSwitch(switchT.x, switchT.y, 'T', gateA.name);
  drawSwitch(switchL.x, switchL.y, 'L', gateB.name);

  updatePlayerVisual(moss);
  updatePlayerVisual(mimosa);
  drawPlayer(moss);
  drawPlayer(mimosa);

  updateParticles();
  updateHUD();

  if(dangerState.active) drawDangerBar();

  if(gameState==='playing' && timerRunning){
    timeLeft -= deltaTime;
    if(timeLeft <= 0){ timeLeft = 0; timerRunning=false; stopDewSpawner(); showEnd('Time up','You ran out of time.'); }
  }

  if(gameState==='playing') checkWin();
}

/* ---------- drawTile with PNGs + rounded clipping + padding ---------- */
function drawTile(x,y){
  const t = safeTile(x,y);
  const px = x*TILESIZE, py = y*TILESIZE;
  push();

  // draw a subtle outer 'slot' background (the separators/padding effect)
  noStroke();
  fill('#efe8da'); // slightly contrast background between tiles (keeps padding visible)
  rect(px, py, TILESIZE, TILESIZE, 10);

  // compute inner area to draw PNG
  const ix = px + PADDING, iy = py + PADDING, iw = INNER_SIZE, ih = INNER_SIZE;
  const radius = 8;

  // pick image by tile type (goal, shade, sun, dry, moist, rock)
  let img = null;
  if(t.type === TILE.GOAL_A || t.type === TILE.GOAL_B){
    // lighter highlight for goal: draw a light translucent rect behind to highlight
    noStroke(); fill(255,255,255,48);
    rect(ix, iy, iw, ih, radius);
    img = IMG.tile_goal;
  } else if(t.type === TILE.SUN) img = IMG.tile_sun;
  else if(t.type === TILE.DRY) img = IMG.tile_dry;
  else if(t.type === TILE.MOIST) img = IMG.tile_moist;
  else if(t.type === TILE.SHADE) img = IMG.tile_shade;
  else img = IMG.tile_rock;

  // draw image clipped to rounded rect
  drawImageRounded(img, ix, iy, iw, ih, radius);

  // dew circle (keeps behaviour) — draw on top-right of inner area
  if(t.dew){
    const now = millis();
    const pulseLeft = Math.max(0, (t.dewPulse || 0) - now);
    if(pulseLeft > 0){ const p = pulseLeft / 2200; const radiusPulse = INNER_SIZE*0.6 * (1 - p*0.6); noStroke(); fill(100,200,255, 140 * (1 - p)); ellipse(ix + INNER_SIZE*0.78, iy + INNER_SIZE*0.22, radiusPulse); }
    noStroke(); fill('#bfeeff'); ellipse(ix+INNER_SIZE*0.78,iy+INNER_SIZE*0.22,INNER_SIZE*0.22);
  }

  // bounce overlay
  if(t.bounce){
    noStroke(); fill(255,220,120,60);
    rect(ix+6, iy+6, iw-12, ih-12, 6);
  }

  // spike overlay
  if(t.spike){
    noStroke(); fill(180,60,60);
    triangle(ix+12, iy+ih-10, ix+iw-12, iy+ih-10, ix+iw/2, iy+ih-24);
  }

  pop();
}

/* ---------- gate / lock overlay drawing ---------- */
function drawGate(x,y,gate){
  if(x==null) return;
  const px = x*TILESIZE, py = y*TILESIZE;
  const ix = px + PADDING, iy = py + PADDING, iw = INNER_SIZE, ih = INNER_SIZE;
  const radius = 8;

  // draw lock overlay only on the goal tile cell and only while closed
  if(!gate.open){
    // draw lock image clipped to rounded rect
    drawImageRounded(IMG.tile_lock, ix, iy, iw, ih, radius);
  }

  // label
  push();
  noStroke(); fill('#2f6b4f');
  textAlign(CENTER,BOTTOM); textSize(10);
  text(`${gate.name} (for ${gate.owner})`, px+TILESIZE/2, py - 6);
  pop();
}

/* ---------- switches ---------- */
function drawSwitch(x,y,label, opensGateName){
  if(x==null) return;
  push();
  translate(x*TILESIZE, y*TILESIZE);
  noStroke();
  const col = label==='T'? color(60,140,200) : color(140,220,170);
  fill(col); rect(TILESIZE*0.12,TILESIZE*0.12,TILESIZE*0.28,TILESIZE*0.28,6);
  fill(255); textAlign(CENTER,CENTER); textSize(12); text(label, TILESIZE*0.26, TILESIZE*0.26);
  noStroke(); fill(20,50,30); textAlign(CENTER,TOP); textSize(10); text(`Opens: ${opensGateName}`, TILESIZE/2, TILESIZE + 2);
  if(label==='T'){ if(!switchT.active && moss.x===x && moss.y===y) drawPulsingTip(TILESIZE/2, -14, "Press M"); }
  else { if(!switchL.active && mimosa.x===x && mimosa.y===y) drawPulsingTip(TILESIZE/2, -14, "Press SPACE"); }
  pop();
}
function drawPulsingTip(px, py, textStr){
  push(); translate(px, py); const t = millis() * 0.004; const scale = 1 + sin(t)*0.08; const alpha = 180 + 60 * sin(t*1.3);
  noStroke(); fill(255, 255, 255, alpha * 0.6); ellipse(0, 0, 64*scale, 26*scale);
  noStroke(); fill(20,40,30,240); textAlign(CENTER,CENTER); textSize(12*scale); text(textStr,0,0);
  noFill(); stroke(60,130,80, 150 + 80 * sin(t)); strokeWeight(1.2); ellipse(0,0,86*scale,34*scale); pop();
}

/* ---------- player visuals ---------- */
function updatePlayerVisual(p){ p.px = lerp(p.px, p.x*TILESIZE, 0.22); p.py = lerp(p.py, p.y*TILESIZE, 0.22); }
function drawPlayer(p){
  push();
  // center inside tile area
  const cx = p.px + TILESIZE*0.5, cy = p.py + TILESIZE*0.5 + sin(millis()/300)*2;
  const imgW = TILESIZE * p.size, imgH = TILESIZE * p.size;
  const drawX = cx - imgW/2, drawY = cy - imgH/2;

  // choose image: moss danger uses char_moss_danger while in danger on tile
  let charImg = IMG.char_mimosa;
  if(p === moss){
    if(dangerState.active && dangerState.player === 'moss' && moss.x === dangerState.x && moss.y === dangerState.y && IMG.char_moss_danger) charImg = IMG.char_moss_danger;
    else charImg = IMG.char_moss_fresh;
  } else {
    charImg = IMG.char_mimosa;
  }

  // draw shadow
  noStroke(); fill(0,0,0,40);
  ellipse(cx, cy + TILESIZE*0.25, TILESIZE*0.6, TILESIZE*0.22);

  // draw character image clipped to a rounded rect
  drawImageRounded(charImg, drawX, drawY, imgW, imgH, 12);

  // name plate above
  noStroke(); fill(20,40,30,200); rect(drawX - 4, drawY - 20, imgW + 8, 20, 8);
  fill(255); textAlign(CENTER,CENTER); textSize(11); text(p.name, drawX + imgW/2, drawY - 10);

  pop();
}

/* ---------- controls & movement ---------- */
let lastMove = { mimosa:0, moss:0 }, MOVE_COOLDOWN = 110;
function keyPressed(){
  if(gameState !== 'playing') return;
  if(key==='w' || key==='W') attemptMove(mimosa,0,-1,'mimosa');
  if(key==='s' || key==='S') attemptMove(mimosa,0,1,'mimosa');
  if(key==='a' || key==='A') attemptMove(mimosa,-1,0,'mimosa');
  if(key==='d' || key==='D') attemptMove(mimosa,1,0,'mimosa');
  if(keyCode===32) performFold();
  if(keyCode===UP_ARROW) attemptMove(moss,0,-1,'moss');
  if(keyCode===DOWN_ARROW) attemptMove(moss,0,1,'moss');
  if(keyCode===LEFT_ARROW) attemptMove(moss,-1,0,'moss');
  if(keyCode===RIGHT_ARROW) attemptMove(moss,1,0,'moss');
  if(key==='m' || key==='M') useMoisture();
}
function attemptMove(p,dx,dy,who, allowBounce=true){
  const now = millis(); if(now - lastMove[who] < MOVE_COOLDOWN) return; lastMove[who]=now;
  const nx = p.x + dx, ny = p.y + dy; if(!inBounds(nx,ny)) return;
  const dest = grid[ny][nx];

  if(p===mimosa){ if(!gateA.open && nx===gateA.x && ny===gateA.y) return; if(dest && dest.type===TILE.GOAL_B) return; }
  else { if(!gateB.open && nx===gateB.x && ny===gateB.y) return; if(dest && dest.type===TILE.GOAL_A) return; }

  if(dest && dest.spike){ p.x = nx; p.y = ny; afterMove(p); if(!(dest.type === TILE.SHADE || dest.type === TILE.MOIST)) { stopDewSpawner(); stopDangerSound(); showEnd('Lost', p.name + ' hit spikes.'); } return; }

  p.x = nx; p.y = ny;

  if(grid[p.y][p.x].bounce && allowBounce){ attemptMove(p, dx, dy, who, false); return; }
  if(grid[p.y][p.x].bounce) spawnParticle(p.x*TILESIZE + TILESIZE*0.5, p.y*TILESIZE + TILESIZE*0.5, color(255,220,120));

  if(p === mimosa) safePlay(s_step_mimosa, 0.9); else safePlay(s_step_moss, 0.9);

  afterMove(p);
}
function afterMove(p){
  const c = grid[p.y][p.x];
  if(p===moss && c && c.dew){ c.dew=false; dewRemaining = Math.max(0, dewRemaining-1); moss.moisture = Math.min(5, moss.moisture+1); spawnParticle(p.x*TILESIZE + TILESIZE*0.5, p.y*TILESIZE + TILESIZE*0.3, color(90,200,255)); setHint(moss.name + ' collected dew'); safePlay(s_dew_collect, 0.9); updateHUD(); }
  if(p===moss && p.x===switchT.x && p.y===switchT.y && !switchT.active) setHint(moss.name + ': press M to activate T');
  if(p===mimosa && p.x===switchL.x && p.y===switchL.y && !switchL.active) setHint(mimosa.name + ': press SPACE to fold on L');

  if(p===moss && c && c.type===TILE.SUN){
    dangerState.active=true; dangerState.player='moss'; dangerState.x=p.x; dangerState.y=p.y; dangerState.expiresAt = millis() + dangerState.duration;
    setHint('Danger! ' + moss.name + ' in SUN — ' + mimosa.name + ' fold on same tile!');
    if(gameState === 'playing') playDangerSound();
  }
  if(p===mimosa && c && c.type===TILE.DRY && !isMoist(p.x,p.y)){
    dangerState.active=true; dangerState.player='mimosa'; dangerState.x=p.x; dangerState.y=p.y; dangerState.expiresAt = millis() + dangerState.duration;
    setHint('Danger! ' + mimosa.name + ' on DRY — ' + moss.name + ' press M on same tile!');
    if(gameState === 'playing') playDangerSound();
  }

  if(p===mimosa && grid[p.y][p.x].type===TILE.GOAL_A){ safePlay(s_reach_gate,0.9); const ok = checkTasksBeforeFinish(); if(!ok){ showGoalPopup(); p.y = Math.max(0,p.y-1); } }
  if(p===moss && grid[p.y][p.x].type===TILE.GOAL_B){ safePlay(s_reach_gate,0.9); const ok = checkTasksBeforeFinish(); if(!ok){ showGoalPopup(); p.y = Math.max(0,p.y-1); } }

  clearDangerIfRescued();
}
function performFold(){
  const c = grid[mimosa.y][mimosa.x];
  // allow fold on SUN and GOAL tiles as well as others
  if(c){
    c.type = TILE.SHADE;
    c.shadeUntil = millis()+3500;
    mimosa.shadeSet.add(mimosa.x + ',' + mimosa.y);
  }
  setHint(mimosa.name + ' folded'); safePlay(s_shade, 0.9);
  if(mimosa.x===switchL.x && mimosa.y===switchL.y && !switchL.active){ switchL.active=true; openGateB(); safePlay(s_unlock, 0.9); showPopupInfo('Gate ' + gateB.name + ' unlocked by ' + mimosa.name); }
  clearDangerIfRescued();
}
function useMoisture(){
  const c = grid[moss.y][moss.x];
  if(moss.moisture<=0){ setHint('No moisture'); return; }
  if(moss.x===switchT.x && moss.y===switchT.y && !switchT.active){ switchT.active=true; moss.moisture=Math.max(0,moss.moisture-1); openGateA(); safePlay(s_unlock, 0.9); showPopupInfo('Gate ' + gateA.name + ' unlocked by ' + moss.name); clearDangerIfRescued(); return; }
  if(c && c.type===TILE.DRY){ c.type=TILE.MOIST; moss.moisture=Math.max(0,moss.moisture-1); spawnParticle(moss.x*TILESIZE + TILESIZE*0.5, moss.y*TILESIZE + TILESIZE*0.3, color(80,220,190)); setHint('Tile moistened'); safePlay(s_moisten, 0.9); clearDangerIfRescued(); updateHUD(); return; }
  setHint('No action here');
}
function clearDangerIfRescued(){
  if(!dangerState.active) return;
  if(dangerState.player === 'moss'){
    if(mimosa.x === dangerState.x && mimosa.y === dangerState.y){
      if(grid[mimosa.y][mimosa.x].type === TILE.SHADE){
        dangerState.active=false; setHint('Rescued! ' + mimosa.name + ' saved ' + moss.name); stopDangerSound(); return;
      }
    }
    if(moss.x !== dangerState.x || moss.y !== dangerState.y){
      dangerState.active=false; setHint(moss.name + ' moved to safety'); stopDangerSound(); return;
    }
  } else {
    if(moss.x === dangerState.x && moss.y === dangerState.y){
      if(grid[moss.y][moss.x].type === TILE.MOIST || grid[moss.y][moss.x].type === TILE.SHADE){
        dangerState.active=false; setHint('Rescued! ' + moss.name + ' saved ' + mimosa.name); stopDangerSound(); return;
      }
    }
    if(mimosa.x !== dangerState.x || mimosa.y !== dangerState.y){
      dangerState.active=false; setHint(mimosa.name + ' moved to safety'); stopDangerSound(); return;
    }
  }
}

/* ---------- audio helpers used above ---------- */
function playMenuMusic(){ if(s_bg_menu) startBG(s_bg_menu,{volume:0.35}); }
function stopMenuMusic(){ stopBG(s_bg_menu); }
function playDangerSound(){ if(!s_danger) return; try{ if(typeof s_danger.loop === 'function'){ s_danger.loop(); s_danger.setVolume(0.75); } else safePlay(s_danger,0.9);}catch(e){} }
function stopDangerSound(){ if(!s_danger) return; try{ if(typeof s_danger.setVolume === 'function'){ s_danger.setVolume(0,0.25); setTimeout(()=>{ if(typeof s_danger.stop==='function') s_danger.stop(); },280); } else if(typeof s_danger.stop==='function') s_danger.stop(); }catch(e){} }

/* ---------- gates open / finish checks ---------- */
function openGateA(){ gateA.open=true; if(inBounds(gateA.x,gateA.y)) grid[gateA.y][gateA.x].type = TILE.ROCK; safePlay(s_unlock, 0.9); }
function openGateB(){ gateB.open=true; if(inBounds(gateB.x,gateB.y)) grid[gateB.y][gateB.x].type = TILE.ROCK; safePlay(s_unlock, 0.9); }
function checkTasksBeforeFinish(){ const mimOK = mimosa.shadeSet.size >= REQ_SHADES; const mossOK = dewRemaining === 0; if(!mimOK || !mossOK || !gateA.open || !gateB.open) return false; return true; }

/* ---------- popups / HUD / dew spawn / particles / helpers ---------- */
function showGoalPopup(){ let body=''; const mimOK = mimosa.shadeSet.size >= REQ_SHADES; const mossOK = dewRemaining === 0; if(!mimOK) body += '• ' + mimosa.name + ' must create ' + REQ_SHADES + ' shades.\n'; if(!mossOK) body += '• ' + moss.name + ' must collect all dew drops.\n'; if(!gateA.open) body += '• Gate ' + gateA.name + ' remains closed.\n'; if(!gateB.open) body += '• Gate ' + gateB.name + ' remains closed.\n'; setText('popup-goal-title','You cannot finish yet'); setText('popup-goal-body', body.trim()); const el = $('popup-goal'); if(el) el.style.display = 'flex'; }
function showPopupInfo(msg){ setText('popup-info-body', msg); const el = $('popup-info'); if(el) el.style.display='flex'; }
function showEnd(title, body){ setText('end-title', title); setText('end-body', body); const el = $('popup-end'); if(el) el.style.display='flex'; stopDewSpawner(); stopDangerSound(); if((/victory|win|congr/i).test(title) && s_finish) safePlay(s_finish,1.0); gameState='menu'; timerRunning=false; }
function drawDangerBar(){ const remaining = Math.max(0, dangerState.expiresAt - millis()), pct = remaining / dangerState.duration; push(); const w=520; translate((width-w)/2,18); noStroke(); fill(10,20,12,200); rect(0,0,w,62,10); fill(255); textSize(14); textAlign(LEFT,TOP); text((dangerState.player==='moss'?moss.name:mimosa.name)+' in danger!',12,8); textSize(12); textAlign(LEFT,TOP); text((dangerState.player==='moss')? (mimosa.name + ' fold on same tile!') : (moss.name + ' press M on same tile!'),12,28); stroke(60); noFill(); rect(12,44,w-24,12,6); noStroke(); fill(240,110,110); rect(12,44,(w-24)*pct,12,6); pop(); if(remaining<=0){ dangerState.active=false; stopDewSpawner(); stopDangerSound(); showEnd('Lost', (dangerState.player==='moss'? moss.name : mimosa.name) + ' was lost.'); } }
function checkWin(){ const mimOnA = grid[mimosa.y][mimosa.x].type === TILE.GOAL_A; const mossOnB = grid[moss.y][moss.x].type === TILE.GOAL_B; const mimTask = mimosa.shadeSet.size >= REQ_SHADES; const mossTask = dewRemaining === 0; if(mimOnA && mossOnB && mimTask && mossTask && gateA.open && gateB.open && !dangerState.active){ stopDewSpawner(); stopDangerSound(); if(s_finish) safePlay(s_finish,1.0); showEnd('Victory','Great teamwork — you cleared the level!'); } }

function spawnParticle(x,y,col){ particles.push({x,y,vx:random(-0.6,0.6),vy:random(-1.6,-0.2),life:random(400,900),col}); }
function updateParticles(){ for(let i=particles.length-1;i>=0;i--){ let p=particles[i]; p.life -= deltaTime; p.x += p.vx; p.y += p.vy; noStroke(); fill(p.col); ellipse(p.x,p.y,4); if(p.life<=0) particles.splice(i,1); } }
function inBounds(x,y){ return x>=0 && x<WIDTH && y>=0 && y<HEIGHT; }
function isMoist(x,y){ return grid[y][x].type === TILE.MOIST || grid[y][x].type === TILE.SHADE; }
function formatTime(ms){ let s = Math.max(0, Math.ceil(ms/1000)); let mm = Math.floor(s/60), ss = s%60; return (mm<10?'0'+mm:mm)+':'+(ss<10?'0'+ss:ss); }
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } }
function setHint(txt, tm=3500){ const el = $('hint'); if(!el) return; el.innerText = txt; if(window._hintTO) clearTimeout(window._hintTO); window._hintTO = setTimeout(()=>{ if(el.innerText === txt) el.innerText = "Hint: Talk to your teammate — open each other's gates."; }, tm); }

function triggerDewAt(x,y){ if(!grid[y] || !grid[y][x]) return; grid[y][x].dew = true; grid[y][x].dewPulse = millis() + 2200; dewRemaining++; spawnParticle(x*TILESIZE + TILESIZE*0.78, y*TILESIZE + TILESIZE*0.22, color(130,220,255)); for(let i=0;i<6;i++) spawnParticle(x*TILESIZE + TILESIZE*0.78 + random(-6,6), y*TILESIZE + TILESIZE*0.22 + random(-6,6), color(180,240,255)); safePlay(s_dew_spawn,0.9); updateHUD(); showPopupInfo('A dew drop formed nearby — collect it!'); }
function startDewSpawner(){ stopDewSpawner(); dewSpawnIntervalId = setInterval(()=>{ if(gameState!=='playing') return; if(dewRemaining >= currentLevelInitialDew) return; spawnOneDew(); },30000); }
function stopDewSpawner(){ if(dewSpawnIntervalId){ clearInterval(dewSpawnIntervalId); dewSpawnIntervalId=null; } }
function spawnOneDew(){ let pool=[]; for(let y=1;y<HEIGHT-1;y++) for(let x=1;x<WIDTH-1;x++) if(grid[y][x].type===TILE.ROCK && !grid[y][x].dew && !grid[y][x].bounce && !grid[y][x].spike) pool.push({x,y}); if(pool.length===0) return; shuffleArray(pool); const p = pool.pop(); triggerDewAt(p.x, p.y); }

function startGame(){ gameState='playing'; timerRunning=true; timeLeft=120000; setHint('Game started — cooperate!'); startDewSpawner(); const st = $('stage'); if(st) st.classList.remove('blurred'); stopMenuMusic(); stopBG(s_bg_menu); startBG(s_bg_game, {volume:0.5}); }
function togglePause(){ if(gameState==='playing'){ gameState='paused'; timerRunning=false; const b = $('btn-pause'); if(b) b.innerText='Resume'; stopDewSpawner(); stopBG(s_bg_game); stopDangerSound(); } else { gameState='playing'; timerRunning=true; const b = $('btn-pause'); if(b) b.innerText='Pause'; startDewSpawner(); startBG(s_bg_game,{volume:0.5}); if(dangerState.active) playDangerSound(); } }

function updateHUD(){ setText('dew-count', dewRemaining); setText('shade-count', `${mimosa.shadeSet.size} / ${REQ_SHADES}`); setText('hud-timer', formatTime(timeLeft)); setText('label-mimosa', mimosa.name); setText('label-moss', moss.name); setText('role-mimosa-name', mimosa.name); setText('role-moss-name', moss.name); }
function applyGateNames(){ function makeLabel(name){ if(!name) return 'G'; const parts = name.trim().split(/\s+/); if(parts.length>=2){ const a=parts[0].slice(0,3); const b=parts[1].slice(0,3); return (a+b).replace(/[^A-Za-z0-9]/g,''); } return parts[0].slice(0,4); } gateA.name = makeLabel(mimosa.name); gateB.name = makeLabel(moss.name); gateA.owner = mimosa.name; gateB.owner = moss.name; setText('gateA-name', gateA.name); setText('gateB-name', gateB.name); }

function debugDump(){ console.log('p5 present:', !!window.p5); console.log('canvas count:', $('canvas-container') ? $('canvas-container').querySelectorAll('canvas').length : 0); console.log('gameState:', gameState); }

/* ---------- SAFE GRID PROXY HELPER ---------- */
function makeSafeGrid(realGrid){
  const defaultCell = () => ({ type: 'R', dew:false, dewPulse:0, bounce:false, spike:false, shadeUntil:0 });
  const rowProxyHandler = {
    get(row, prop){
      const idx = Number(prop);
      if (!Number.isNaN(idx)) {
        if (row[idx] === undefined) row[idx] = defaultCell();
        return row[idx];
      }
      return row[prop];
    }
  };
  const gridProxyHandler = {
    get(gridObj, prop){
      const idx = Number(prop);
      if (!Number.isNaN(idx)) {
        if (gridObj[idx] === undefined) gridObj[idx] = [];
        return new Proxy(gridObj[idx], rowProxyHandler);
      }
      return gridObj[prop];
    },
    set(gridObj, prop, value){
      gridObj[prop] = value;
      return true;
    }
  };
  return new Proxy(realGrid, gridProxyHandler);
}
console.log('Updated script.js loaded. ASSETS_BASE=', ASSETS_BASE);
