import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { DawPanDial } from "./DawPanDial";
import { DawMenu, type DawMenuItem } from "./DawMenu";
import { DawTransportIcon } from "./DawTransportIcon";
import { dawShortcut } from "../utils/dawShortcuts";
import type { RecordingClip } from "../types/panels";
import {
  audibleTracks,
  visibleRegions,
  mergeDawTrack,
  mergeDawRegions,
  splitDawRegion,
  type DawRegion,
  dawEnd,
  encodeWav,
  MAX_DAW_FILE_BYTES,
  MAX_DAW_SECONDS,
  scheduleDaw,
  type DawTrack,
} from "../utils/daw";

interface Props {
  title: string;
  tracks: DawTrack[];
  recordings: RecordingClip[];
  onTrack: (track: DawTrack) => void;
  onFile: (recording: RecordingClip) => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleDock: () => void;
  transferProgress?: number;
  minimized?: boolean;
}

const button =
  "rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed";
const colours = ["#34d399", "#a78bfa", "#38bdf8", "#fbbf24", "#fb7185"];
const time = (seconds: number) => {
  const tenths = Math.max(0, Math.floor(seconds * 10));
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
};

function Waveform({
  buffer,
  track,
}: {
  buffer?: AudioBuffer;
  track: DawRegion;
}) {
  if (!buffer) return null;
  const samples = buffer.getChannelData(0);
  const begin = Math.floor(track.trimStart * buffer.sampleRate);
  const length = Math.floor(
    (track.trimEnd - track.trimStart) * buffer.sampleRate,
  );
  const bars = Array.from({ length: 160 }, (_, i) => {
    let peak = 0;
    const from = begin + Math.floor((i * length) / 160);
    const to = Math.min(
      samples.length,
      begin + Math.floor(((i + 1) * length) / 160),
    );
    const step = Math.max(1, Math.floor((to - from) / 80));
    for (let j = from; j < to; j += step)
      peak = Math.max(peak, Math.abs(samples[j]));
    return `M${i * 3} ${25 - peak * 23}v${Math.max(1, peak * 46)}`;
  }).join("");
  return (
    <svg
      viewBox="0 0 480 50"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden="true"
    >
      <path d={bars} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function DawWidget({
  title,
  tracks,
  recordings,
  onTrack,
  onFile,
  onClose,
  onMinimize,
  onToggleDock,
  transferProgress,
  minimized = false,
}: Props) {
  const contextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef(new Map<string, AudioBuffer>());
  const filesRef = useRef(new Map<string, File>());
  const [buffers, setBuffers] = useState(new Map<string, AudioBuffer>());
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    kind: string;
    x: number;
    y: number;
    trackId?: string;
    regionId?: string;
  } | null>(null);
  const clipboard = useRef<DawRegion | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [zoom, setZoom] = useState(20);
  const rootRef = useRef<HTMLDivElement>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTake, setLiveTake] = useState<{
    trackId: string;
    start: number;
  } | null>(null);
  const [livePeaks, setLivePeaks] = useState<{ at: number; peak: number }[]>(
    [],
  );
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const recordingStartedRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const relinkRef = useRef<DawRegion | null>(null);
  const aliveRef = useRef(true);
  const revisionRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const transportRequestRef = useRef(0);
  const transportRef = useRef({ active: false, at: 0, offset: 0 });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    id: string;
    x: number;
    region: DawRegion;
    edge: string;
    pixelsPerSecond: number;
  } | null>(null);
  const active = tracks.filter((t) => !t.deleted);
  const selectedTrack = active.find((t) => t.id === selected);
  const selectedRegion =
    selectedTrack &&
    visibleRegions(selectedTrack).find((r) => r.id === selectedRegionId);
  const duration = dawEnd(tracks);
  const cursor =
    recording && liveTake ? liveTake.start + recordingSeconds : playhead;
  const timelineSeconds = Math.max(
    30,
    duration + 5,
    Math.ceil((cursor + 5) / 30) * 30,
  );
  const timelineWidth = Math.max(500, timelineSeconds * zoom);
  const missing = audibleTracks(tracks).some((t) =>
    visibleRegions(t).some((r) => !buffers.has(r.sourceId)),
  );

  const context = () =>
    contextRef.current ?? (contextRef.current = new AudioContext());
  const stopSources = () => {
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* Already finished. */
      }
    });
    sourcesRef.current = [];
  };
  const stop = (reset = false) => {
    transportRequestRef.current++;
    const transport = transportRef.current;
    if (transport.active && contextRef.current)
      setPlayhead(
        reset
          ? 0
          : Math.min(
              duration,
              transport.offset + contextRef.current.currentTime - transport.at,
            ),
      );
    else if (reset) setPlayhead(0);
    transport.active = false;
    stopSources();
    setPlaying(false);
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      transportRef.current.active = false;
      sourcesRef.current.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* Finished. */
        }
      });
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
      microphoneSourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      micRef.current?.getTracks().forEach((track) => track.stop());
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const releaseKeyboard = (event: PointerEvent) => {
      if (
        root &&
        !root.contains(event.target as Node) &&
        root.contains(document.activeElement)
      ) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    document.addEventListener("pointerdown", releaseKeyboard, true);
    return () =>
      document.removeEventListener("pointerdown", releaseKeyboard, true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const decode = async () => {
      for (const clip of recordings) {
        if (filesRef.current.get(clip.id) === clip.file) continue;
        try {
          const decoded = await context().decodeAudioData(
            await clip.file.arrayBuffer(),
          );
          if (cancelled) return;
          filesRef.current.set(clip.id, clip.file);
          buffersRef.current.set(clip.id, decoded);
          setBuffers(new Map(buffersRef.current));
        } catch {
          if (!cancelled)
            setError(
              `Could not decode ${clip.name}. Try a WAV, MP3 or another browser-supported audio file.`,
            );
        }
      }
    };
    void decode();
    return () => {
      cancelled = true;
    };
  }, [recordings]);

  // Rebuild the remaining schedule on shared edits, retaining the local playhead.
  useEffect(() => {
    const transport = transportRef.current;
    const ctx = contextRef.current;
    if (!transport.active || !ctx) return;
    const position = transport.offset + ctx.currentTime - transport.at;
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* Finished. */
      }
    });
    sourcesRef.current = scheduleDaw(
      ctx,
      tracks,
      buffers,
      position,
      ctx.currentTime,
    );
    transport.offset = position;
    transport.at = ctx.currentTime;
  }, [tracks, buffers]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const t = transportRef.current;
      if (!t.active || !contextRef.current) return;
      const position = t.offset + contextRef.current.currentTime - t.at;
      if (position >= duration) {
        t.active = false;
        sourcesRef.current.forEach((source) => {
          try {
            source.stop();
          } catch {
            /* Finished. */
          }
        });
        sourcesRef.current = [];
        setPlaying(false);
        setPlayhead(0);
      } else setPlayhead(position);
    }, 50);
    return () => clearInterval(timer);
  }, [playing, duration]);

  useEffect(() => {
    if (!recording) return;
    const samples = new Float32Array(analyserRef.current?.fftSize ?? 2048);
    const timer = setInterval(() => {
      const elapsed = (performance.now() - recordingStartedRef.current) / 1000;
      setRecordingSeconds(elapsed);
      analyserRef.current?.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      setLivePeaks((points) => [...points, { at: elapsed, peak }]);
    }, 50);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!recording || !liveTake || !timelineRef.current) return;
    const node = timelineRef.current;
    const x = 230 + (cursor / timelineSeconds) * timelineWidth;
    if (
      x > node.scrollLeft + node.clientWidth - 40 ||
      x < node.scrollLeft + 230
    )
      node.scrollLeft = Math.max(0, x - node.clientWidth + 80);
  }, [recording, liveTake, cursor, timelineSeconds, timelineWidth]);

  const revision = () => {
    revisionRef.current =
      Math.max(
        revisionRef.current,
        ...tracksRef.current.flatMap((t) => [
          t.revision,
          ...t.regions.map((r) => r.revision),
        ]),
      ) + 1;
    return { revision: revisionRef.current, editId: crypto.randomUUID() };
  };
  const sendTrack = (track: DawTrack) => {
    tracksRef.current = mergeDawTrack(tracksRef.current, track);
    onTrack(track);
  };
  const publish = (track: DawTrack, patch: Partial<DawTrack> = {}) => {
    const latest = tracksRef.current.find((t) => t.id === track.id) ?? track;
    sendTrack({ ...latest, ...patch, ...revision() });
  };
  const publishRegions = (track: DawTrack, regions: DawRegion[]) => {
    const latest = tracksRef.current.find((t) => t.id === track.id) ?? track;
    if (latest.deleted) return;
    sendTrack({
      ...latest,
      regions: mergeDawRegions(
        latest.regions,
        regions.map((r) => ({ ...r, ...revision() })),
      ),
    });
  };
  const newTrack = (name = `Audio ${active.length + 1}`) => {
    const track: DawTrack = {
      id: crypto.randomUUID(),
      name,
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      regions: [],
      deleted: false,
      ...revision(),
    };
    sendTrack(track);
    setSelected(track.id);
    setSelectedRegionId(null);
    return track;
  };

  const addFiles = async (
    files: File[],
    relink: DawRegion | null = null,
    start = playhead,
    targetId = selected,
  ) => {
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        if (!file.size || file.size > MAX_DAW_FILE_BYTES)
          throw new Error("Choose recordings smaller than 50 MB.");
        const decoded = await context().decodeAudioData(
          await file.arrayBuffer(),
        );
        if (!aliveRef.current) return;
        if (
          !Number.isFinite(decoded.duration) ||
          decoded.duration <= 0 ||
          decoded.duration + (relink ? 0 : start) > MAX_DAW_SECONDS
        )
          throw new Error("Keep each project within 30 minutes.");
        if (relink && Math.abs(decoded.duration - relink.duration) > 0.1)
          throw new Error(
            "Choose the original recording with the same duration to restore this track.",
          );
        const sourceId = relink?.sourceId ?? crypto.randomUUID();
        buffersRef.current.set(sourceId, decoded);
        filesRef.current.set(sourceId, file);
        setBuffers(new Map(buffersRef.current));
        if (!relink) {
          const target = targetId
            ? tracksRef.current.find((t) => t.id === targetId && !t.deleted)
            : newTrack(file.name.slice(0, 200));
          if (!target)
            throw new Error(
              "The target track was removed. Add a track and import the recording again.",
            );
          const region: DawRegion = {
            id: crypto.randomUUID(),
            sourceId,
            name: file.name.slice(0, 200),
            duration: decoded.duration,
            start,
            trimStart: 0,
            trimEnd: decoded.duration,
            deleted: false,
            revision: 0,
            editId: "",
          };
          publishRegions(target, [region]);
          setSelected(target.id);
          setSelectedRegionId(region.id);
          if (targetId) start += decoded.duration;
        }
        onFile({ id: sourceId, name: file.name, file });
      }
    } catch (cause) {
      if (aliveRef.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load that recording.",
        );
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const currentPosition = () => {
    const transport = transportRef.current;
    return transport.active && contextRef.current
      ? Math.min(
          duration,
          transport.offset + contextRef.current.currentTime - transport.at,
        )
      : playhead;
  };

  const playFrom = async (position: number) => {
    if (recording || busy || !active.length || missing) return;
    const request = ++transportRequestRef.current;
    try {
      const ctx = context();
      await ctx.resume();
      if (!aliveRef.current || request !== transportRequestRef.current) return;
      const offset = Math.max(0, position >= duration ? 0 : position);
      stopSources();
      sourcesRef.current = scheduleDaw(
        ctx,
        tracks,
        buffersRef.current,
        offset,
        ctx.currentTime,
      );
      transportRef.current = { active: true, at: ctx.currentTime, offset };
      setPlayhead(offset);
      setPlaying(true);
      setError("");
    } catch {
      if (aliveRef.current)
        setError("Audio playback could not start. Try pressing Play again.");
    }
  };

  const finishRecording = () => {
    if (recorderRef.current?.state === "recording") {
      setBusy(true);
      recorderRef.current.stop();
    }
  };

  const togglePlay = () => {
    if (recording) {
      finishRecording();
      return;
    }
    if (busy) return;
    if (transportRef.current.active) stop();
    else void playFrom(playhead);
  };

  const stopTransport = () => {
    if (recording) finishRecording();
    stop();
  };

  const startRecording = async () => {
    if (recorderRef.current?.state === "recording") {
      finishRecording();
      return;
    }
    if (busy) return;
    const start = currentPosition();
    stop();
    const request = ++transportRequestRef.current;
    setBusy(true);
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Microphone recording is not available in this browser. You can still add audio files.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!aliveRef.current || request !== transportRequestRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micRef.current = stream;
      const ctx = context();
      await ctx.resume();
      if (!aliveRef.current || request !== transportRequestRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const target = selected
        ? tracksRef.current.find((t) => t.id === selected && !t.deleted)
        : newTrack();
      if (!target)
        throw new Error(
          "The selected track was removed. Select another track to record.",
        );
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      microphoneSourceRef.current = source;
      analyserRef.current = analyser;
      setLiveTake({ trackId: target.id, start });
      setLivePeaks([]);
      setSelected(target.id);
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
        size += event.data.size;
        if (size >= MAX_DAW_FILE_BYTES && recorder.state === "recording")
          recorder.stop();
      };
      recorder.onerror = () => {
        if (aliveRef.current)
          setError(
            "Microphone recording failed. Try again or add an audio file.",
          );
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        micRef.current = null;
        source.disconnect();
        analyser.disconnect();
        analyserRef.current = null;
        microphoneSourceRef.current = null;
        if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
        if (!aliveRef.current) return;
        setRecording(false);
        setPlayhead(
          start + (performance.now() - recordingStartedRef.current) / 1000,
        );
        setLiveTake(null);
        const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        const file = new File(
          chunks,
          `Take ${new Date().toLocaleTimeString().replaceAll(":", "-")}.${extension}`,
          { type },
        );
        void addFiles([file], null, start, target.id);
      };
      recorder.start(1000);
      recordingStartedRef.current = performance.now();
      setRecordingSeconds(0);
      setRecording(true);
      recordTimerRef.current = setTimeout(
        () => {
          if (recorder.state === "recording") recorder.stop();
        },
        Math.max(1000, (MAX_DAW_SECONDS - start - 1) * 1000),
      );
    } catch (cause) {
      microphoneSourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      setLiveTake(null);
      micRef.current?.getTracks().forEach((t) => t.stop());
      setError(
        cause instanceof Error
          ? cause.message
          : "Microphone access was denied.",
      );
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const exportMix = async () => {
    setBusy(true);
    setError("");
    try {
      const offline = new OfflineAudioContext(
        2,
        Math.ceil(duration * 44100),
        44100,
      );
      scheduleDaw(offline, tracks, buffersRef.current, 0, 0);
      const mixed = await offline.startRendering();
      if (!aliveRef.current) return;
      const url = URL.createObjectURL(encodeWav(mixed));
      const link = document.createElement("a");
      link.href = url;
      link.download = "cometogether-mix.wav";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not export this mix. Try a shorter arrangement.");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const seek = (position: number) => {
    if (recording || busy) return;
    const next = Math.max(0, Math.min(duration, position));
    if (transportRef.current.active && next < duration) void playFrom(next);
    else {
      stop();
      setPlayhead(next);
    }
  };
  const restart = () => seek(0);
  const moveRegion = (track: DawTrack, region: DawRegion, start: number) =>
    publishRegions(track, [
      {
        ...region,
        start: Math.max(
          0,
          Math.min(MAX_DAW_SECONDS - region.trimEnd + region.trimStart, start),
        ),
      },
    ]);
  const deleteRegion = (track = selectedTrack, region = selectedRegion) => {
    if (!track || !region || recording || busy) return;
    publishRegions(track, [{ ...region, deleted: true }]);
    setSelectedRegionId(null);
  };
  const duplicateRegion = (
    track = selectedTrack,
    region = selectedRegion,
    at?: number,
  ) => {
    if (!track || !region || recording || busy) return;
    const start = at ?? region.start + region.trimEnd - region.trimStart;
    if (start + region.trimEnd - region.trimStart > MAX_DAW_SECONDS) return;
    const copy = { ...region, id: crypto.randomUUID(), start, deleted: false };
    publishRegions(track, [copy]);
    setSelected(track.id);
    setSelectedRegionId(copy.id);
  };
  const splitRegion = (track = selectedTrack, region = selectedRegion) => {
    if (!track || !region || recording || busy) return;
    const parts = splitDawRegion(
      region,
      currentPosition(),
      crypto.randomUUID(),
    );
    if (parts) publishRegions(track, parts);
  };
  const menuTrack = active.find((t) => t.id === (menu?.trackId ?? selected));
  const menuRegion =
    menuTrack &&
    visibleRegions(menuTrack).find(
      (r) => r.id === (menu?.regionId ?? selectedRegionId),
    );
  const locked = busy || recording;
  const importAudio = () => {
    relinkRef.current = null;
    inputRef.current?.click();
  };
  const trackItems: DawMenuItem[] = [
    {
      label: "New Audio Track",
      shortcut: "⌥⌘N",
      action: () => {
        newTrack();
      },
      disabled: locked,
    },
    { label: "Import Audio…", action: importAudio, disabled: locked },
    {
      label: "Rename Track",
      action: () => setRenaming(menuTrack!.id),
      disabled: !menuTrack || locked,
    },
    {
      label: "Duplicate Track Settings",
      action: () => {
        const t = newTrack(`${menuTrack!.name} copy`);
        publish(t, {
          volume: menuTrack!.volume,
          pan: menuTrack!.pan,
          muted: menuTrack!.muted,
        });
      },
      disabled: !menuTrack || locked,
    },
    {
      label: "Center Pan",
      action: () => publish(menuTrack!, { pan: 0 }),
      disabled: !menuTrack,
    },
    {
      label: "Delete Track",
      danger: true,
      action: () => {
        publish(menuTrack!, { deleted: true });
        setSelected(null);
        setSelectedRegionId(null);
      },
      disabled: !menuTrack || locked,
    },
  ];
  const regionItems: DawMenuItem[] = [
    {
      label: "Copy Region",
      shortcut: "⌘C",
      action: () => {
        clipboard.current = menuRegion!;
      },
      disabled: !menuRegion,
    },
    {
      label: "Cut Region",
      shortcut: "⌘X",
      action: () => {
        clipboard.current = menuRegion!;
        deleteRegion(menuTrack, menuRegion);
      },
      disabled: !menuRegion || locked,
    },
    {
      label: "Paste at Playhead",
      shortcut: "⌘V",
      action: () =>
        duplicateRegion(
          menuTrack,
          clipboard.current ?? undefined,
          currentPosition(),
        ),
      disabled: !menuTrack || !clipboard.current || locked,
    },
    {
      label: "Duplicate Region",
      shortcut: "⌘D",
      action: () => duplicateRegion(menuTrack, menuRegion),
      disabled: !menuRegion || locked,
    },
    {
      label: "Split at Playhead",
      shortcut: "⌘T",
      action: () => splitRegion(menuTrack, menuRegion),
      disabled:
        !menuRegion ||
        locked ||
        !splitDawRegion(menuRegion, currentPosition(), "preview"),
    },
    {
      label: "Delete Region",
      shortcut: "Delete",
      danger: true,
      action: () => deleteRegion(menuTrack, menuRegion),
      disabled: !menuRegion || locked,
    },
  ];
  const menuItems =
    menu?.kind === "File"
      ? [
          { label: "Import Audio…", action: importAudio, disabled: locked },
          {
            label: "Export WAV…",
            action: () => {
              void exportMix();
            },
            disabled: !duration || missing || locked,
          },
        ]
      : menu?.kind === "View"
        ? [
            {
              label: "Zoom In",
              action: () => setZoom((z) => Math.min(80, z + 5)),
            },
            {
              label: "Zoom Out",
              action: () => setZoom((z) => Math.max(5, z - 5)),
            },
            {
              label: "Keyboard Shortcuts",
              action: () => setShowShortcuts((v) => !v),
            },
          ]
        : menu?.kind === "Track"
          ? trackItems
          : regionItems;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (minimized) return;
    // Keep canvas pan/laser shortcuts out of this window, including text inputs.
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const editing = !!target.closest(
      'input, textarea, select, [contenteditable="true"]',
    );
    const action = dawShortcut(
      { ...event, isComposing: event.nativeEvent.isComposing },
      editing,
    );
    if (!action) {
      // Swallow repeats of one-shot shortcuts instead of invoking a native
      // button click or browser bookmark action after the first keydown.
      if (
        event.repeat &&
        dawShortcut(
          {
            ...event,
            repeat: false,
            isComposing: event.nativeEvent.isComposing,
          },
          editing,
        )
      )
        event.preventDefault();
      return;
    }
    // Standard keyboard activation still works for window controls and help.
    if (
      (action === "play" || action === "restart") &&
      target.closest("[data-native-keys]")
    )
      return;
    event.preventDefault();
    switch (action) {
      case "play":
        togglePlay();
        break;
      case "record":
        void startRecording();
        break;
      case "restart":
        restart();
        break;
      case "delete":
        deleteRegion();
        break;
      case "duplicate":
        duplicateRegion();
        break;
      case "new-track":
        if (!locked) newTrack();
        break;
      case "copy":
        clipboard.current = selectedRegion ?? null;
        break;
      case "cut":
        clipboard.current = selectedRegion ?? null;
        deleteRegion();
        break;
      case "paste":
        duplicateRegion(
          selectedTrack,
          clipboard.current ?? undefined,
          currentPosition(),
        );
        break;
      case "split":
        splitRegion();
        break;
      case "mute":
        if (selectedTrack)
          publish(selectedTrack, { muted: !selectedTrack.muted });
        break;
      case "solo":
        if (selectedTrack)
          publish(selectedTrack, { solo: !selectedTrack.solo });
        break;
      case "previous-track":
      case "next-track": {
        const index = active.findIndex((t) => t.id === selected);
        const next =
          index < 0
            ? 0
            : Math.max(
                0,
                Math.min(
                  active.length - 1,
                  index + (action === "next-track" ? 1 : -1),
                ),
              );
        setSelected(active[next]?.id ?? null);
        setSelectedRegionId(null);
        rootRef.current
          ?.querySelector<HTMLElement>(
            `[data-track-row="${CSS.escape(active[next]?.id ?? "")}"]`,
          )
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        break;
      }
      case "seek-back":
        seek(currentPosition() - (event.shiftKey ? 5 : 1));
        break;
      case "seek-forward":
        seek(currentPosition() + (event.shiftKey ? 5 : 1));
        break;
      case "nudge-back":
      case "nudge-forward":
        if (selectedTrack && selectedRegion && !locked)
          moveRegion(
            selectedTrack,
            selectedRegion,
            selectedRegion.start +
              (action === "nudge-back" ? -1 : 1) * (event.shiftKey ? 1 : 0.1),
          );
        break;
      case "zoom-in":
        setZoom((z) => Math.min(80, z + 5));
        break;
      case "zoom-out":
        setZoom((z) => Math.max(5, z - 5));
        break;
      case "help":
        setShowShortcuts((show) => !show);
        break;
      case "escape":
        setShowShortcuts(false);
        setSelected(null);
        setSelectedRegionId(null);
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-label={`${title} multitrack editor`}
      aria-keyshortcuts="Space R Enter Delete Backspace M S Meta+D Control+D"
      data-daw-root
      onKeyDown={handleKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
      onFocusCapture={() => setKeyboardActive(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setKeyboardActive(false);
      }}
      onPointerDownCapture={(e) => {
        if (
          !(e.target as HTMLElement).closest(
            'input, textarea, select, [contenteditable="true"]',
          )
        )
          rootRef.current?.focus({ preventScroll: true });
      }}
      className="outline-none focus-within:ring-1 focus-within:ring-emerald-500/60 flex h-full flex-col overflow-hidden rounded-xl border border-emerald-900/60 bg-zinc-950 text-zinc-200 shadow-xl"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <span className="truncate text-sm font-semibold">
          <span className="mr-2 text-emerald-400">♫</span>
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-emerald-400">
            SHARED MULTITRACK
          </span>
          <button
            className={button}
            data-native-keys
            onClick={onToggleDock}
            aria-label="Bookmark DAW"
          >
            ◇
          </button>
          <button
            className={button}
            data-native-keys
            onClick={() => {
              (document.activeElement as HTMLElement | null)?.blur();
              onMinimize();
            }}
            aria-label="Minimize DAW"
          >
            −
          </button>
          <button
            className={button}
            data-native-keys
            onClick={onClose}
            aria-label="Close DAW"
          >
            ×
          </button>
        </div>
      </div>
      <div
        className="no-drag flex min-h-0 flex-1 flex-col"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!busy && !recording)
            void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div
          role="menubar"
          aria-label="DAW menus"
          className="flex shrink-0 gap-1 border-b border-zinc-800 bg-zinc-900/60 px-2 py-1"
        >
          {["File", "Edit", "Track", "View"].map((kind) => (
            <button
              key={kind}
              data-native-keys
              aria-haspopup="menu"
              aria-expanded={menu?.kind === kind}
              className="rounded px-3 py-1 text-xs hover:bg-zinc-700"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu({ kind, x: rect.left, y: rect.bottom });
              }}
            >
              {kind}
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            const relink = relinkRef.current;
            relinkRef.current = null;
            e.target.value = "";
            void addFiles(relink ? files.slice(0, 1) : files, relink);
          }}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 p-2">
          <div
            className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-1"
            aria-label="Transport controls"
          >
            <button
              className={button}
              aria-label="Go to beginning"
              title="Go to beginning (Return)"
              onClick={restart}
              disabled={recording || busy}
            >
              <DawTransportIcon name="start" />
            </button>
            <button
              className={button}
              aria-label="Rewind"
              title="Rewind 1 second (←); Shift+← for 5 seconds"
              onClick={() => seek(currentPosition() - 1)}
              disabled={recording || busy}
            >
              <DawTransportIcon name="rewind" />
            </button>
            <button
              className={button}
              aria-label="Forward"
              title="Forward 1 second (→); Shift+→ for 5 seconds"
              onClick={() => seek(currentPosition() + 1)}
              disabled={recording || busy}
            >
              <DawTransportIcon name="forward" />
            </button>
            <button
              className={button}
              aria-label="Stop"
              title="Stop playback or finish recording"
              onClick={stopTransport}
            >
              <DawTransportIcon name="stop" />
            </button>
            <button
              className={`${button} ${playing ? "border-emerald-400 bg-emerald-900 text-emerald-200" : "text-emerald-300"}`}
              aria-label={playing ? "Pause" : "Play"}
              aria-pressed={playing}
              title="Play / pause (Space)"
              onClick={togglePlay}
              disabled={
                (!playing && (!active.length || missing)) || recording || busy
              }
            >
              <DawTransportIcon name={playing ? "pause" : "play"} />
            </button>
            <button
              className={`${button} ${recording ? "border-red-400 bg-red-950 text-red-400 animate-pulse" : "text-red-400"}`}
              aria-label={recording ? "Finish recording" : "Record"}
              aria-pressed={recording}
              title="Record / finish take (R)"
              onClick={() => void startRecording()}
              disabled={busy}
            >
              <DawTransportIcon name="record" />
            </button>
          </div>
          <div
            className={`min-w-24 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-center ${recording ? "text-red-300" : "text-emerald-300"}`}
          >
            <output
              aria-label={
                recording ? "Recording elapsed time" : "Playhead position"
              }
              className="block font-mono text-sm tabular-nums"
            >
              {time(recording ? recordingSeconds : playhead)}
            </output>
            <span className="block text-[9px] uppercase tracking-widest text-zinc-500">
              {recording ? "Recording" : playing ? "Playing" : "Stopped"}
            </span>
          </div>
          <button
            className={button}
            onClick={() => {
              relinkRef.current = null;
              inputRef.current?.click();
            }}
            disabled={busy || recording}
          >
            + Add audio
          </button>
          <button
            className={button}
            onClick={() => void exportMix()}
            disabled={!duration || missing || busy || recording}
          >
            Export WAV
          </button>
          <label className="ml-auto flex items-center gap-1 text-[10px] text-zinc-400">
            Zoom
            <input
              aria-label="Timeline zoom"
              type="range"
              min="5"
              max="80"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
              className="w-16 accent-emerald-400"
            />
          </label>
          <button
            className={button}
            data-native-keys
            aria-label="Keyboard shortcuts"
            aria-expanded={showShortcuts}
            title="Keyboard shortcuts (?)"
            onClick={() => setShowShortcuts((show) => !show)}
          >
            ?
          </button>
        </div>
        {showShortcuts && (
          <div
            className="shrink-0 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs"
            role="note"
            aria-label="DAW keyboard shortcuts"
          >
            <div className="mb-2 flex items-center justify-between">
              <strong>Keyboard shortcuts</strong>
              <span className="text-zinc-500">
                Active in this window; typing keeps its normal keys.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-zinc-400">
              {[
                ["Space", "Play / pause; finish recording"],
                ["R", "Record / finish take"],
                ["Return", "Go to beginning"],
                ["Delete / Backspace", "Delete selected region"],
                ["↑ / ↓", "Select previous / next track"],
                ["← / →", "Seek 1s (Shift: 5s)"],
                ["Alt + ← / →", "Nudge clip 0.1s (Shift: 1s)"],
                ["M / S", "Mute / solo selected track"],
                ["⌘ / Ctrl + D", "Duplicate selected region"],
                ["⌘ / Ctrl + T", "Split region at playhead"],
                ["⌘ / Ctrl + C / X / V", "Copy / cut / paste region"],
                ["⌥ + ⌘ / Ctrl + N", "New audio track"],
                ["+ / −", "Zoom timeline"],
                ["Esc", "Deselect / close shortcuts"],
                ["Double-click name", "Rename track"],
              ].map(([key, action]) => (
                <div key={key}>
                  <kbd className="mr-2 text-zinc-200">{key}</kbd>
                  {action}
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="shrink-0 bg-red-950/50 px-3 py-2 text-xs text-red-200"
          >
            {error}
          </p>
        )}
        <div ref={timelineRef} className="min-h-0 flex-1 overflow-auto">
          {!active.length ? (
            <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 px-5 text-center">
              <span className="text-3xl text-emerald-400">♫</span>
              <p className="text-sm">Build a mix together</p>
              <p className="max-w-sm text-xs text-zinc-500">
                Drop recordings here, add audio files, or record a take. Each
                track can hold multiple audio regions. Use Track → New Audio
                Track to start.
              </p>
            </div>
          ) : (
            <div className="relative" style={{ width: timelineWidth + 230 }}>
              <div className="flex h-7 border-b border-zinc-800 text-[10px] text-zinc-500">
                <div className="sticky left-0 z-20 w-[230px] shrink-0 bg-zinc-900 px-3 py-1">
                  {active.length} tracks · {time(duration)}
                </div>
                <div
                  className="relative"
                  style={{ width: timelineWidth }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    seek(
                      ((e.clientX - rect.left) / rect.width) * timelineSeconds,
                    );
                  }}
                >
                  {Array.from(
                    {
                      length: Math.ceil(timelineSeconds / (zoom < 15 ? 10 : 5)),
                    },
                    (_, i) => {
                      const seconds = i * (zoom < 15 ? 10 : 5);
                      return (
                        <span
                          key={seconds}
                          className="absolute top-1 border-l border-zinc-700 pl-1"
                          style={{
                            left: `${(seconds / timelineSeconds) * 100}%`,
                          }}
                        >
                          {time(seconds)}
                        </span>
                      );
                    },
                  )}
                </div>
              </div>
              {active.map((track, index) => (
                <div
                  key={track.id}
                  data-track-row={track.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelected(track.id);
                    setSelectedRegionId(null);
                    setMenu({
                      kind: "Track",
                      x: e.clientX,
                      y: e.clientY,
                      trackId: track.id,
                    });
                  }}
                  onClick={() => {
                    setSelected(track.id);
                    setSelectedRegionId(null);
                  }}
                  className={`flex h-24 border-b border-zinc-800 ${selected === track.id ? "bg-emerald-950/20" : "bg-zinc-950"}`}
                >
                  <div
                    className={`sticky left-0 z-20 flex w-[230px] shrink-0 flex-col justify-center gap-2 border-r border-zinc-800 px-2 py-1 ${selected === track.id ? "bg-emerald-950 ring-1 ring-inset ring-emerald-500/60" : "bg-zinc-900"}`}
                    onClick={() => {
                      setSelected(track.id);
                      setSelectedRegionId(null);
                    }}
                  >
                    {renaming === track.id ? (
                      <input
                        aria-label={`Track name ${index + 1}`}
                        value={track.name}
                        maxLength={200}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          publish(track, { name: e.target.value })
                        }
                        onBlur={() => setRenaming(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            setRenaming(null);
                            rootRef.current?.focus({ preventScroll: true });
                          }
                        }}
                        className="w-full rounded bg-zinc-950 px-1 text-xs outline-none focus:text-emerald-300"
                      />
                    ) : (
                      <button
                        className="flex h-5 w-full items-center gap-2 truncate text-left text-xs"
                        aria-label={`Select track ${track.name}`}
                        aria-pressed={selected === track.id}
                        title="Select track; double-click to rename"
                        onClick={() => {
                          setSelected(track.id);
                          setSelectedRegionId(null);
                        }}
                        onDoubleClick={() => setRenaming(track.id)}
                      >
                        <span className="text-[10px] text-zinc-500">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">
                          {track.name || "Untitled track"}
                        </span>
                      </button>
                    )}
                    <div className="flex h-10 items-center gap-1.5">
                      <button
                        className={`${button} ${track.muted ? "text-amber-300" : ""}`}
                        aria-pressed={track.muted}
                        aria-label={`Mute ${track.name}`}
                        onClick={() => publish(track, { muted: !track.muted })}
                      >
                        M
                      </button>
                      <button
                        className={`${button} ${track.solo ? "text-emerald-300" : ""}`}
                        aria-pressed={track.solo}
                        aria-label={`Solo ${track.name}`}
                        onClick={() => publish(track, { solo: !track.solo })}
                      >
                        S
                      </button>
                      <input
                        aria-label={`Volume ${track.name}`}
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={track.volume}
                        onChange={(e) =>
                          publish(track, { volume: +e.target.value })
                        }
                        className="min-w-0 flex-1 accent-emerald-400"
                      />
                      <DawPanDial
                        name={track.name}
                        value={track.pan}
                        onChange={(pan) => publish(track, { pan })}
                      />
                    </div>
                    {visibleRegions(track).some(
                      (r) => !buffers.has(r.sourceId),
                    ) && (
                      <button
                        className="text-left text-[10px] text-amber-300"
                        disabled={locked}
                        onClick={() => {
                          relinkRef.current = visibleRegions(track).find(
                            (r) => !buffers.has(r.sourceId),
                          )!;
                          inputRef.current?.click();
                        }}
                      >
                        Restore missing audio…
                      </button>
                    )}
                  </div>
                  <div
                    className="relative"
                    style={{
                      width: timelineWidth,
                      backgroundImage:
                        "linear-gradient(to right, #27272a 1px, transparent 1px)",
                      backgroundSize: `${(5 / timelineSeconds) * timelineWidth}px 100%`,
                    }}
                  >
                    {visibleRegions(track).map((region) => (
                      <div
                        key={region.id}
                        role="button"
                        tabIndex={0}
                        data-region-id={region.id}
                        aria-label={`Region ${region.name}`}
                        aria-pressed={selectedRegionId === region.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(track.id);
                          setSelectedRegionId(region.id);
                        }}
                        onFocus={() => {
                          setSelected(track.id);
                          setSelectedRegionId(region.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelected(track.id);
                          setSelectedRegionId(region.id);
                          setMenu({
                            kind: "Region",
                            x: e.clientX,
                            y: e.clientY,
                            trackId: track.id,
                            regionId: region.id,
                          });
                        }}
                        className="absolute top-1 bottom-1 min-w-1 touch-none overflow-hidden rounded border text-left outline-none focus:ring-1 focus:ring-white"
                        style={{
                          left: `${(region.start / timelineSeconds) * 100}%`,
                          width: `${((region.trimEnd - region.trimStart) / timelineSeconds) * 100}%`,
                          color: colours[index % colours.length],
                          background: `${colours[index % colours.length]}20`,
                          borderColor:
                            selectedRegionId === region.id
                              ? "white"
                              : colours[index % colours.length],
                          opacity: track.muted ? 0.35 : 1,
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0 || locked) return;
                          e.stopPropagation();
                          setSelected(track.id);
                          setSelectedRegionId(region.id);
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragRef.current = {
                            id: region.id,
                            x: e.clientX,
                            region,
                            edge:
                              (e.target as HTMLElement).dataset.edge ?? "move",
                            pixelsPerSecond:
                              e.currentTarget.parentElement!.getBoundingClientRect()
                                .width / timelineSeconds,
                          };
                        }}
                        onPointerMove={(e) => {
                          const drag = dragRef.current;
                          if (drag?.id !== region.id || !e.buttons) return;
                          const delta =
                            (e.clientX - drag.x) / drag.pixelsPerSecond;
                          const r = drag.region;
                          if (drag.edge === "left") {
                            const d = Math.max(
                              -r.start,
                              -r.trimStart,
                              Math.min(r.trimEnd - r.trimStart - 0.01, delta),
                            );
                            publishRegions(track, [
                              {
                                ...r,
                                start: r.start + d,
                                trimStart: r.trimStart + d,
                              },
                            ]);
                          } else if (drag.edge === "right")
                            publishRegions(track, [
                              {
                                ...r,
                                trimEnd: Math.max(
                                  r.trimStart + 0.01,
                                  Math.min(
                                    r.duration,
                                    MAX_DAW_SECONDS - r.start + r.trimStart,
                                    r.trimEnd + delta,
                                  ),
                                ),
                              },
                            ]);
                          else moveRegion(track, r, r.start + delta);
                        }}
                        onPointerUp={() => {
                          dragRef.current = null;
                        }}
                        onPointerCancel={() => {
                          dragRef.current = null;
                        }}
                      >
                        <span className="pointer-events-none absolute inset-x-0 top-0 h-6 truncate border-b border-current/20 bg-current/10 px-2 py-1 text-[10px]">
                          {region.name}
                        </span>
                        <div className="pointer-events-none h-full pt-6">
                          <Waveform
                            buffer={buffers.get(region.sourceId)}
                            track={region}
                          />
                        </div>
                        <span
                          data-edge="left"
                          title="Trim region start"
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/30"
                        />
                        <span
                          data-edge="right"
                          title="Trim region end"
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30"
                        />
                      </div>
                    ))}
                    {recording && liveTake?.trackId === track.id && (
                      <div
                        data-live-recording
                        aria-label="Live recording waveform"
                        className="pointer-events-none absolute inset-y-1 z-10 min-w-1 overflow-hidden rounded border border-red-300 bg-red-950/90 text-red-300"
                        style={{
                          left: `${(liveTake.start / timelineSeconds) * 100}%`,
                          width: `${(recordingSeconds / timelineSeconds) * 100}%`,
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-6 whitespace-nowrap border-b border-red-400/30 bg-red-500/20 px-2 py-1 text-[10px]">
                          ● Recording
                        </div>
                        <svg
                          className="absolute bottom-0 top-6 h-[calc(100%-1.5rem)] w-full"
                          viewBox={`0 0 ${Math.max(1, recordingSeconds * 20)} 50`}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            d={`M0 25H${recordingSeconds * 20}`}
                            stroke="currentColor"
                            strokeOpacity=".3"
                          />
                          <path
                            data-live-peaks
                            d={livePeaks
                              .map(
                                (p) =>
                                  `M${p.at * 20} ${25 - p.peak * 23}v${Math.max(0.4, p.peak * 46)}`,
                              )
                              .join(" ")}
                            stroke="currentColor"
                            strokeWidth=".7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div
                data-playhead
                className={`pointer-events-none absolute bottom-0 top-1 z-10 w-px ${recording ? "bg-red-300" : "bg-emerald-300"}`}
                style={{
                  left: 230 + (cursor / timelineSeconds) * timelineWidth,
                }}
              >
                <span
                  className="absolute -left-2 top-0 h-5 w-4 rounded-t bg-inherit"
                  style={{
                    clipPath: "polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-500">
          <span role="status" className="mr-2 text-emerald-300">
            {busy
              ? "Preparing audio…"
              : transferProgress !== undefined
                ? `Sharing audio: ${Math.round(transferProgress * 100)}%`
                : ""}
          </span>
          <span
            className={keyboardActive && !minimized ? "text-emerald-400" : ""}
          >
            {keyboardActive && !minimized
              ? "Keyboard active"
              : "Click this window to use keys"}
          </span>
          {
            " · Space Play / pause · R Record · Return Start · Delete Region · ? Help"
          }
        </div>
      </div>
      {menu && (
        <DawMenu
          x={menu.x}
          y={menu.y}
          title={menu.kind}
          items={menuItems}
          onClose={(restore) => {
            setMenu(null);
            if (restore) rootRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
