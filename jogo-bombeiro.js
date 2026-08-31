/* 
 * Jogo do Bombeiro - lógica principal
 * Controles:
 *   WASD / Setas = mover
 *   Rato = apontar (mangueira)
 *   Botão esquerdo = água (partículas)
 *   R = reiniciar
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Ajuste de tamanho do canvas ao redimensionar a janela
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Jogador (bombeiro)
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    width: 40,
    height: 70,
    speed: 5,
    angle: 0,          // direção que a mangueira aponta
    dx: 0,
    dy: 0
};

// Controle de teclado
const keys = {};

// Controle do mouse
let mouseX = 0, mouseY = 0;
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Estado da água
let isWatering = false;
let waterParticles = [];
const WATER_SPEED = 6;
const WATER_LIFETIME = 2000; // ms
const WATER_RADIUS = 6;

// Fogo
const fires = [];
const FIRE_SPAWN_INTERVAL = 1000; // ms inicialmente
let fireSpawnTimer = 0;
let fireLifeDecreaseRate = 0.5; // vida do fogo diminui com o tempo (aumenta dificuldade)

// Pontuação e temporizador
let score = 0;
let time = 0; // segundos
const MAX_TIME = 180; // 3 minutos
let waterLevel = 100; // percentual
const WATER_DRAIN_RATE = 5; // % por segundo enquanto se usa água
const WATER_REGEN_RATE = 2; // % por segundo quando não se usa água

// Dificuldade
let activeFires = 0;
const MAX_ACTIVE_FIRES = 15;
let gameOver = false;

// Teclas pressionadas
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    // Reinicia com R
    if (e.key.toLowerCase() === 'r' && gameOver) {
        resetGame();
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Atualiza a posição do mouse para cálculo da direção da mangueira
function updateMouseDirection() {
    const dx = mouseX - player.x;
    const dy = mouseY - player.y;
    player.angle = Math.atan2(dy, dx);
    player.dx = Math.cos(player.angle);
    player.dy = Math.sin(player.angle);
}

// Spawn de fogos
function spawnFire() {
    if (gameOver || activeFires >= MAX_ACTIVE_FIRES) return;

    const size = 30 + Math.random() * 20; // tamanho aleatório
    const x = Math.random() * (canvas.width - size) + size / 2;
    const y = Math.random() * (canvas.height - size) + size / 2;

    fires.push({
        x,
        y,
        radius: size,
        life: 100 + Math.random() * 100, // vida inicial
        intensity: 100, // intensidade (quanto maior, mais difícil de apagar)
        color: '#ff4444'
    });
    activeFires++;
}

// Reduz a vida dos fogos com o tempo (aumenta dificuldade)
function updateFires(delta) {
    for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.life -= fireLifeDecreaseRate * delta;
        if (f.life <= 0) {
            // Fogo se apagou sozinho (tempo expirou)
            fires.splice(i, 1);
            activeFires--;
        }
    }
}

// Cria partículas de água
function createWaterParticle() {
    const angle = player.angle;
    const vx = Math.cos(angle) * WATER_SPEED;
    const vy = Math.sin(angle) * WATER_SPEED;
    return {
        x: player.x + player.width / 2,
        y: player.y + player.height / 2,
        vx,
        vy,
        life: WATER_LIFETIME,
        radius: WATER_RADIUS
    };
}

// Atualiza partículas de água
function updateWaterParticles(delta) {
    for (let i = waterParticles.length - 1; i >= 0; i--) {
        const p = waterParticles[i];
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.life -= delta;

        // Remover partículas expiradas
        if (p.life <= 0) {
            waterParticles.splice(i, 1);
        }
    }
}

// Detecta colisão entre partícula e fogo
function checkCollisions() {
    for (let i = waterParticles.length - 1; i >= 0; i--) {
        const p = waterParticles[i];
        for (let j = fires.length - 1; j >= 0; j--) {
            const f = fires[j];
            const dx = p.x - f.x;
            const dy = p.y - f.y;
            const dist = Math.hypot(dx, dy);
            if (dist < f.radius + p.radius) {
                // Reduz intensidade do fogo
                f.intensity -= 10;
                if (f.intensity <= 0) {
                    // Apaga o fogo
                    fires.splice(j, 1);
                    activeFires--;
                    score += 10;
                    // Notificação curta
                    alert('Fogo apagado! +10 pts');
                }
                // Consome água
                waterLevel = Math.max(0, waterLevel - 5);
                // Remove partícula
                waterParticles.splice(i, 1);
                break;
            }
        }
    }
}

// Atualiza o estado do jogo
function update(deltaTime) {
    if (gameOver) return;

    // Movimento do jogador
    player.dx = player.dy = 0;
    if (keys['ArrowUp'] || keys['w']) player.dy -= 1;
    if (keys['ArrowDown'] || keys['s']) player.dy += 1;
    if (keys['ArrowLeft'] || keys['a']) player.dx -= 1;
    if (keys['ArrowRight'] || keys['d']) player.dx += 1;

    // Normaliza movimento diagonal
    if (player.dx !== 0 && player.dy !== 0) {
        const norm = Math.sqrt(player.dx * player.dx + player.dy * player.dy);
        player.dx *= 0.7071; // 1/√2
        player.dy *= 0.7071;
    }
    player.x += player.dx * player.speed * deltaTime;
    player.y += player.dy * player.speed * deltaTime;

    // Mantém jogador dentro do canvas
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

    // Atualiza direção da mangueira
    updateMouseDirection();

    // Controle de água
    if (isWatering) {
        // Drena água enquanto o botão está pressionado
        waterLevel = Math.max(0, waterLevel - WATER_DRAIN_RATE * (deltaTime / 1000));
    } else {
        // Recarrega água lentamente
        waterLevel = Math.min(100, waterLevel + WATER_REGEN_RATE * (deltaTime / 1000));
    }

    // Spawn de fogos (aumenta frequência com o tempo)
    fireSpawnTimer += deltaTime;
    const spawnInterval = Math.max(200, FIRE_SPAWN_INTERVAL - time * 0.5); // diminui intervalo
    if (fireSpawnTimer >= spawnInterval) {
        spawnFire();
        fireSpawnTimer = 0;
    }

    // Atualiza fogos
    updateFires(deltaTime);

    // Atualiza partículas de água
    updateWaterParticles(deltaTime);

    // Verifica colisões
    checkCollisions();

    // Verifica condições de fim de jogo
    if (activeFires > MAX_ACTIVE_FIRES || time >= MAX_TIME) {
        gameOver = true;
    }

    // Incrementa tempo
    time += deltaTime / 1000;
}

// Renderiza tudo no canvas
function render() {
    // Fundo
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Jogador (bombeiro)
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Corpo (traje)
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(-player.width / 2, player.height - player.height / 2 - 20, player.width, 20);

    // Cabeça (capacete)
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, player.height - player.height / 2 - 30, 15, 0, Math.PI * 2);
    ctx.fill();

    // Máscara/visor
    ctx.fillStyle = '#555';
    ctx.fillRect(-5, player.height - player.height / 2 - 35, 10, 10);

    // Mangueira (linha)
    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, player.height - player.height / 2 - 30);
    const targetX = mouseX;
    const targetY = mouseY;
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    ctx.restore();

    // Fogos
    fires.forEach(f => {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Partículas de água
    waterParticles.forEach(p => {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // UI
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.fillText(`Tempo: ${Math.floor(time)}s`, 10, 20);
    ctx.fillText(`Pontuação: ${score}`, 10, 40);
    ctx.fillText(`Água: ${Math.floor(waterLevel)}%`, 10, 60);

    if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffcc00';
        ctx.textAlign = 'center';
        ctx.font = '36px Arial';
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = '20px Arial';
        ctx.fillText('Pressione R para reiniciar', canvas.width / 2, canvas.height / 2 + 20);
    }
}

// Loop principal
function loop(timestamp) {
    const deltaTime = timestamp - (loop.lastTime || timestamp);
    loop.lastTime = timestamp;

    update(deltaTime);
    render();

    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Inicia o jogo
function resetGame() {
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.dx = player.dy = 0;
    player.angle = 0;
    score = 0;
    time = 0;
    waterLevel = 100;
    activeFires = 0;
    fires.length = 0;
    waterParticles.length = 0;
    fireSpawnTimer = 0;
    fireLifeDecreaseRate = 0.5;
    gameOver = false;
}

// Inicia o jogo pela primeira vez
resetGame();