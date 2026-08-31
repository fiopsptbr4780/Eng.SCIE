/*
 * Jogo do Bombeiro — versão corrigida e "premium"
 * Controles:
 *   WASD / Setas = mover | Rato = apontar | Botão esq. = água | R = reiniciar
 *
 * Correções principais:
 *  - Coordenadas internas num MUNDO LÓGICO FIXO (VIEW_W x VIEW_H) escalado ao viewport.
 *  - devicePixelRatio + resize corretos (nítido em qualquer ecrã).
 *  - Mapa top-down: ruas, edifícios, árvores, passeios e hidrante.
 *  - Bombeiro grande e identificável (capacete, casaco refletor, botas, bico).
 *  - >= 1 fogo inicial garantido + spawn controlado por dificuldade.
 *  - Jato limitado a ~350px (alcance real), com arco de gravidade.
 *  - Chamas animadas, fumo e partículas de água. Sem alert().
 *  - HUD clara: tempo, pontuação, nível, água (+ barra de progresso).
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/* ---------- Mundo lógico fixo (referência de todas as coordenadas) ---------- */
const VIEW_W = 1280;
const VIEW_H = 720;

/* Escala / offset calculados no resize */
let scale = 1, offsetX = 0, offsetY = 0;
let dpr = 1;

function resize() {
    dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;

    // Mantém proporção do mundo (letterbox) para coordenadas consistentes
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

/* Converte coordenadas de rato (client) -> coordenadas do mundo lógico */
function toWorld(clientX, clientY) {
    return {
        x: (clientX - offsetX) / scale,
        y: (clientY - offsetY) / scale
    };
}

/* ---------- Estado global ---------- */
let mouseX = VIEW_W / 2, mouseY = VIEW_H / 2;
let isWatering = false;
let lastTime = performance.now();
let time = 0;          // segundos decorridos
let score = 0;
let level = 1;
let waterLevel = 100;
let gameOver = false;
let gameStarted = false;
let shake = 0;         // efeito de impacto

const keys = {};

/* ---------- Constantes de jogabilidade ---------- */
const WATER_SPEED = 9;
const WATER_GRAVITY = 0.12;
const WATER_MAX_RANGE = 350;      // alcance máximo do jato (px lógicos)
const WATER_DRAIN_RATE = 14;      // %/s a disparar
const WATER_REGEN_RATE = 6;       // %/s parado
const MAX_ACTIVE_FIRES = 14;
const FIRE_SPAWN_BASE = 3200;     // ms base entre spawns
const LEVEL_TIME = 30;            // s por nível

/* ---------- Jogador (bombeiro) ---------- */
const player = {
    x: VIEW_W / 2,
    y: VIEW_H / 2,
    w: 64, h: 96,               // corpo maior e legível
    speed: 260,                 // px/s no mundo lógico
    angle: 0,
    muzzle: { x: 0, y: 0 }
};

/* ---------- Mapas / cenários ---------- */
// Ruas (retângulos cinza) — grelha simples
const streets = [
    { x: 0,    y: 300, w: VIEW_W, h: 120 },   // horizontal principal
    { x: 560,  y: 0,   w: 120,    h: VIEW_H } // vertical principal
];
// Passeios mais claros junto às ruas
const sidewalks = [
    { x: 0, y: 270, w: VIEW_W, h: 30 },
    { x: 0, y: 420, w: VIEW_W, h: 30 },
    { x: 530, y: 0, w: 30, h: VIEW_H },
    { x: 680, y: 0, w: 30, h: VIEW_H }
];
// Edifícios (quarteirões) — obstáculos estéticos (com telhado)
const buildings = [
    { x: 60,  y: 60,  w: 180, h: 150, roof: '#8a3b3b' },
    { x: 300, y: 60,  w: 180, h: 150, roof: '#3b5a8a' },
    { x: 760, y: 60,  w: 200, h: 150, roof: '#6a4a8a' },
    { x: 1020,y: 60,  w: 200, h: 150, roof: '#8a6a3b' },
    { x: 60,  y: 480, w: 180, h: 180, roof: '#3b7a5a' },
    { x: 300, y: 480, w: 180, h: 180, roof: '#8a3b5a' },
    { x: 760, y: 480, w: 200, h: 180, roof: '#3b5a8a' },
    { x: 1020,y: 480, w: 200, h: 180, roof: '#6a4a8a' }
];
// Árvores (copa circular)
const trees = [
    { x: 260, y: 250, r: 26 }, { x: 520, y: 250, r: 22 },
    { x: 720, y: 250, r: 26 }, { x: 980, y: 250, r: 22 },
    { x: 260, y: 470, r: 22 }, { x: 520, y: 470, r: 26 },
    { x: 720, y: 470, r: 22 }, { x: 980, y: 470, r: 26 }
];
// Hidrante (fonte de recarga de água)
const hydrant = { x: 500, y: 450, r: 20 };

/* ---------- Coleções dinâmicas ---------- */
const fires = [];
const waterParticles = [];
const smoke = [];
const sparks = [];

/* ---------- Utilidades ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function pointInRect(px, py, r) {
    return px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h;
}

/* ---------- Fogos ---------- */
function spawnFire(x, y) {
    if (fires.length >= MAX_ACTIVE_FIRES) return;
    if (x === undefined) {
        // procura ponto livre (fora de prédios)
        let tries = 0;
        do {
            x = rand(40, VIEW_W - 40);
            y = rand(40, VIEW_H - 40);
            tries++;
        } while (tries < 30 && buildings.some(b => pointInRect(x, y, b)));
    }
    fires.push({
        x, y,
        radius: rand(26, 40),
        life: 100,               // vida (apaga-se com água)
        maxLife: 100,
        intensity: 100,          // resistência à água
        flicker: rand(0, Math.PI * 2)
    });
}

function updateFires(dt) {
    for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.flicker += dt * 8;
        // Fumaça constante
        if (Math.random() < 0.35) {
            smoke.push({
                x: f.x + rand(-f.radius, f.radius) * 0.4,
                y: f.y - f.radius * 0.6,
                vx: rand(-8, 8), vy: rand(-30, -50),
                life: 1.6, max: 1.6, size: rand(10, 22)
            });
        }
        if (f.life <= 0) {
            // extinto: faíscas de vapor
            for (let k = 0; k < 12; k++) {
                sparks.push({
                    x: f.x, y: f.y,
                    vx: rand(-60, 60), vy: rand(-90, -20),
                    life: rand(0.4, 0.9), max: 0.9
                });
            }
            fires.splice(i, 1);
        }
    }
}

/* ---------- Água ---------- */
function shootWater() {
    if (waterLevel <= 0) return;
    const m = player.muzzle;
    const a = player.angle;
    // pequena dispersão
    const spread = rand(-0.06, 0.06);
    const ang = a + spread;
    waterParticles.push({
        x: m.x, y: m.y,
        vx: Math.cos(ang) * WATER_SPEED,
        vy: Math.sin(ang) * WATER_SPEED,
        traveled: 0,
        life: 1.4
    });
}

function updateWater(dt) {
    for (let i = waterParticles.length - 1; i >= 0; i--) {
        const p = waterParticles[i];
        p.vy += WATER_GRAVITY;                 // arco suave
        const step = Math.hypot(p.vx, p.vy);
        p.x += p.vx; p.y += p.vy;
        p.traveled += step;
        p.life -= dt;

        // Limita alcance a ~350px
        if (p.traveled > WATER_MAX_RANGE || p.life <= 0) {
            splash(p.x, p.y);
            waterParticles.splice(i, 1);
            continue;
        }
        // Colisão com fogo
        for (let j = fires.length - 1; j >= 0; j--) {
            const f = fires[j];
            if (dist(p.x, p.y, f.x, f.y) < f.radius + 6) {
                f.intensity -= 6;
                f.life -= 4;
                splash(p.x, p.y);
                waterParticles.splice(i, 1);
                if (f.intensity <= 0) {
                    score += 10 * level;
                    shake = Math.min(shake + 4, 12);
                }
                break;
            }
        }
    }
}

function splash(x, y) {
    for (let k = 0; k < 3; k++) {
        sparks.push({
            x, y, vx: rand(-40, 40), vy: rand(-50, -10),
            life: rand(0.2, 0.5), max: 0.5, water: true
        });
    }
}

function updateSmoke(dt) {
    for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.size += 12 * dt;
        s.life -= dt;
        if (s.life <= 0) smoke.splice(i, 1);
    }
}

function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vy += 60 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= dt;
        if (s.life <= 0) sparks.splice(i, 1);
    }
}

/* ---------- Movimento / colisões do jogador ---------- */
function movePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w']) dy -= 1;
    if (keys['ArrowDown'] || keys['s']) dy += 1;
    if (keys['ArrowLeft'] || keys['a']) dx -= 1;
    if (keys['ArrowRight'] || keys['d']) dx += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

    const nx = clamp(player.x + dx * player.speed * dt, player.w / 2, VIEW_W - player.w / 2);
    const ny = clamp(player.y + dy * player.speed * dt, player.h / 2, VIEW_H - player.h / 2);

    // Bloqueia prédios (colisão AABB aproximada pelo centro)
    if (!buildings.some(b => pointInRect(nx, player.y, inflate(b, 18)))) player.x = nx;
    if (!buildings.some(b => pointInRect(player.x, ny, inflate(b, 18)))) player.y = ny;

    player.angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    // posição da ponta da mangueira (bico)
    player.muzzle.x = player.x + Math.cos(player.angle) * 46;
    player.muzzle.y = player.y + Math.sin(player.angle) * 46;

    // Recarrega junto ao hidrante
    if (dist(player.x, player.y, hydrant.x, hydrant.y) < hydrant.r + 30) {
        waterLevel = clamp(waterLevel + 40 * dt, 0, 100);
    }
}

function inflate(r, p) { return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 }; }

/* ---------- Dificuldade / níveis ---------- */
function updateDifficulty(dt) {
    level = 1 + Math.floor(time / LEVEL_TIME);
    fireSpawnTimer += dt * 1000;
    const interval = Math.max(900, FIRE_SPAWN_BASE - level * 350);
    if (fireSpawnTimer >= interval && fires.length < MAX_ACTIVE_FIRES) {
        spawnFire();
        fireSpawnTimer = 0;
    }
}
let fireSpawnTimer = 0;

/* ---------- Loop principal ---------- */
function update(dt) {
    if (gameOver || !gameStarted) return;
    time += dt;

    movePlayer(dt);

    if (isWatering && waterLevel > 0) {
        waterLevel = clamp(waterLevel - WATER_DRAIN_RATE * dt, 0, 100);
        // várias gotas por frame para parecer jato contínuo
        for (let k = 0; k < 3; k++) shootWater();
    } else {
        waterLevel = clamp(waterLevel + WATER_REGEN_RATE * dt, 0, 100);
    }

    updateDifficulty(dt);
    updateFires(dt);
    updateWater(dt);
    updateSmoke(dt);
    updateSparks(dt);

    if (shake > 0) shake = Math.max(0, shake - dt * 30);
}

/* ================= RENDERIZAÇÃO ================= */
function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // aplica letterbox + escala
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // shake de câmara
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    drawBackground();
    drawMap();
    drawHydrant();
    drawTrees();
    drawBuildings();
    drawFires();
    drawSmoke();
    drawWater();
    drawSparks();
    drawPlayer();

    ctx.restore();

    drawHUD();
    if (!gameStarted) drawStartScreen();
    if (gameOver) drawGameOver();
}

function drawBackground() {
    // relva/terra com gradiente (nunca azul plano)
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#3f6f4a');
    g.addColorStop(1, '#2f5638');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawMap() {
    // passeios
    ctx.fillStyle = '#c9c2b6';
    sidewalks.forEach(s => ctx.fillRect(s.x, s.y, s.w, s.h));
    // ruas
    ctx.fillStyle = '#3a3f47';
    streets.forEach(s => ctx.fillRect(s.x, s.y, s.w, s.h));
    // linhas centrais tracejadas
    ctx.strokeStyle = '#f2d24b';
    ctx.lineWidth = 5;
    ctx.setLineDash([26, 22]);
    ctx.beginPath();
    ctx.moveTo(0, 360); ctx.lineTo(VIEW_W, 360);
    ctx.moveTo(620, 0); ctx.lineTo(620, VIEW_H);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawBuildings() {
    buildings.forEach(b => {
        // sombra
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
        // corpo
        ctx.fillStyle = '#d8cfc0';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        // telhado
        ctx.fillStyle = b.roof;
        ctx.fillRect(b.x, b.y, b.w, 26);
        // janelas
        ctx.fillStyle = '#7fa8c9';
        for (let wy = b.y + 44; wy < b.y + b.h - 14; wy += 30) {
            for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 30) {
                ctx.fillRect(wx, wy, 14, 16);
            }
        }
    });
}

function drawTrees() {
    trees.forEach(t => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(t.x + 4, t.y + 6, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2f7d3f';
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fa055';
        ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    });
}

function drawHydrant() {
    const h = hydrant;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(h.x + 3, h.y + 5, h.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.fillRect(h.x - 10, h.y - 14, 20, 28);
    ctx.beginPath(); ctx.arc(h.x, h.y - 14, 10, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#8e1b1b';
    ctx.fillRect(h.x - 16, h.y - 4, 32, 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HIDRANTE', h.x, h.y + 34);
}

function drawFires() {
    fires.forEach(f => {
        const flick = Math.sin(f.flicker) * 0.15 + 1;
        const glow = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.radius * 2.2);
        glow.addColorStop(0, 'rgba(255,180,60,0.55)');
        glow.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.radius * 2.2, 0, Math.PI * 2); ctx.fill();

        // base quente
        ctx.fillStyle = '#ff5a1f';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y + f.radius * 0.4, f.radius * 0.9, f.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // línguas de chama (triângulos animados)
        const flames = 5;
        for (let i = 0; i < flames; i++) {
            const fx = f.x + (i - flames / 2) * (f.radius * 0.35);
            const fh = f.radius * (1.1 + Math.sin(f.flicker + i) * 0.4) * flick;
            const grad = ctx.createLinearGradient(fx, f.y, fx, f.y - fh);
            grad.addColorStop(0, '#ff3d00');
            grad.addColorStop(0.5, '#ff9800');
            grad.addColorStop(1, '#ffe066');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(fx - f.radius * 0.22, f.y + f.radius * 0.3);
            ctx.quadraticCurveTo(fx - f.radius * 0.1, f.y - fh * 0.6, fx, f.y - fh);
            ctx.quadraticCurveTo(fx + f.radius * 0.1, f.y - fh * 0.6, fx + f.radius * 0.22, f.y + f.radius * 0.3);
            ctx.closePath();
            ctx.fill();
        }
        // núcleo brilhante
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath(); ctx.arc(f.x, f.y + f.radius * 0.2, f.radius * 0.25, 0, Math.PI * 2); ctx.fill();
    });
}

function drawSmoke() {
    smoke.forEach(s => {
        const a = clamp(s.life / s.max, 0, 1) * 0.5;
        ctx.fillStyle = `rgba(70,70,70,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    });
}

function drawWater() {
    waterParticles.forEach(p => {
        ctx.fillStyle = 'rgba(80,170,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,235,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1, 2, 0, Math.PI * 2); ctx.fill();
    });
}

function drawSparks() {
    sparks.forEach(s => {
        const a = clamp(s.life / s.max, 0, 1);
        ctx.fillStyle = s.water ? `rgba(150,210,255,${a})` : `rgba(255,220,120,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.water ? 3 : 2.5, 0, Math.PI * 2); ctx.fill();
    });
}

function drawPlayer() {
    const { x, y, angle } = player;

    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 40, 34, 12, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // --- Mangueira/bico apontando na direção do ângulo ---
    ctx.strokeStyle = '#123a6b';
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(40, 0); ctx.stroke();
    ctx.fillStyle = '#0d2a4d';
    ctx.fillRect(38, -8, 14, 16);           // bico
    ctx.fillStyle = '#ffd257';
    ctx.fillRect(50, -5, 6, 10);            // ponta

    // --- Corpo (casaco refletor) visto de cima ---
    ctx.fillStyle = '#e8541f';              // casaco vermelho-laranja
    roundRect(-22, -26, 44, 52, 12); ctx.fill();
    // faixa refletora
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(-22, -4, 44, 8);
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(-22, 12, 44, 4);

    // ombros/cabeça (capacete)
    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.arc(0, -6, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8e1b1b';
    ctx.beginPath(); ctx.arc(0, -6, 16, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#7a1515'; ctx.stroke();
    // aba frontal do capacete
    ctx.fillStyle = '#a01f1f';
    ctx.beginPath(); ctx.arc(0, -6, 16, -0.6, 0.6); ctx.lineTo(18, -6); ctx.closePath(); ctx.fill();
    // viseira
    ctx.fillStyle = '#111';
    ctx.fillRect(8, -6, 8, 12);

    ctx.restore();

    // indicador de alcance (arco subtil quando aponta)
    ctx.strokeStyle = 'rgba(120,200,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, WATER_MAX_RANGE, angle - 0.5, angle + 0.5);
    ctx.stroke();
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/* ---------- HUD ---------- */
function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,16,32,0.72)';
    roundRect(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5; ctx.stroke();
}

function drawHUD() {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // painel superior esquerdo
    panel(18, 18, 300, 96);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = 'bold 20px Segoe UI, Arial';
    ctx.fillText(`⏱ ${formatTime(time)}s`, 34, 50);
    ctx.fillStyle = '#ffd257';
    ctx.fillText(`★ ${score}`, 190, 50);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '15px Segoe UI, Arial';
    ctx.fillText(`Nível ${level}`, 34, 78);
    ctx.fillText(`Fogos ativos: ${fires.length}/${MAX_ACTIVE_FIRES}`, 120, 78);

    // barra de água (painel inferior esquerdo)
    panel(18, VIEW_H - 60, 320, 42);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = 'bold 14px Segoe UI, Arial';
    ctx.fillText('ÁGUA', 34, VIEW_H - 34);
    const bw = 240, bx = 96, by = VIEW_H - 44;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(bx, by, bw, 16, 8); ctx.fill();
    const wg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    wg.addColorStop(0, '#29b6f6'); wg.addColorStop(1, '#4dd0e1');
    ctx.fillStyle = wg;
    roundRect(bx, by, bw * (waterLevel / 100), 16, 8); ctx.fill();
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '12px Segoe UI, Arial';
    ctx.fillText(`${Math.floor(waterLevel)}%`, bx + bw + 8, VIEW_H - 32);

    // barra de progresso do nível (topo central)
    const prog = (time % LEVEL_TIME) / LEVEL_TIME;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(VIEW_W / 2 - 160, 26, 320, 8, 4); ctx.fill();
    ctx.fillStyle = '#ffd257';
    roundRect(VIEW_W / 2 - 160, 26, 320 * prog, 8, 4); ctx.fill();
}

function formatTime(t) { return Math.floor(t); }

function drawStartScreen() {
    ctx.fillStyle = 'rgba(6,10,22,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd257';
    ctx.font = 'bold 52px Segoe UI, Arial';
    ctx.fillText('🚒 JOGO DO BOMBEIRO', VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '22px Segoe UI, Arial';
    ctx.fillText('Clique para começar a apagar incêndios!', VIEW_W / 2, VIEW_H / 2 + 20);
    ctx.font = '16px Segoe UI, Arial';
    ctx.fillStyle = 'rgba(234,242,255,0.7)';
    ctx.fillText('Mantenha-se perto do HIDRANTE para recarregar água.', VIEW_W / 2, VIEW_H / 2 + 60);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(6,10,22,0.8)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a5a';
    ctx.font = 'bold 56px Segoe UI, Arial';
    ctx.fillText('INCÊNDIO FORA DE CONTROLE', VIEW_W / 2, VIEW_H / 2 - 30);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '24px Segoe UI, Arial';
    ctx.fillText(`Pontuação final: ${score}   ·   Tempo: ${formatTime(time)}s`, VIEW_W / 2, VIEW_H / 2 + 20);
    ctx.fillStyle = '#ffd257';
    ctx.font = '20px Segoe UI, Arial';
    ctx.fillText('Pressione R para reiniciar', VIEW_W / 2, VIEW_H / 2 + 60);
}

/* ---------- Ciclo requestAnimationFrame ---------- */
function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = clamp(dt, 0, 0.05);          // evita saltos grandes (aba em fundo)
    update(dt);
    render();
    requestAnimationFrame(loop);
}

/* ---------- Input ---------- */
canvas.addEventListener('mousemove', e => {
    const w = toWorld(e.clientX, e.clientY);
    mouseX = w.x; mouseY = w.y;
});
canvas.addEventListener('mousedown', () => {
    if (!gameStarted) { gameStarted = true; return; }
    isWatering = true;
});
window.addEventListener('mouseup', () => isWatering = false);
window.addEventListener('blur', () => isWatering = false);

window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key.toLowerCase() === 'r') resetGame();
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key] = false);

/* ---------- Reset ---------- */
function resetGame() {
    player.x = VIEW_W / 2; player.y = VIEW_H / 2;
    player.angle = 0;
    score = 0; time = 0; level = 1;
    waterLevel = 100;
    fires.length = 0; waterParticles.length = 0; smoke.length = 0; sparks.length = 0;
    fireSpawnTimer = 0; shake = 0;
    gameOver = false;
    // garante pelo menos um foco de fogo inicial
    spawnFire(VIEW_W / 2 + 220, VIEW_H / 2 - 120);
    spawnFire(VIEW_W / 2 - 260, VIEW_H / 2 + 160);
    gameStarted = true;
}

/* Verifica fim de jogo */
setInterval(() => {
    if (gameStarted && !gameOver && fires.length >= MAX_ACTIVE_FIRES) gameOver = true;
}, 250);

resetGame();
requestAnimationFrame(loop);