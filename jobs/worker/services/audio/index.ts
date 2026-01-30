/**
 * Audio Service - Handles loading and processing audio files
 *
 * Supports loading audio files from disk and converting to base64
 * for direct input to multimodal LLM models like gpt-4o-audio.
 */
import { readFile } from "fs/promises";
import path from "path";

export type AudioFormat = "wav" | "mp3" | "m4a" | "flac" | "ogg";

export type AudioData = {
  data: string; // base64 encoded
  format: AudioFormat;
  sizeBytes: number;
};

/**
 * Load an audio file and convert to base64
 *
 * @param audioPath - Path relative to /public directory
 * @returns Base64 encoded audio data with format info
 */
export async function loadAudioAsBase64(audioPath: string): Promise<AudioData> {
  // Resolve path relative to public directory
  const fullPath = path.join(process.cwd(), "public", audioPath);

  console.log(`[Audio] Loading: ${fullPath}`);

  try {
    const buffer = await readFile(fullPath);
    const ext = path.extname(audioPath).toLowerCase().slice(1);

    // Map extension to format
    const formatMap: Record<string, AudioFormat> = {
      wav: "wav",
      mp3: "mp3",
      m4a: "m4a",
      flac: "flac",
      ogg: "ogg",
    };

    const format = formatMap[ext];
    if (!format) {
      throw new Error(
        `Unsupported audio format: .${ext}. Supported: wav, mp3, m4a, flac, ogg`
      );
    }

    const base64 = buffer.toString("base64");

    console.log(`[Audio] Loaded ${buffer.length} bytes (${format})`);

    return {
      data: base64,
      format,
      sizeBytes: buffer.length,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Audio file not found: ${fullPath}`);
    }
    throw error;
  }
}

/**
 * Get MIME type for an audio format
 */
export function getAudioMimeType(format: AudioFormat): string {
  const mimeTypes: Record<AudioFormat, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    ogg: "audio/ogg",
  };

  return mimeTypes[format];
}
