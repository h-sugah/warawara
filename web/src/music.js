// In-game background music: a driving four-on-the-floor loop (kick on every
// beat, a short synth bass stab on the off-beats, plus hi-hat), synthesized
// live with the Web Audio API — no audio file assets, matching this
// project's zero-external-dependency approach.
//
// Uses the standard "lookahead scheduler" pattern (schedule a little ahead
// of real time, using AudioContext.currentTime for sample-accurate timing
// rather than trusting setTimeout's own jitter) recommended for Web Audio:
// https://web.dev/articles/audio-scheduling
//
// Intensity ramps up in tiers based on the live warawara (enemy) count —
// see setEnemyCount()/TIERS below — to build tension as the screen fills up:
// each tier bumps the tempo, and past tier 1 the hi-hat switches from a
// sparse off-beat pattern to a full sixteenth-note pattern, past tier 2 a
// clap layers onto beats 2 & 4, and the bass's lowpass filter opens up
// (brighter/more present) with each tier.
const BASE_BPM = 124;
const BPM_STEP_PER_TIER = 4;
const ENEMIES_PER_TIER = 10;
const MAX_TIER = 6;
const BASS_FILTER_BASE = 400;
const BASS_FILTER_STEP_PER_TIER = 250;

const STEPS_PER_BAR = 16; // sixteenth-note grid
const SCHEDULE_AHEAD_SECONDS = 0.1;
const LOOKAHEAD_MS = 25;
const DEFAULT_VOLUME = 0.45;

export class Music {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.muted = false;
        this.playing = false;
        this.stepIndex = 0; // 0-15 within one 4/4 bar (sixteenth-note steps)
        this.nextNoteTime = 0;
        this.timerId = null;
        this.tier = 0;
    }

    // Creates (once) and resumes the AudioContext. Browsers only allow this
    // in direct response to a user gesture, so call it from a click handler
    // (e.g. the START button) even if actual playback starts later.
    ensureContext() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.muted ? 0 : DEFAULT_VOLUME;
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    start() {
        this.ensureContext();
        if (this.playing) return;
        this.playing = true;
        this.stepIndex = 0;
        this.tier = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05;
        this.scheduler();
    }

    stop() {
        this.playing = false;
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : DEFAULT_VOLUME;
        }
        return this.muted;
    }

    // Called every frame from Game.loop() with the live enemy count. Cheap —
    // just updates which tier we're in; the scheduler reads this.tier fresh
    // each time it schedules a note (at most ~100ms ahead), so intensity
    // changes take effect within a fraction of a beat, not instantly.
    setEnemyCount(count) {
        this.tier = Math.min(MAX_TIER, Math.floor(count / ENEMIES_PER_TIER));
    }

    currentStepSeconds() {
        const bpm = BASE_BPM + this.tier * BPM_STEP_PER_TIER;
        return 60 / bpm / 4; // one sixteenth note
    }

    scheduler() {
        if (!this.playing) return;
        while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
            this.scheduleStep(this.stepIndex, this.nextNoteTime, this.tier);
            this.nextNoteTime += this.currentStepSeconds();
            this.stepIndex = (this.stepIndex + 1) % STEPS_PER_BAR;
        }
        this.timerId = setTimeout(() => this.scheduler(), LOOKAHEAD_MS);
    }

    // 16 sixteenth-note steps per bar. Steps 0/4/8/12 are the four
    // quarter-note beats (kick). Steps 2/6/10/14 are the "and" off-beats
    // (bass, and hi-hat at tier 0). From tier 1 the hi-hat plays on every
    // step instead. From tier 2 a clap layers onto beats 2 & 4 (steps 4/12).
    scheduleStep(step, time, tier) {
        const isQuarterBeat = step % 4 === 0;
        const isOffbeat = step % 4 === 2;

        if (isQuarterBeat) {
            this.playKick(time);
        }
        if (isOffbeat) {
            this.playBass(time, tier);
        }
        if (tier >= 1 ? true : isOffbeat) {
            this.playHiHat(time);
        }
        if (tier >= 2 && (step === 4 || step === 12)) {
            this.playClap(time);
        }
    }

    // Classic synthesized kick: a sine oscillator whose pitch drops sharply
    // from ~150Hz to ~45Hz over the attack, with a fast exponential decay —
    // this fast pitch-drop + decay is what reads as a punchy "don" thump.
    playKick(time) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.1);

        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.25);
        // stop() halts playback but leaves the nodes wired into the audio
        // graph until disconnected — at high tiers this fires close to every
        // frame, so clean up promptly rather than leaving it to the GC.
        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    // A short burst of high-passed white noise for a closed-hi-hat "tick".
    playHiHat(time) {
        const ctx = this.ctx;
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.05));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + 0.05);
        noise.onended = () => {
            noise.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }

    // Band-passed white noise burst for a clap/snare accent — layered onto
    // beats 2 & 4 once the tier is high enough to add it.
    playClap(time) {
        const ctx = this.ctx;
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.15));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        filter.Q.value = 0.8;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.45, time + 0.005); // fast attack, "clap" transient
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + 0.15);
        noise.onended = () => {
            noise.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }

    // A short, low sawtooth stab (through a lowpass filter for warmth) on
    // the off-beat — this is what gives the loop its driving, restless feel
    // rather than just a bare kick pattern. The filter opens up (brighter,
    // more present) at higher tiers.
    playBass(time, tier) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(55, time); // A1

        filter.type = 'lowpass';
        filter.frequency.value = BASS_FILTER_BASE + tier * BASS_FILTER_STEP_PER_TIER;

        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.2);
        osc.onended = () => {
            osc.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }
}
