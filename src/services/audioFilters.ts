import { AudioFilterId } from '../types/audio';

export interface AudioFilterPreset {
  id: AudioFilterId;
  label: string;
  description: string;
}

export const AUDIO_FILTER_PRESETS: AudioFilterPreset[] = [
  { id: 'none', label: 'Normal', description: 'Sonido limpio original' },
  { id: 'muffled_house', label: 'Piso de abajo', description: 'Música sonando en otra planta o pared' },
  { id: 'behind_door', label: 'Tras puerta', description: 'Detrás de una puerta cerrada' },
  { id: 'far_away', label: 'Lejos', description: 'Sonido lejano a la distancia' },
  { id: 'underwater', label: 'Bajo el agua', description: 'Sumergido con resonancia líquida' },
  { id: 'echo_cave', label: 'Eco / Caverna', description: 'Ecos profundos en piedra o mazmorra' },
  { id: 'cathedral', label: 'Catedral', description: 'Reverberación amplia de templo' },
  { id: 'dream_ethereal', label: 'Etéreo', description: 'Atmósfera onírica / plano feérico' },
];

interface FilterParams {
  lowpassFreq: number;
  lowpassQ: number;
  highpassFreq: number;
  highpassQ: number;
  shelfFreq: number;
  shelfGainDb: number;
  dryGain: number;
  reverbMix: number;
  reverbDecaySec: number;
  delayTimeSec: number;
  delayFeedback: number;
  delayMix: number;
  delayDampFreq: number;
  lfoDepthHz: number;
  lfoRateHz: number;
}

const PRESET_PARAMS: Record<AudioFilterId, FilterParams> = {
  none: {
    lowpassFreq: 22000,
    lowpassQ: 0.7,
    highpassFreq: 20,
    highpassQ: 0.7,
    shelfFreq: 120,
    shelfGainDb: 0,
    dryGain: 1,
    reverbMix: 0,
    reverbDecaySec: 1.0,
    delayTimeSec: 0.25,
    delayFeedback: 0,
    delayMix: 0,
    delayDampFreq: 4000,
    lfoDepthHz: 0,
    lfoRateHz: 0.4,
  },
  muffled_house: {
    lowpassFreq: 310,
    lowpassQ: 0.9,
    highpassFreq: 35,
    highpassQ: 0.7,
    shelfFreq: 95,
    shelfGainDb: 5,
    dryGain: 0.95,
    reverbMix: 0.16,
    reverbDecaySec: 0.9,
    delayTimeSec: 0.12,
    delayFeedback: 0.08,
    delayMix: 0.06,
    delayDampFreq: 450,
    lfoDepthHz: 0,
    lfoRateHz: 0.3,
  },
  behind_door: {
    lowpassFreq: 520,
    lowpassQ: 1.15,
    highpassFreq: 75,
    highpassQ: 0.8,
    shelfFreq: 160,
    shelfGainDb: 3.5,
    dryGain: 0.72,
    reverbMix: 0.14,
    reverbDecaySec: 0.8,
    delayTimeSec: 0.1,
    delayFeedback: 0.05,
    delayMix: 0.05,
    delayDampFreq: 650,
    lfoDepthHz: 0,
    lfoRateHz: 0.3,
  },
  far_away: {
    lowpassFreq: 1550,
    lowpassQ: 0.65,
    highpassFreq: 320,
    highpassQ: 0.7,
    shelfFreq: 200,
    shelfGainDb: -4,
    dryGain: 0.45,
    reverbMix: 0.28,
    reverbDecaySec: 1.8,
    delayTimeSec: 0.22,
    delayFeedback: 0.15,
    delayMix: 0.12,
    delayDampFreq: 1400,
    lfoDepthHz: 0,
    lfoRateHz: 0.3,
  },
  underwater: {
    lowpassFreq: 250,
    lowpassQ: 4.2,
    highpassFreq: 45,
    highpassQ: 0.8,
    shelfFreq: 110,
    shelfGainDb: 4,
    dryGain: 0.82,
    reverbMix: 0.32,
    reverbDecaySec: 1.5,
    delayTimeSec: 0.18,
    delayFeedback: 0.24,
    delayMix: 0.18,
    delayDampFreq: 380,
    lfoDepthHz: 85,
    lfoRateHz: 0.45,
  },
  echo_cave: {
    lowpassFreq: 4200,
    lowpassQ: 0.8,
    highpassFreq: 160,
    highpassQ: 0.75,
    shelfFreq: 250,
    shelfGainDb: -2,
    dryGain: 0.8,
    reverbMix: 0.48,
    reverbDecaySec: 2.3,
    delayTimeSec: 0.34,
    delayFeedback: 0.44,
    delayMix: 0.36,
    delayDampFreq: 2100,
    lfoDepthHz: 0,
    lfoRateHz: 0.3,
  },
  cathedral: {
    lowpassFreq: 9000,
    lowpassQ: 0.7,
    highpassFreq: 110,
    highpassQ: 0.7,
    shelfFreq: 180,
    shelfGainDb: -1.5,
    dryGain: 0.74,
    reverbMix: 0.62,
    reverbDecaySec: 3.4,
    delayTimeSec: 0.14,
    delayFeedback: 0.18,
    delayMix: 0.16,
    delayDampFreq: 3500,
    lfoDepthHz: 0,
    lfoRateHz: 0.3,
  },
  dream_ethereal: {
    lowpassFreq: 3000,
    lowpassQ: 1.5,
    highpassFreq: 180,
    highpassQ: 0.7,
    shelfFreq: 150,
    shelfGainDb: -2,
    dryGain: 0.64,
    reverbMix: 0.68,
    reverbDecaySec: 3.2,
    delayTimeSec: 0.28,
    delayFeedback: 0.38,
    delayMix: 0.32,
    delayDampFreq: 2600,
    lfoDepthHz: 420,
    lfoRateHz: 0.22,
  },
};

function createImpulseResponse(
  ctx: AudioContext,
  durationSec: number,
  decayPower: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch += 1) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i += 1) {
      const n = i / length;
      const env = Math.pow(1 - n, decayPower);
      const white = Math.random() * 2 - 1;
      // Gentle smoothing so room reverb sounds warm rather than harsh white noise
      lp = lp * 0.45 + white * 0.55;
      data[i] = lp * env;
    }
  }
  return impulse;
}

class AudioFilterEngine {
  private ctx: AudioContext | null = null;
  private inputBus: GainNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private lowShelf: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;
  private wetReverbGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayDamp: BiquadFilterNode | null = null;
  private wetDelayGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private attachedSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private impulseCache = new Map<string, AudioBuffer>();
  private currentPreset: AudioFilterId = 'none';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    if (!this.ctx) {
      const ctx = new Ctor();
      this.ctx = ctx;

      const inputBus = ctx.createGain();
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';

      const dryGain = ctx.createGain();
      const wetReverbGain = ctx.createGain();
      const convolver = ctx.createConvolver();

      const delayNode = ctx.createDelay(2.0);
      const delayFeedback = ctx.createGain();
      const delayDamp = ctx.createBiquadFilter();
      delayDamp.type = 'lowpass';
      const wetDelayGain = ctx.createGain();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -8;
      compressor.knee.value = 12;
      compressor.ratio.value = 3;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(lowpass.frequency);
      lfo.start();

      // Main EQ chain
      inputBus.connect(highpass);
      highpass.connect(lowShelf);
      lowShelf.connect(lowpass);

      // Dry path
      lowpass.connect(dryGain);
      dryGain.connect(compressor);

      // Reverb path
      lowpass.connect(convolver);
      convolver.connect(wetReverbGain);
      wetReverbGain.connect(compressor);

      // Echo feedback loop
      lowpass.connect(delayNode);
      delayNode.connect(delayDamp);
      delayDamp.connect(wetDelayGain);
      wetDelayGain.connect(compressor);
      delayDamp.connect(delayFeedback);
      delayFeedback.connect(delayNode);

      compressor.connect(ctx.destination);

      this.inputBus = inputBus;
      this.highpass = highpass;
      this.lowpass = lowpass;
      this.lowShelf = lowShelf;
      this.dryGain = dryGain;
      this.wetReverbGain = wetReverbGain;
      this.convolver = convolver;
      this.delayNode = delayNode;
      this.delayFeedback = delayFeedback;
      this.delayDamp = delayDamp;
      this.wetDelayGain = wetDelayGain;
      this.lfo = lfo;
      this.lfoGain = lfoGain;
      this.compressor = compressor;

      this.applyPreset(this.currentPreset);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public resume(): void {
    this.ensureContext();
  }

  public isElementAttached(audioEl: HTMLAudioElement): boolean {
    return this.attachedSources.has(audioEl);
  }

  public attachAudioElement(audioEl: HTMLAudioElement): boolean {
    if (this.attachedSources.has(audioEl)) {
      if (this.ctx?.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.inputBus) return false;

    try {
      const src = ctx.createMediaElementSource(audioEl);
      src.connect(this.inputBus);
      this.attachedSources.set(audioEl, src);
      return true;
    } catch {
      return false;
    }
  }

  public applyPreset(presetId: AudioFilterId): void {
    this.currentPreset = presetId;
    const ctx = this.ctx;
    if (
      !ctx ||
      !this.highpass ||
      !this.lowpass ||
      !this.lowShelf ||
      !this.dryGain ||
      !this.wetReverbGain ||
      !this.convolver ||
      !this.delayNode ||
      !this.delayFeedback ||
      !this.delayDamp ||
      !this.wetDelayGain ||
      !this.lfo ||
      !this.lfoGain
    ) {
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const p = PRESET_PARAMS[presetId] || PRESET_PARAMS.none;
    const now = ctx.currentTime;
    const ramp = 0.06;

    this.lowpass.frequency.setTargetAtTime(p.lowpassFreq, now, ramp);
    this.lowpass.Q.setTargetAtTime(p.lowpassQ, now, ramp);
    this.highpass.frequency.setTargetAtTime(p.highpassFreq, now, ramp);
    this.highpass.Q.setTargetAtTime(p.highpassQ, now, ramp);
    this.lowShelf.frequency.setTargetAtTime(p.shelfFreq, now, ramp);
    this.lowShelf.gain.setTargetAtTime(p.shelfGainDb, now, ramp);

    this.dryGain.gain.setTargetAtTime(p.dryGain, now, ramp);
    this.wetReverbGain.gain.setTargetAtTime(p.reverbMix, now, ramp);

    if (p.reverbMix > 0) {
      const irKey = `${p.reverbDecaySec.toFixed(1)}`;
      let buf = this.impulseCache.get(irKey);
      if (!buf) {
        buf = createImpulseResponse(ctx, p.reverbDecaySec, 2.6);
        this.impulseCache.set(irKey, buf);
      }
      if (this.convolver.buffer !== buf) {
        this.convolver.buffer = buf;
      }
    }

    this.delayNode.delayTime.setTargetAtTime(p.delayTimeSec, now, ramp);
    this.delayFeedback.gain.setTargetAtTime(p.delayFeedback, now, ramp);
    this.delayDamp.frequency.setTargetAtTime(p.delayDampFreq, now, ramp);
    this.wetDelayGain.gain.setTargetAtTime(p.delayMix, now, ramp);

    this.lfo.frequency.setTargetAtTime(p.lfoRateHz, now, ramp);
    this.lfoGain.gain.setTargetAtTime(p.lfoDepthHz, now, ramp);
  }
}

export const audioFilterEngine = new AudioFilterEngine();
