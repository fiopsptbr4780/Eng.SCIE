/*
 * Jogo do Bombeiro — versão com ÁUDIO, PODERES e FASES
 * Controles: WASD/Setas mover | Rato apontar | Botão esq. água | R reiniciar | M mudo
 *
 * Novidades:
 *  - Música ambiente + SFX procedurais (Web Audio, sem ficheiros).
 *  - Poderes desbloqueados ao avançar de fase: Carro, Ajudante, Hidrante extra, Jato Turbo.
 *  - Sistema de fases com objetivo (apagar N fogos) e escolha de upgrade.
 *  - Dificuldade e paleta crescentes por fase.
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/* ---------- Mundo lógico fixo ---------- */
const VIEW_W = 1280;
const VIEW_H = 720;
let scale = 1, offsetX = 0, offsetY = 0, dpr = 1;

function resize() {
    dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth, cssH = window.innerHeight;
    scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
    offsetX = (cssW - VIEW_W * scale) / 2;
    offsetY = (cssH - VIEW_H * scale) / 2;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
}
window.addEventListener('resize', resize);
resize();

function toWorld(cx, cy) { return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale }; }

/* ================= AUDIO PROCEDURAL ================= */
const Sound = (() => {
    let ac = null, master = null, musicGain = null, muted = false, started = false;
    let musicTimer = null, step = 0;

    function init() {
        if (ac) return;
        try {
            ac = new (window.AudioContext || window.webkitAudioContext)();
            master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
            musicGain = ac.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
        } catch (e) { console.warn('Áudio indisponível', e); }
    }
    function resume() { init(); if (ac && ac.state === 'suspended') ac.resume(); }

    // nota curta com envelope ADSR simples
    function tone(freq, dur, type = 'square', gain = 0.2, dest = master, slideTo = null) {
        if (!ac || muted) return;
        const t = ac.currentTime;
        const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, gain = 0.15) {
        if (!ac || muted) return;
        const t = ac.currentTime;
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ac.createBufferSource(); src.buffer = buf;
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
        const g = ac.createGain(); g.gain.value = gain;
        src.connect(f); f.connect(g); g.connect(master); src.start(t);
    }

    // sequencia melódica simples (loop)
    const melody = [392, 440, 523, 440, 392, 330, 392, 0];
    function startMusic() {
        if (!ac || musicTimer) return;
        musicTimer = setInterval(() => {
            if (muted) return;
            const f = melody[step % melody.length];
            if (f) tone(f, 0.28, 'triangle', 0.25, musicGain);
            if (step % 4 === 0) tone(f ? f / 2 : 196, 0.5, 'sine', 0.2, musicGain); // baixo
            step++;
        }, 260);
    }
    function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

    return {
        unlock() { resume(); if (!started) { started = true; startMusic(); } },
        shoot() { tone(rand(520, 620), 0.05, 'sawtooth', 0.05, master, 300); },
        extinguish() { noise(0.25, 0.18); tone(180, 0.3, 'sine', 0.12, master, 60); },
        powerup() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.22), i * 90)); },
        levelup() { [392, 523, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.25), i * 120)); },
        over() { [440, 330, 220, 165].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.2), i * 160)); },
        toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.9; return muted; }
    };
})();

/* ---------- Estado global ---------- */
let mouseX = VIEW_W / 2, mouseY = VIEW_H / 2;
let isWatering = false;
let lastTime = performance.now();
let time = 0, score = 0, waterLevel = 100;
let gameOver = false, gameStarted = false, shake = 0;
const keys = {};

/* ---------- Fases / objetivos ---------- */
let stage = 1;
let firesExtinguished = 0;      // fogos apagados nesta fase
let goal = 8;                   // objetivo da fase
let fireSpawnTimer = 0;

/* ---------- Poderes (upgrades) ---------- */
const powers = { car: false, helper: false, hydrant: false, turbo: false };

/* ---------- Constantes base ---------- */
const WATER_SPEED = 9;
const WATER_GRAVITY = 0.12;
const BASE_RANGE = 350;
const MAX_ACTIVE_FIRES = 14;
const FIRE_SPAWN_BASE = 3400;

/* Valores derivados dos poderes */
function waterRange() { return BASE_RANGE + (powers.turbo ? 160 : 0); }
function waterDamage() { return powers.turbo ? 10 : 6; }
function maxWater() { return powers.car ? 160 : 100; }
function regenRate() { return powers.car ? 12 : 6; }

/* ---------- Jogador ---------- */
const player = { x: VIEW_W / 2, y: VIEW_H / 2, w: 64, h: 96, speed: 260, angle: 0, muzzle: { x: 0, y: 0 } };

/* ---------- Ajudante ---------- */
const helper = { x: 0, y: 0, angle: 0, cooldown: 0, active: false };

/* ---------- Mapas ---------- */
const streets = [
    { x: 0, y: 300, w: VIEW_W, h: 120 },
    { x: 560, y: 0, w: 120, h: VIEW_H }
];
const sidewalks = [
    { x: 0, y: 270, w: VIEW_W, h: 30 }, { x: 0, y: 420, w: VIEW_W, h: 30 },
    { x: 530, y: 0, w: 30, h: VIEW_H }, { x: 680, y: 0, w: 30, h: VIEW_H }
];
const buildings = [
    { x: 60, y: 60, w: 180, h: 150, roof: '#8a3b3b' }, { x: 300, y: 60, w: 180, h: 150, roof: '#3b5a8a' },
    { x: 760, y: 60, w: 200, h: 150, roof: '#6a4a8a' }, { x: 1020, y: 60, w: 200, h: 150, roof: '#8a6a3b' },
    { x: 60, y: 480, w: 180, h: 180, roof: '#3b7a5a' }, { x: 300, y: 480, w: 180, h: 180, roof: '#8a3b5a' },
    { x: 760, y: 480, w: 200, h: 180, roof: '#3b5a8a' }, { x: 1020, y: 480, w: 200, h: 180, roof: '#6a4a8a' }
];
const trees = [
    { x: 260, y: 250, r: 26 }, { x: 520, y: 250, r: 22 }, { x: 720, y: 250, r: 26 }, { x: 980, y: 250, r: 22 },
    { x: 260, y: 470, r: 22 }, { x: 520, y: 470, r: 26 }, { x: 720, y: 470, r: 22 }, { x: 980, y: 470, r: 26 }
];
const hydrants = [{ x: 500, y: 450, r: 20 }]; // pode crescer com poder "hidrante extra"

/* Paletas de céu por fase */
const skyPalettes = [
    ['#3f6f4a', '#2f5638'], ['#4a6f3f', '#38562f'], ['#3f5a6f', '#2f4656'],
    ['#6f5a3f', '#56462f'], ['#5a3f6f', '#462f56'], ['#3f6f6a', '#2f5650']
];

/* ---------- Coleções ---------- */
const fires = [], waterParticles = [], smoke = [], sparks = [];

/* ---------- Utilidades ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const pointInRect = (px, py, r) => px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h;
const inflate = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

/* ---------- Fogos ---------- */
function spawnFire(x, y) {
    if (fires.length >= MAX_ACTIVE_FIRES) return;
    if (x === undefined) {
        let tries = 0;
        do { x = rand(40, VIEW_W - 40); y = rand(40, VIEW_H - 40); tries++; }
        while (tries < 30 && buildings.some(b => pointInRect(x, y, b)));
    }
    fires.push({ x, y, radius: rand(26, 40), life: 100, intensity: 100 + stage * 8, flicker: rand(0, Math.PI * 2) });
}

function updateFires(dt) {
    for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.flicker += dt * 8;
        if (Math.random() < 0.35) smoke.push({ x: f.x + rand(-f.radius, f.radius) * 0.4, y: f.y - f.radius * 0.6, vx: rand(-8, 8), vy: rand(-30, -50), life: 1.6, max: 1.6, size: rand(10, 22) });
        if (f.life <= 0) {
            for (let k = 0; k < 12; k++) sparks.push({ x: f.x, y: f.y, vx: rand(-60, 60), vy: rand(-90, -20), life: rand(0.4, 0.9), max: 0.9 });
            fires.splice(i, 1);
        }
    }
}

function extinguishFire(idx) {
    const f = fires[idx];
    fires.splice(idx, 1);
    firesExtinguished++;
    score += 10 * stage;
    shake = Math.min(shake + 4, 12);
    Sound.extinguish();
    if (firesExtinguished >= goal) openUpgradeScreen();
}

/* ---------- Água ---------- */
function makeParticle(fromX, fromY, angle) {
    const spread = rand(-0.06, 0.06), ang = angle + spread;
    return { x: fromX, y: fromY, vx: Math.cos(ang) * WATER_SPEED, vy: Math.sin(ang) * WATER_SPEED, traveled: 0, life: 1.4 };
}
function shootWater() { if (waterLevel <= 0) return; waterParticles.push(makeParticle(player.muzzle.x, player.muzzle.y, player.angle)); Sound.shoot(); }

function updateWater(dt) {
    const range = waterRange(), dmg = waterDamage();
    for (let i = waterParticles.length - 1; i >= 0; i--) {
        const p = waterParticles[i];
        p.vy += WATER_GRAVITY;
        const step = Math.hypot(p.vx, p.vy);
        p.x += p.vx; p.y += p.vy; p.traveled += step; p.life -= dt;
        if (p.traveled > range || p.life <= 0) { splash(p.x, p.y); waterParticles.splice(i, 1); continue; }
        for (let j = fires.length - 1; j >= 0; j--) {
            const f = fires[j];
            if (dist(p.x, p.y, f.x, f.y) < f.radius + 6) {
                f.intensity -= dmg; f.life -= 4; splash(p.x, p.y); waterParticles.splice(i, 1);
                if (f.intensity <= 0) extinguishFire(j);
                break;
            }
        }
    }
}
function splash(x, y) { for (let k = 0; k < 3; k++) sparks.push({ x, y, vx: rand(-40, 40), vy: rand(-50, -10), life: rand(0.2, 0.5), max: 0.5, water: true }); }

function updateSmoke(dt) { for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.size += 12 * dt; s.life -= dt; if (s.life <= 0) smoke.splice(i, 1); } }
function updateSparks(dt) { for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.vy += 60 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) sparks.splice(i, 1); } }

/* ---------- Movimento ---------- */
function movePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w']) dy -= 1;
    if (keys['ArrowDown'] || keys['s']) dy += 1;
    if (keys['ArrowLeft'] || keys['a']) dx -= 1;
    if (keys['ArrowRight'] || keys['d']) dx += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    const nx = clamp(player.x + dx * player.speed * dt, player.w / 2, VIEW_W - player.w / 2);
    const ny = clamp(player.y + dy * player.speed * dt, player.h / 2, VIEW_H - player.h / 2);
    if (!buildings.some(b => pointInRect(nx, player.y, inflate(b, 18)))) player.x = nx;
    if (!buildings.some(b => pointInRect(player.x, ny, inflate(b, 18)))) player.y = ny;
    player.angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    player.muzzle.x = player.x + Math.cos(player.angle) * 46;
    player.muzzle.y = player.y + Math.sin(player.angle) * 46;
    // recarrega perto de QUALQUER hidrante
    if (hydrants.some(h => dist(player.x, player.y, h.x, h.y) < h.r + 30)) waterLevel = clamp(waterLevel + 40 * dt, 0, maxWater());
}

/* ---------- Ajudante (power) ---------- */
function updateHelper(dt) {
    if (!helper.active) return;
    // segue o jogador com offset
    const tx = player.x - 70, ty = player.y + 40;
    helper.x += (tx - helper.x) * Math.min(1, dt * 3);
    helper.y += (ty - helper.y) * Math.min(1, dt * 3);
    helper.cooldown -= dt;
    // aponta para o fogo mais próximo dentro do alcance
    let target = null, best = Infinity;
    for (const f of fires) { const d = dist(helper.x, helper.y, f.x, f.y); if (d < best) { best = d; target = f; } }
    if (target && best < waterRange()) {
        helper.angle = Math.atan2(target.y - helper.y, target.x - helper.x);
        if (helper.cooldown <= 0 && waterLevel > 5) {
            waterLevel = clamp(waterLevel - 3, 0, maxWater());
            for (let k = 0; k < 2; k++) waterParticles.push(makeParticle(helper.x + Math.cos(helper.angle) * 40, helper.y + Math.sin(helper.angle) * 40, helper.angle));
            helper.cooldown = 0.18;
        }
    }
}

/* ---------- Dificuldade / spawns ---------- */
function updateDifficulty(dt) {
    fireSpawnTimer += dt * 1000;
    const interval = Math.max(900, FIRE_SPAWN_BASE - stage * 350);
    if (fireSpawnTimer >= interval && fires.length < MAX_ACTIVE_FIRES) { spawnFire(); fireSpawnTimer = 0; }
}

/* ---------- Ecrã de upgrade (pausa) ---------- */
let upgradeOpen = false;
const upgradeOptions = [
    { key: 'car', icon: '🚒', title: 'Carro de Bombeiros', desc: 'Recarga mais rápida\n+60 de água máxima' },
    { key: 'helper', icon: '👨‍🚒', title: 'Chamar Ajudante', desc: 'Um colega dispara\nsozinho nos fogos' },
    { key: 'hydrant', icon: '💧', title: 'Construir Hidrante', desc: 'Novo ponto de\nrecarga no mapa' },
    { key: 'turbo', icon: '🔥', title: 'Jato Turbo', desc: '+alcance e +dano\nda mangueira' }
];
const upgradeButtons = [];

function openUpgradeScreen() {
    upgradeOpen = true;
    buildUpgradeButtons();
    Sound.levelup();
}
function buildUpgradeButtons() {
    upgradeButtons.length = 0;
    const cols = 2, gap = 24, bw = 300, bh = 150;
    const totalW = cols * bw + (cols - 1) * gap;
    const startX = (VIEW_W - totalW) / 2, startY = 210;
    upgradeOptions.forEach((opt, idx) => {
        const col = idx % cols, row = Math.floor(idx / cols);
        upgradeButtons.push({ opt, x: startX + col * (bw + gap), y: startY + row * (bh + gap), w: bw, h: bh });
    });
}
function pickUpgrade(opt) {
    if (opt.key === 'hydrant') {
        // coloca novo hidrante num passeio livre
        hydrants.push({ x: rand(120, VIEW_W - 120), y: rand(120, VIEW_H - 120), r: 20 });
    } else {
        powers[opt.key] = true;
        if (opt.key === 'helper') { helper.active = true; helper.x = player.x - 70; helper.y = player.y + 40; }
    }
    Sound.powerup();
    nextStage();
}
function nextStage() {
    stage++;
    goal = 8 + stage * 2;          // objetivo cresce
    firesExtinguished = 0;
    waterLevel = maxWater();       // reabastece entre fases
    upgradeOpen = false;
    fireSpawnTimer = 0;
}

/* ---------- Update principal ---------- */
function update(dt) {
    if (gameOver || !gameStarted || upgradeOpen) return;
    time += dt;
    movePlayer(dt);
    updateHelper(dt);
    if (isWatering && waterLevel > 0) {
        waterLevel = clamp(waterLevel - 14 * dt, 0, maxWater());
        for (let k = 0; k < 3; k++) shootWater();
    } else {
        waterLevel = clamp(waterLevel + regenRate() * dt, 0, maxWater());
    }
    updateDifficulty(dt);
    updateFires(dt);
    updateWater(dt);
    updateSmoke(dt);
    updateSparks(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
}

/* ================= RENDER ================= */
function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY); ctx.scale(scale, scale);
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    drawBackground(); drawMap(); drawHydrants(); drawTrees(); drawBuildings();
    drawFires(); drawSmoke(); drawWater(); drawSparks();
    drawPlayer(); if (helper.active) drawHelper();
    ctx.restore();

    drawHUD();
    if (!gameStarted) drawStartScreen();
    if (upgradeOpen) drawUpgradeScreen();
    if (gameOver) drawGameOver();
}

function drawBackground() {
    const pal = skyPalettes[(stage - 1) % skyPalettes.length];
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
function drawMap() {
    ctx.fillStyle = '#c9c2b6'; sidewalks.forEach(s => ctx.fillRect(s.x, s.y, s.w, s.h));
    ctx.fillStyle = '#3a3f47'; streets.forEach(s => ctx.fillRect(s.x, s.y, s.w, s.h));
    ctx.strokeStyle = '#f2d24b'; ctx.lineWidth = 5; ctx.setLineDash([26, 22]);
    ctx.beginPath(); ctx.moveTo(0, 360); ctx.lineTo(VIEW_W, 360); ctx.moveTo(620, 0); ctx.lineTo(620, VIEW_H); ctx.stroke();
    ctx.setLineDash([]);
}
function drawBuildings() {
    buildings.forEach(b => {
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
        ctx.fillStyle = '#d8cfc0'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = b.roof; ctx.fillRect(b.x, b.y, b.w, 26);
        ctx.fillStyle = '#7fa8c9';
        for (let wy = b.y + 44; wy < b.y + b.h - 14; wy += 30) for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 30) ctx.fillRect(wx, wy, 14, 16);
    });
}
function drawTrees() {
    trees.forEach(t => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(t.x + 4, t.y + 6, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2f7d3f'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fa055'; ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    });
}
function drawHydrants() {
    hydrants.forEach((h, i) => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(h.x + 3, h.y + 5, h.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c62828'; ctx.fillRect(h.x - 10, h.y - 14, 20, 28);
        ctx.beginPath(); ctx.arc(h.x, h.y - 14, 10, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#8e1b1b'; ctx.fillRect(h.x - 16, h.y - 4, 32, 8);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Segoe UI, Arial'; ctx.textAlign = 'center';
        ctx.fillText(i === 0 ? 'HIDRANTE' : 'HIDRANTE +' , h.x, h.y + 34);
    });
}
function drawFires() {
    fires.forEach(f => {
        const flick = Math.sin(f.flicker) * 0.15 + 1;
        const glow = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.radius * 2.2);
        glow.addColorStop(0, 'rgba(255,180,60,0.55)'); glow.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5a1f'; ctx.beginPath(); ctx.ellipse(f.x, f.y + f.radius * 0.4, f.radius * 0.9, f.radius * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        const flames = 5;
        for (let i = 0; i < flames; i++) {
            const fx = f.x + (i - flames / 2) * (f.radius * 0.35);
            const fh = f.radius * (1.1 + Math.sin(f.flicker + i) * 0.4) * flick;
            const grad = ctx.createLinearGradient(fx, f.y, fx, f.y - fh);
            grad.addColorStop(0, '#ff3d00'); grad.addColorStop(0.5, '#ff9800'); grad.addColorStop(1, '#ffe066');
            ctx.fillStyle = grad; ctx.beginPath();
            ctx.moveTo(fx - f.radius * 0.22, f.y + f.radius * 0.3);
            ctx.quadraticCurveTo(fx - f.radius * 0.1, f.y - fh * 0.6, fx, f.y - fh);
            ctx.quadraticCurveTo(fx + f.radius * 0.1, f.y - fh * 0.6, fx + f.radius * 0.22, f.y + f.radius * 0.3);
            ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(f.x, f.y + f.radius * 0.2, f.radius * 0.25, 0, Math.PI * 2); ctx.fill();
    });
}
function drawSmoke() { smoke.forEach(s => { const a = clamp(s.life / s.max, 0, 1) * 0.5; ctx.fillStyle = `rgba(70,70,70,${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill(); }); }
function drawWater() { waterParticles.forEach(p => { ctx.fillStyle = 'rgba(80,170,255,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(200,235,255,0.9)'; ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1, 2, 0, Math.PI * 2); ctx.fill(); }); }
function drawSparks() { sparks.forEach(s => { const a = clamp(s.life / s.max, 0, 1); ctx.fillStyle = s.water ? `rgba(150,210,255,${a})` : `rgba(255,220,120,${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.water ? 3 : 2.5, 0, Math.PI * 2); ctx.fill(); }); }

function drawPlayer() {
    const { x, y, angle } = player;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 40, 34, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.strokeStyle = '#123a6b'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(40, 0); ctx.stroke();
    ctx.fillStyle = '#0d2a4d'; ctx.fillRect(38, -8, 14, 16);
    ctx.fillStyle = powers.turbo ? '#ff9800' : '#ffd257'; ctx.fillRect(50, -5, 6, 10);
    ctx.fillStyle = '#e8541f'; roundRect(-22, -26, 44, 52, 12); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(-22, -4, 44, 8);
    ctx.fillStyle = '#cfd8dc'; ctx.fillRect(-22, 12, 44, 4);
    ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(0, -6, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a1515'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -6, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#a01f1f'; ctx.beginPath(); ctx.arc(0, -6, 16, -0.6, 0.6); ctx.lineTo(18, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(8, -6, 8, 12);
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,200,255,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, waterRange(), angle - 0.5, angle + 0.5); ctx.stroke();
}
function drawHelper() {
    const { x, y, angle } = helper;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 30, 24, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.strokeStyle = '#123a6b'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(26, 0); ctx.stroke();
    ctx.fillStyle = '#1f6fb2'; roundRect(-16, -20, 32, 40, 9); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(-16, -2, 32, 6);
    ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(0, -4, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(6, -4, 6, 9);
    ctx.restore();
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------- HUD ---------- */
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(10,16,32,0.72)'; roundRect(x, y, w, h, 14); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke(); }
function drawHUD() {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    panel(18, 18, 340, 118);
    ctx.fillStyle = '#eaf2ff'; ctx.font = 'bold 20px Segoe UI, Arial';
    ctx.fillText(`⏱ ${Math.floor(time)}s`, 34, 50);
    ctx.fillStyle = '#ffd257'; ctx.fillText(`★ ${score}`, 170, 50);
    ctx.fillStyle = '#eaf2ff'; ctx.font = '15px Segoe UI, Arial';
    ctx.fillText(`FASE ${stage}`, 34, 78);
    ctx.fillText(`Objetivo: ${firesExtinguished}/${goal}`, 130, 78);
    ctx.fillText(`Fogos ativos: ${fires.length}/${MAX_ACTIVE_FIRES}`, 34, 102);

    // barra de água
    panel(18, VIEW_H - 60, 320, 42);
    ctx.fillStyle = '#eaf2ff'; ctx.font = 'bold 14px Segoe UI, Arial'; ctx.fillText('ÁGUA', 34, VIEW_H - 34);
    const bw = 240, bx = 96, by = VIEW_H - 44;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(bx, by, bw, 16, 8); ctx.fill();
    const wg = ctx.createLinearGradient(bx, 0, bx + bw, 0); wg.addColorStop(0, '#29b6f6'); wg.addColorStop(1, '#4dd0e1');
    ctx.fillStyle = wg; roundRect(bx, by, bw * (waterLevel / maxWater()), 16, 8); ctx.fill();
    ctx.fillStyle = '#eaf2ff'; ctx.font = '12px Segoe UI, Arial'; ctx.fillText(`${Math.floor(waterLevel)}/${maxWater()}`, bx + bw + 8, VIEW_H - 32);

    // ícones de poderes ativos
    const owned = ['car', 'helper', 'hydrant', 'turbo'].filter(k => powers[k] || (k === 'hydrant' && hydrants.length > 1));
    const icons = { car: '🚒', helper: '👨‍🚒', hydrant: '💧', turbo: '🔥' };
    ctx.font = '22px Segoe UI, Arial'; ctx.textAlign = 'left';
    owned.forEach((k, i) => ctx.fillText(icons[k], VIEW_W - 40 - i * 34, 44));

    // progresso do objetivo (topo central)
    const prog = clamp(firesExtinguished / goal, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(VIEW_W / 2 - 160, 26, 320, 8, 4); ctx.fill();
    ctx.fillStyle = '#ffd257'; roundRect(VIEW_W / 2 - 160, 26, 320 * prog, 8, 4); ctx.fill();
}

function drawStartScreen() {
    ctx.fillStyle = 'rgba(6,10,22,0.72)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd257'; ctx.font = 'bold 52px Segoe UI, Arial'; ctx.fillText('🚒 JOGO DO BOMBEIRO', VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.fillStyle = '#eaf2ff'; ctx.font = '22px Segoe UI, Arial'; ctx.fillText('Clique para começar · apague os incêndios e suba de fase!', VIEW_W / 2, VIEW_H / 2 + 20);
    ctx.font = '16px Segoe UI, Arial'; ctx.fillStyle = 'rgba(234,242,255,0.7)';
    ctx.fillText('Ao completar cada fase, escolha um PODER: carro, ajudante, hidrante extra ou jato turbo.', VIEW_W / 2, VIEW_H / 2 + 58);
}
function drawUpgradeScreen() {
    ctx.fillStyle = 'rgba(6,10,22,0.82)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd257'; ctx.font = 'bold 44px Segoe UI, Arial'; ctx.fillText(`FASE ${stage} CONCLUÍDA!`, VIEW_W / 2, 150);
    ctx.fillStyle = '#eaf2ff'; ctx.font = '20px Segoe UI, Arial'; ctx.fillText('Escolha um poder para a próxima fase:', VIEW_W / 2, 185);
    upgradeButtons.forEach(btn => {
        const o = btn.opt;
        const already = o.key !== 'hydrant' && powers[o.key];
        ctx.fillStyle = already ? 'rgba(40,50,70,0.6)' : 'rgba(20,32,58,0.9)';
        roundRect(btn.x, btn.y, btn.w, btn.h, 16); ctx.fill();
        ctx.strokeStyle = already ? 'rgba(255,255,255,0.08)' : 'rgba(255,210,87,0.6)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = '40px Segoe UI, Arial'; ctx.globalAlpha = already ? 0.4 : 1;
        ctx.fillText(o.icon, btn.x + btn.w / 2, btn.y + 56);
        ctx.font = 'bold 18px Segoe UI, Arial'; ctx.fillStyle = '#eaf2ff'; ctx.fillText(o.title, btn.x + btn.w / 2, btn.y + 90);
        ctx.font = '14px Segoe UI, Arial'; ctx.fillStyle = 'rgba(234,242,255,0.75)';
        o.desc.split('\n').forEach((line, li) => ctx.fillText(line, btn.x + btn.w / 2, btn.y + 112 + li * 18));
        if (already) { ctx.fillStyle = '#8ea0c0'; ctx.font = '13px Segoe UI, Arial'; ctx.fillText('(já adquirido)', btn.x + btn.w / 2, btn.y + btn.h - 10); }
        ctx.globalAlpha = 1;
    });
}
function drawGameOver() {
    ctx.fillStyle = 'rgba(6,10,22,0.8)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 56px Segoe UI, Arial'; ctx.fillText('INCÊNDIO FORA DE CONTROLE', VIEW_W / 2, VIEW_H / 2 - 30);
    ctx.fillStyle = '#eaf2ff'; ctx.font = '24px Segoe UI, Arial'; ctx.fillText(`Pontuação final: ${score}   ·   Fase alcançada: ${stage}`, VIEW_W / 2, VIEW_H / 2 + 20);
    ctx.fillStyle = '#ffd257'; ctx.font = '20px Segoe UI, Arial'; ctx.fillText('Pressione R para reiniciar', VIEW_W / 2, VIEW_H / 2 + 60);
}

/* ---------- Loop ---------- */
function loop(now) {
    let dt = (now - lastTime) / 1000; lastTime = now;
    dt = clamp(dt, 0, 0.05);
    update(dt); render();
    requestAnimationFrame(loop);
}

/* ---------- Input ---------- */
canvas.addEventListener('mousemove', e => { const w = toWorld(e.clientX, e.clientY); mouseX = w.x; mouseY = w.y; });
canvas.addEventListener('mousedown', e => {
    Sound.unlock();
    if (!gameStarted) { gameStarted = true; return; }
    if (upgradeOpen) {
        const w = toWorld(e.clientX, e.clientY);
        for (const btn of upgradeButtons) {
            if (btn.opt.key !== 'hydrant' && powers[btn.opt.key]) continue; // bloqueia repetidos
            if (pointInRect(w.x, w.y, btn)) { pickUpgrade(btn.opt); return; }
        }
        return;
    }
    isWatering = true;
});
window.addEventListener('mouseup', () => isWatering = false);
window.addEventListener('blur', () => isWatering = false);
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key.toLowerCase() === 'r') resetGame();
    if (e.key.toLowerCase() === 'm') toggleSound();
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key] = false);

/* Botão de som (DOM) */
const soundBtn = document.createElement('button');
soundBtn.id = 'soundBtn'; soundBtn.textContent = '🔊';
soundBtn.title = 'Ligar/Desligar som (M)';
document.body.appendChild(soundBtn);
function toggleSound() { const m = Sound.toggleMute(); soundBtn.textContent = m ? '🔇' : '🔊'; soundBtn.classList.toggle('muted', m); }
soundBtn.addEventListener('click', () => { Sound.unlock(); toggleSound(); });

/* ---------- Verifica fim de jogo ---------- */
setInterval(() => { if (gameStarted && !gameOver && !upgradeOpen && fires.length >= MAX_ACTIVE_FIRES) { gameOver = true; Sound.over(); } }, 250);

/* ---------- Reset ---------- */
function resetGame() {
    Object.keys(powers).forEach(k => powers[k] = false);
    hydrants.length = 1; hydrants[0] = { x: 500, y: 450, r: 20 };
    helper.active = false;
    player.x = VIEW_W / 2; player.y = VIEW_H / 2; player.angle = 0;
    score = 0; time = 0; stage = 1; goal = 8; firesExtinguished = 0;
    waterLevel = 100; fireSpawnTimer = 0; shake = 0;
    fires.length = 0; waterParticles.length = 0; smoke.length = 0; sparks.length = 0;
    gameOver = false; upgradeOpen = false;
    spawnFire(VIEW_W / 2 + 220, VIEW_H / 2 - 120);
    spawnFire(VIEW_W / 2 - 260, VIEW_H / 2 + 160);
    gameStarted = true;
}

resetGame();
requestAnimationFrame(loop);