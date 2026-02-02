/**
 * Audio Processing Service for Realtime API
 *
 * Handles loading audio files and converting them to the format required
 * by OpenAI's Realtime API: PCM 16-bit, 24kHz, mono.
 */

import { readFile } from "fs/promises";
import path from "path";

// Target format for OpenAI Realtime API
const TARGET_SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2; // 16-bit = 2 bytes
const CHUNK_SIZE = 4096; // Samples per chunk (matching client implementation)

export interface AudioData {
  /** PCM 16-bit audio data as Buffer */
  pcmData: Buffer;
  /** Sample rate of the audio */
  sampleRate: number;
  /** Number of channels (1 for mono) */
  channels: number;
  /** Duration in seconds */
  duration: number;
}

export interface AudioChunk {
  /** Base64-encoded PCM audio chunk */
  base64: string;
  /** Index of this chunk */
  index: number;
  /** Whether this is the last chunk */
  isLast: boolean;
}

/**
 * Load audio file and convert to PCM format for Realtime API
 *
 * @param audioPath - Path relative to public/ directory
 * @returns Audio data in PCM 16-bit, 24kHz mono format
 */
export async function loadAudioFile(audioPath: string): Promise<AudioData> {
  const fullPath = path.join(process.cwd(), "public", audioPath);
  console.log(`[Audio] Loading audio file: ${fullPath}`);

  const buffer = await readFile(fullPath);
  const ext = path.extname(audioPath).toLowerCase();

  let audioData: AudioData;

  switch (ext) {
    case ".wav":
      audioData = parseWavFile(buffer);
      break;
    case ".pcm":
    case ".raw":
      // Assume raw PCM 16-bit, 24kHz mono
      audioData = {
        pcmData: buffer,
        sampleRate: TARGET_SAMPLE_RATE,
        channels: 1,
        duration: buffer.length / (TARGET_SAMPLE_RATE * BYTES_PER_SAMPLE),
      };
      break;
    default:
      throw new Error(`Unsupported audio format: ${ext}. Supported: .wav, .pcm, .raw`);
  }

  console.log(`[Audio] Loaded: ${audioData.duration.toFixed(2)}s, ${audioData.sampleRate}Hz, ${audioData.channels}ch`);

  // Resample if needed
  if (audioData.sampleRate !== TARGET_SAMPLE_RATE) {
    console.log(`[Audio] Resampling from ${audioData.sampleRate}Hz to ${TARGET_SAMPLE_RATE}Hz`);
    audioData = resampleAudio(audioData, TARGET_SAMPLE_RATE);
  }

  // Convert to mono if stereo
  if (audioData.channels > 1) {
    console.log(`[Audio] Converting ${audioData.channels} channels to mono`);
    audioData = convertToMono(audioData);
  }

  console.log(`[Audio] Final: ${audioData.duration.toFixed(2)}s, ${audioData.pcmData.length} bytes`);

  return audioData;
}

/**
 * Parse WAV file and extract PCM data
 */
function parseWavFile(buffer: Buffer): AudioData {
  // WAV file header structure:
  // Bytes 0-3: "RIFF"
  // Bytes 4-7: File size - 8
  // Bytes 8-11: "WAVE"
  // Bytes 12-15: "fmt "
  // Bytes 16-19: Format chunk size (16 for PCM)
  // Bytes 20-21: Audio format (1 = PCM)
  // Bytes 22-23: Number of channels
  // Bytes 24-27: Sample rate
  // Bytes 28-31: Byte rate
  // Bytes 32-33: Block align
  // Bytes 34-35: Bits per sample
  // ... data chunk follows

  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);

  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV file format");
  }

  // Find fmt chunk
  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);

      if (audioFormat !== 1) {
        throw new Error(`Unsupported audio format: ${audioFormat}. Only PCM (1) is supported.`);
      }
      if (bitsPerSample !== 16) {
        throw new Error(`Unsupported bits per sample: ${bitsPerSample}. Only 16-bit is supported.`);
      }
    } else if (chunkId === "data") {
      // Found data chunk
      const pcmData = buffer.subarray(offset + 8, offset + 8 + chunkSize);

      return {
        pcmData: Buffer.from(pcmData),
        sampleRate,
        channels,
        duration: pcmData.length / (sampleRate * channels * BYTES_PER_SAMPLE),
      };
    }

    offset += 8 + chunkSize;
  }

  throw new Error("No data chunk found in WAV file");
}

/**
 * Resample audio to target sample rate using linear interpolation
 */
function resampleAudio(audio: AudioData, targetRate: number): AudioData {
  const sourceRate = audio.sampleRate;
  const ratio = targetRate / sourceRate;

  const sourceSamples = audio.pcmData.length / (audio.channels * BYTES_PER_SAMPLE);
  const targetSamples = Math.floor(sourceSamples * ratio);

  const sourceData = new Int16Array(
    audio.pcmData.buffer,
    audio.pcmData.byteOffset,
    audio.pcmData.length / BYTES_PER_SAMPLE
  );

  const targetData = new Int16Array(targetSamples * audio.channels);

  for (let ch = 0; ch < audio.channels; ch++) {
    for (let i = 0; i < targetSamples; i++) {
      const srcIdx = i / ratio;
      const srcIdxFloor = Math.floor(srcIdx);
      const srcIdxCeil = Math.min(srcIdxFloor + 1, sourceSamples - 1);
      const frac = srcIdx - srcIdxFloor;

      const sample1 = sourceData[srcIdxFloor * audio.channels + ch];
      const sample2 = sourceData[srcIdxCeil * audio.channels + ch];

      targetData[i * audio.channels + ch] = Math.round(sample1 + frac * (sample2 - sample1));
    }
  }

  return {
    pcmData: Buffer.from(targetData.buffer),
    sampleRate: targetRate,
    channels: audio.channels,
    duration: targetSamples / targetRate,
  };
}

/**
 * Convert stereo audio to mono by averaging channels
 */
function convertToMono(audio: AudioData): AudioData {
  if (audio.channels === 1) {
    return audio;
  }

  const samples = audio.pcmData.length / (audio.channels * BYTES_PER_SAMPLE);
  const sourceData = new Int16Array(
    audio.pcmData.buffer,
    audio.pcmData.byteOffset,
    audio.pcmData.length / BYTES_PER_SAMPLE
  );

  const monoData = new Int16Array(samples);

  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let ch = 0; ch < audio.channels; ch++) {
      sum += sourceData[i * audio.channels + ch];
    }
    monoData[i] = Math.round(sum / audio.channels);
  }

  return {
    pcmData: Buffer.from(monoData.buffer),
    sampleRate: audio.sampleRate,
    channels: 1,
    duration: audio.duration,
  };
}

/**
 * Split audio data into chunks for streaming
 *
 * @param audio - Audio data to chunk
 * @param chunkSamples - Number of samples per chunk (default: 4096)
 * @returns Generator yielding audio chunks
 */
export function* chunkAudio(audio: AudioData, chunkSamples: number = CHUNK_SIZE): Generator<AudioChunk> {
  const totalSamples = audio.pcmData.length / BYTES_PER_SAMPLE;
  const totalChunks = Math.ceil(totalSamples / chunkSamples);

  let index = 0;

  for (let offset = 0; offset < audio.pcmData.length; offset += chunkSamples * BYTES_PER_SAMPLE) {
    const chunkEnd = Math.min(offset + chunkSamples * BYTES_PER_SAMPLE, audio.pcmData.length);
    const chunk = audio.pcmData.subarray(offset, chunkEnd);

    yield {
      base64: chunk.toString("base64"),
      index,
      isLast: index === totalChunks - 1,
    };

    index++;
  }
}

/**
 * Convert entire audio to base64 for single transmission
 * (useful for short audio clips)
 */
export function audioToBase64(audio: AudioData): string {
  return audio.pcmData.toString("base64");
}

/**
 * Get audio statistics for logging
 */
export function getAudioStats(audio: AudioData): string {
  const chunks = Math.ceil(audio.pcmData.length / (CHUNK_SIZE * BYTES_PER_SAMPLE));
  return `${audio.duration.toFixed(2)}s, ${audio.sampleRate}Hz, ${audio.channels}ch, ${audio.pcmData.length} bytes, ${chunks} chunks`;
}
