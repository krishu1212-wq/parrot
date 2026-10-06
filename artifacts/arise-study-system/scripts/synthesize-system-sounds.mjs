// Original sine-based ARISE cues. No recordings, melodies, or third-party samples.
import { mkdirSync, writeFileSync } from 'node:fs';
const target = new URL('../assets/sounds/', import.meta.url);
mkdirSync(target, { recursive: true });
const cues = {
  xp: [880, 1174], quest: [523, 659, 784], level: [392, 587, 784, 1046],
  rank: [330, 494, 659, 988, 1318], unlock: [440, 880, 1108],
  streak: [660, 880, 1320], boss: [146, 220, 293], achievement: [587, 740, 1174],
  notification: [784, 988], reward: [440, 554, 880, 1108],
};
for (const [name, frequencies] of Object.entries(cues)) {
  const rate = 22050, noteSeconds = 0.105;
  const count = Math.ceil(rate * (noteSeconds * frequencies.length + 0.07));
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const index = Math.floor(t / noteSeconds);
    const local = t - index * noteSeconds;
    const frequency = frequencies[index];
    const envelope = Math.min(1, local / 0.012) * Math.max(0, 1 - local / noteSeconds) ** 2;
    const sample = frequency ? Math.sin(2 * Math.PI * frequency * local) * envelope * 0.22 : 0;
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  writeFileSync(new URL(`${name}.wav`, target), wav);
}