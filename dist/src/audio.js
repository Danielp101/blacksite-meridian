export class GameAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
  }

  async unlock() {
    if (!this.enabled) return false;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      this.enabled = false;
      return false;
    }
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    return true;
  }

  tone({ frequency = 220, endFrequency = frequency, duration = 0.08, gain = 0.05, type = 'square' } = {}) {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  shot() { this.tone({ frequency: 150, endFrequency: 48, duration: 0.1, gain: 0.1, type: 'sawtooth' }); }
  empty() { this.tone({ frequency: 1000, endFrequency: 760, duration: 0.025, gain: 0.025 }); }
  hit() { this.tone({ frequency: 880, endFrequency: 520, duration: 0.055, gain: 0.035, type: 'sine' }); }
  kill() { this.hit(); setTimeout(() => this.tone({ frequency: 520, endFrequency: 900, duration: 0.08, gain: 0.025, type: 'sine' }), 45); }
  hurt() { this.tone({ frequency: 90, endFrequency: 42, duration: 0.18, gain: 0.08, type: 'sawtooth' }); }
  reload() { this.tone({ frequency: 180, endFrequency: 230, duration: 0.045, gain: 0.025 }); }
  wave() { this.tone({ frequency: 260, endFrequency: 520, duration: 0.32, gain: 0.04, type: 'sine' }); }
}

export async function unlockAudioSafely(audio) {
  try {
    return await audio.unlock();
  } catch {
    audio.enabled = false;
    return false;
  }
}
