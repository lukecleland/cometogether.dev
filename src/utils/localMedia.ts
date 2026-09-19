/** Preserve whichever device is available when a combined request fails. */
export async function acquireLocalMedia(): Promise<{ stream: MediaStream; error: string | null }> {
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia) {
    return { stream: new MediaStream(), error: "Camera and microphone require a supported browser and HTTPS. You can still use the board." };
  }
  try {
    return { stream: await devices.getUserMedia({ video: true, audio: true }), error: null };
  } catch {
    // A missing, busy or denied camera must not discard a working microphone.
    const tracks: MediaStreamTrack[] = [];
    for (const constraints of [{ audio: true }, { video: true }]) {
      try {
        tracks.push(...(await devices.getUserMedia(constraints)).getTracks());
      } catch {
        // The other device can still be available.
      }
    }
    const stream = new MediaStream(tracks);
    const missing = [!stream.getAudioTracks().length && "Microphone", !stream.getVideoTracks().length && "Camera"].filter(Boolean);
    return { stream, error: missing.length ? `${missing.join(" and ")} unavailable. Check browser permissions and device access, then retry. You can still use the board.` : null };
  }
}
