/**
 * Audio Service for processing Gemini TTS Output.
 * 
 * The Gemini API returns raw PCM (Pulse Code Modulation) data, not standard
 * file formats like MP3 or WAV. The browser's standard `decodeAudioData` usually
 * expects a file header. Therefore, we must manually construct the AudioBuffer
 * from the raw bytes.
 */

/**
 * Decodes Base64 to Uint8Array.
 */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw PCM data to an AudioBuffer.
 * Assumes 16-bit little-endian integer PCM.
 * 
 * @param data Raw byte data
 * @param ctx The AudioContext to create the buffer in
 * @param sampleRate The sample rate of the audio (e.g., 24000Hz for Gemini)
 * @param numChannels Number of audio channels (e.g., 1 for mono)
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize Int16 to Float32 [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Plays raw PCM audio from a Base64 string.
 * This is the main public method used by the UI.
 * 
 * @param base64String Raw PCM audio data encoded in Base64
 */
export async function playRawAudio(base64String: string) {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    console.error("AudioContext not supported");
    return;
  }

  // Gemini TTS standard sample rate is 24000Hz
  const audioContext = new AudioContextClass({ sampleRate: 24000 });
  
  try {
    const bytes = decode(base64String);
    const audioBuffer = await decodeAudioData(bytes, audioContext, 24000, 1);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (error) {
    console.error("Error playing audio:", error);
  }
}