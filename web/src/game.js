import { Input } from './input.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Launcher } from './launcher.js';
import { DazzleBackground } from './dazzleBackground.js';
import { Wall } from './wall.js';
import { Music } from './music.js';
import { resolveCollision, checkCollision, pushOutOfCircle, reflectOffCircle, flingOffWall } from './physics.js';

const DAZZLE_SCORE_MULTIPLIER = 1.3;
const EXPERT_SCORE_MULTIPLIER = 1.7;

// The enemy spawn count was previously unbounded (grew forever with elapsed
// time), which combined with the O(n²) pairwise resolveCollision() check in
// loop() risked a runaway CPU/frame-rate spiral on long sessions — most
// acutely in Free mode, which by design never ends. Rather than a flat cap,
// scale the ceiling with canvas area (bigger screen = more room, so more
// enemies stay comfortably spaced and readable) via a tuned area-per-enemy
// budget, chosen so pairwise collision checks + per-enemy draw calls stay
// cheap well past typical screen sizes. Deliberately *no* upper hard cap: the
// game's whole point is that avoiding warawara eventually becomes impossible,
// including on ultrawide/very large displays — the screen should be able to
// fill up completely, not plateau at some fixed count.
const MAX_ENEMIES_AREA_PER_ENEMY = 4000; // px² of canvas per allowed enemy
const MAX_ENEMIES_FLOOR = 20; // never restrict below this, even on tiny windows

function computeMaxEnemies(canvasWidth, canvasHeight) {
    const area = canvasWidth * canvasHeight;
    const byArea = Math.floor(area / MAX_ENEMIES_AREA_PER_ENEMY);
    return Math.max(MAX_ENEMIES_FLOOR, byArea);
}

// Expert mode: a handful of spinning walls in the arena, kept away from both
// the exact center and the screen edges/launchers. Wall count scales with
// screen size: 2 walls at/below EXPERT_WALL_COUNT_BASE_SIZE, +1 for every
// further EXPERT_WALL_COUNT_STEP_SIZE px of (square) canvas size.
const EXPERT_WALL_BASE_COUNT = 2;
const EXPERT_WALL_COUNT_BASE_SIZE = 500;
const EXPERT_WALL_COUNT_STEP_SIZE = 250;
const EXPERT_WALL_LENGTH = 90; // 1.5x the original 60 (~3x an enemy's diameter (radius 15 -> diameter 30))
const EXPERT_WALL_MIN_ANGULAR_SPEED = 0.29; // radians/frame ~ a full spin every ~0.25-0.36s at 60fps
const EXPERT_WALL_MAX_ANGULAR_SPEED = 0.43;

const COUNTDOWN_SECONDS = 3;
const SCORE_HISTORY_KEY = 'warawara-score-history';
const SCORE_HISTORY_LIMIT = 10;
// A canvas at this size (px) scores 1:1 with the raw score. Bigger screens give
// more room to dodge, so Total Point scales down past this; smaller screens
// (less room to dodge) scale up. Linear in screen size (not area) by design.
const REFERENCE_SCREEN_SIZE = 1000;

const SCORE_HISTORY_MODES = new Set(['free', 'normal', 'dazzle', 'expert']);

// localStorage is writable by anything same-origin (including the user via
// devtools), so treat entries read back from it as untrusted — validate
// shape/types before they reach the rest of the game (e.g. rendering, or
// sort comparisons that would misbehave on NaN/Infinity).
function isValidScoreEntry(entry) {
    return (
        typeof entry === 'object' && entry !== null &&
        Number.isFinite(entry.date) &&
        SCORE_HISTORY_MODES.has(entry.mode) &&
        Number.isInteger(entry.warawara) && entry.warawara >= 0 &&
        Number.isInteger(entry.time) && entry.time >= 0 &&
        Number.isFinite(entry.score) && entry.score >= 0 &&
        Number.isFinite(entry.total) && entry.total >= 0
    );
}

function loadScoreHistory() {
    try {
        const raw = localStorage.getItem(SCORE_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isValidScoreEntry) : [];
    } catch {
        return [];
    }
}

function saveScoreHistory(history) {
    try {
        localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history));
    } catch {
        // Storage unavailable/full — the leaderboard just won't persist this run.
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ui = document.getElementById('ui');
        this.warawaraCountEl = document.getElementById('warawara-count');
        this.timeEl = document.getElementById('time-count');
        this.scoreEl = document.getElementById('score-count');
        this.titleScreen = document.getElementById('title-screen');
        this.modeOptionEls = Array.from(document.querySelectorAll('.mode-option'));
        this.startButton = document.getElementById('start-button');
        this.countdownEl = document.getElementById('countdown');
        this.countdownNumberEl = document.getElementById('countdown-number');
        this.gameOverScreen = document.getElementById('gameover-screen');
        this.restartButton = document.getElementById('restart-button');
        this.scoreHistoryBody = document.getElementById('score-history-body');
        this.freeModeExitButton = document.getElementById('free-mode-exit-button');
        this.muteButton = document.getElementById('mute-button');

        this.input = new Input(this.canvas);
        this.player = new Player();
        this.enemies = [];
        this.launchers = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(id => new Launcher(id));
        this.dazzleBackground = new DazzleBackground();
        this.walls = [];
        this.music = new Music();

        this.started = false;
        this.gameOver = false;
        this.gameOverUIShown = false;

        // Mode selection lives on the title screen: pick with the mouse or with
        // Up/Down arrow keys, START launches whichever is currently selected.
        // Only "normal" has real gameplay defined so far (it's today's game);
        // the other 3 are placeholders for future mode-specific rules.
        this.modes = this.modeOptionEls.map(el => el.dataset.mode);
        this.selectMode(this.modes.indexOf('normal'));

        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Place player in the center at the start
        this.player.x = this.canvas.width / 2;
        this.player.y = this.canvas.height / 2;

        this.startButton.addEventListener('click', () => {
            // AudioContext creation/resume must happen synchronously inside a
            // user-gesture handler — do it here, even though actual playback
            // doesn't start until startGame() runs after the countdown.
            this.music.ensureContext();
            this.beginCountdown();
        });
        this.restartButton.addEventListener('click', () => this.resetToTitle());
        this.freeModeExitButton.addEventListener('click', () => this.resetToTitle());
        this.muteButton.addEventListener('click', () => {
            const muted = this.music.toggleMute();
            this.muteButton.textContent = muted ? 'Unmute' : 'Mute';
        });

        this.modeOptionEls.forEach((el, i) => {
            el.addEventListener('click', () => this.selectMode(i));
        });
        window.addEventListener('keydown', (e) => this.handleModeKey(e));
        window.addEventListener('keydown', (e) => this.handleFreeModeExitKey(e));

        this.loop();
    }

    selectMode(index) {
        this.selectedModeIndex = index;
        this.modeOptionEls.forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
    }

    handleModeKey(e) {
        // Only relevant while the title screen (with the mode list) is showing.
        if (this.titleScreen.classList.contains('hidden')) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const next = (this.selectedModeIndex + delta + this.modes.length) % this.modes.length;
        this.selectMode(next);
    }

    handleFreeModeExitKey(e) {
        // Desktop-only convenience alongside the always-visible exit button
        // (Free mode has no game over, so touch/mobile players need that
        // button since there's no Escape key there).
        if (e.key !== 'Escape') return;
        if (this.mode !== 'free' || !this.started) return;

        this.resetToTitle();
    }

    resize() {
        const size = Math.min(window.innerWidth, window.innerHeight);
        this.canvas.width = size;
        this.canvas.height = size;

        // Track the largest size seen during an active run so a player can't
        // shrink the window right before game over to cheat a better (smaller
        // screen size = higher) Total Point — see recordScore().
        if (this.started && !this.gameOver) {
            this.maxScreenSize = Math.max(this.maxScreenSize, size);
        }
    }

    beginCountdown() {
        this.titleScreen.classList.add('hidden');
        this.countdownEl.classList.add('visible');

        let remaining = COUNTDOWN_SECONDS;
        const showNumber = () => {
            this.countdownNumberEl.textContent = remaining;
            // Restart the pop animation on each tick
            this.countdownNumberEl.style.animation = 'none';
            void this.countdownNumberEl.offsetWidth;
            this.countdownNumberEl.style.animation = '';
        };
        showNumber();

        const tick = () => {
            remaining--;
            if (remaining > 0) {
                showNumber();
            } else {
                this.countdownEl.classList.remove('visible');
                this.startGame();
                return;
            }
            setTimeout(tick, 1000);
        };
        setTimeout(tick, 1000);
    }

    startGame() {
        this.mode = this.modes[this.selectedModeIndex];
        this.started = true;
        this.startTime = Date.now();
        this.lastScoreTick = this.startTime;
        this.score = 0;
        this.maxScreenSize = this.canvas.width;
        this.ui.classList.add('visible');
        this.freeModeExitButton.classList.toggle('visible', this.mode === 'free');
        this.muteButton.classList.add('visible');
        this.muteButton.textContent = this.music.muted ? 'Unmute' : 'Mute';
        this.music.start();
        this.walls = this.mode === 'expert' ? this.spawnWalls() : [];
        this.spawnEnemy();
    }

    spawnWalls() {
        const size = this.canvas.width; // canvas is always square
        const count = EXPERT_WALL_BASE_COUNT + Math.max(0, Math.floor((size - EXPERT_WALL_COUNT_BASE_SIZE) / EXPERT_WALL_COUNT_STEP_SIZE));
        const edgeMargin = EXPERT_WALL_LENGTH / 2 + 20;
        const maxDistance = Math.max(0, size / 2 - edgeMargin);
        const minDistance = size * 0.12;

        // Radiate outward from the center: split the full circle into `count`
        // even slices (with a little jitter so it doesn't look mechanically
        // rigid) and give each wall its own random distance within its slice
        // — this spreads walls around the center instead of letting pure
        // random angles cluster them together.
        const angleStep = (Math.PI * 2) / count;
        const walls = [];
        for (let i = 0; i < count; i++) {
            const angleFromCenter = i * angleStep + (Math.random() - 0.5) * angleStep * 0.6;
            const distance = minDistance + Math.random() * Math.max(0, maxDistance - minDistance);
            const centerX = size / 2 + Math.cos(angleFromCenter) * distance;
            const centerY = size / 2 + Math.sin(angleFromCenter) * distance;
            const speed = EXPERT_WALL_MIN_ANGULAR_SPEED + Math.random() * (EXPERT_WALL_MAX_ANGULAR_SPEED - EXPERT_WALL_MIN_ANGULAR_SPEED);
            const angularVelocity = (Math.random() < 0.5 ? -1 : 1) * speed; // random spin direction, CW or CCW
            walls.push(new Wall(centerX, centerY, EXPERT_WALL_LENGTH, Math.random() * Math.PI * 2, angularVelocity));
        }
        return walls;
    }

    spawnEnemy() {
        const corners = [
            { x: 0, y: 0 },
            { x: this.canvas.width, y: 0 },
            { x: 0, y: this.canvas.height },
            { x: this.canvas.width, y: this.canvas.height }
        ];
        const corner = corners[Math.floor(Math.random() * corners.length)];
        this.enemies.push(new Enemy(corner.x, corner.y, this.player.x, this.player.y));
    }

    triggerGameOver() {
        this.gameOver = true;
        this.canvas.style.cursor = 'default'; // player is frozen; show the real cursor again
        this.music.stop();

        this.recordScore();

        // Freeze the player at the collision point (player.update() is skipped
        // from now on) and send every enemy rushing straight at that point.
        for (const enemy of this.enemies) {
            enemy.startConverging(this.player.x, this.player.y);
        }
    }

    recordScore() {
        const warawara = this.enemies.length;
        const time = Math.floor((Date.now() - this.startTime) / 1000);
        const score = Math.floor(this.score + 1e-9);
        // Normalize by the largest screen size seen this run (maxScreenSize,
        // tracked in resize()), not just the size at collision time — otherwise
        // shrinking the window right before game over would cheat a better
        // (smaller screen size = higher) Total Point. See REFERENCE_SCREEN_SIZE
        // above. The canvas is always square.
        const total = Math.round(score * REFERENCE_SCREEN_SIZE / this.maxScreenSize);

        const history = loadScoreHistory();
        history.push({ date: Date.now(), mode: this.mode, warawara, time, score, total });
        history.sort((a, b) => b.total - a.total);
        history.length = Math.min(history.length, SCORE_HISTORY_LIMIT);
        saveScoreHistory(history);

        this.renderScoreHistory(history);
    }

    renderScoreHistory(history) {
        this.scoreHistoryBody.replaceChildren();
        history.forEach((entry, i) => {
            const d = new Date(entry.date);
            const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
            const row = document.createElement('tr');
            // Built with textContent (not innerHTML) since this data round-trips
            // through localStorage, which anything same-origin — including the
            // user via devtools — can write to; a template-literal innerHTML
            // here would be a stored-XSS footgun for any less-trusted field
            // added to score entries in the future.
            const cellValues = [i + 1, dateStr, entry.mode ?? '-', entry.warawara, `${entry.time}s`, entry.score, entry.total];
            for (const value of cellValues) {
                const td = document.createElement('td');
                td.textContent = value;
                row.appendChild(td);
            }
            this.scoreHistoryBody.appendChild(row);
        });
    }

    resetToTitle() {
        this.gameOverScreen.classList.remove('visible');
        this.titleScreen.classList.remove('hidden');
        this.ui.classList.remove('visible');
        this.freeModeExitButton.classList.remove('visible');
        this.muteButton.classList.remove('visible');
        this.music.stop();
        this.canvas.style.cursor = 'none';

        this.enemies = [];
        this.walls = [];
        this.started = false;
        this.gameOver = false;
        this.gameOverUIShown = false;
        this.score = 0;
        this.warawaraCountEl.textContent = 'warawara: 0';
        this.scoreEl.textContent = 'score: 0';

        this.player.x = this.canvas.width / 2;
        this.player.y = this.canvas.height / 2;
    }

    loop() {
        if (this.mode === 'dazzle' || this.mode === 'expert') {
            this.dazzleBackground.draw(this.ctx, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        for (const launcher of this.launchers) {
            launcher.update(this.canvas.width, this.canvas.height);
            launcher.draw(this.ctx);
        }

        if (this.mode === 'expert') {
            for (const wall of this.walls) {
                wall.update();
                wall.draw(this.ctx);
            }
        }

        if (!this.gameOver) {
            const prevPlayerX = this.player.x;
            const prevPlayerY = this.player.y;
            this.player.update(this.input, this.canvas.width, this.canvas.height);
            for (const launcher of this.launchers) {
                pushOutOfCircle(this.player, launcher);
            }
            if (this.mode === 'expert') {
                // Pass the pre-move position: the player can jump straight to
                // the mouse position in one frame (no speed cap like enemies
                // have), so this checks the whole path for tunneling through
                // the wall's thin hit-band, not just the final position.
                for (const wall of this.walls) {
                    flingOffWall(this.player, wall, prevPlayerX, prevPlayerY);
                }
            }
        }
        this.player.draw(this.ctx);

        if (this.started) {
            if (!this.gameOver) {
                const now = Date.now();
                const elapsed = Math.floor((now - this.startTime) / 1000);
                this.timeEl.textContent = `Time: ${elapsed}s`;
                this.warawaraCountEl.textContent = `warawara: ${this.enemies.length}`;
                this.music.setEnemyCount(this.enemies.length);

                // Score ticks every 100ms: 1 base point, plus a bonus that scales
                // with how many enemies (warawara) are currently on screen.
                // Dazzle scores 1.3x Normal, Expert scores 1.7x, on top of that.
                while (now - this.lastScoreTick >= 100) {
                    this.lastScoreTick += 100;
                    const n = this.enemies.length;
                    let tickScore = 1 + (n - 1) * n * 0.1;
                    if (this.mode === 'dazzle') tickScore *= DAZZLE_SCORE_MULTIPLIER;
                    else if (this.mode === 'expert') tickScore *= EXPERT_SCORE_MULTIPLIER;
                    this.score += tickScore;
                }
                // +1e-9 guards against float rounding (e.g. 15.999999999998) shorting the displayed score by 1
                this.scoreEl.textContent = `score: ${Math.floor(this.score + 1e-9)}`;

                const enemyCap = Math.min(Math.floor(elapsed / 10), computeMaxEnemies(this.canvas.width, this.canvas.height));
                if (elapsed >= 30 && elapsed % 10 === 0 && this.enemies.length < enemyCap) {
                    // Every 10 seconds after 30s, add more enemies (with small random chance to prevent spawning too many in one frame)
                    if (Math.random() < 0.02) this.spawnEnemy();
                }
            }

            for (let i = 0; i < this.enemies.length; i++) {
                const e1 = this.enemies[i];
                e1.update(this.canvas.width, this.canvas.height, this.player);

                if (!this.gameOver) {
                    for (const launcher of this.launchers) {
                        reflectOffCircle(e1, launcher);
                    }
                    if (this.mode === 'expert') {
                        for (const wall of this.walls) {
                            flingOffWall(e1, wall);
                        }
                    }
                }

                e1.draw(this.ctx);

                if (!this.gameOver) {
                    // Free mode: no hit judgment on the player, so the game
                    // never ends — you just watch warawara pile up forever.
                    if (this.mode !== 'free' && checkCollision(this.player, e1)) {
                        this.triggerGameOver();
                    }

                    for (let j = i + 1; j < this.enemies.length; j++) {
                        resolveCollision(e1, this.enemies[j]);
                    }
                }
            }

            if (this.gameOver && !this.gameOverUIShown && this.enemies.every(e => e.arrived)) {
                this.gameOverUIShown = true;
                this.gameOverScreen.classList.add('visible');
            }
        }

        requestAnimationFrame(() => this.loop());
    }
}

new Game();
