export type DawTransportIconName =
  "start" | "rewind" | "forward" | "stop" | "play" | "pause" | "record";

export function DawTransportIcon({ name }: { name: DawTransportIconName }) {
  const paths: Record<Exclude<DawTransportIconName, "record">, string> = {
    start: "M5 4h2v16H5zM19 4v16L8 12z",
    rewind: "M12 5v14L2 12zM22 5v14l-10-7z",
    forward: "M2 5v14l10-7zM12 5v14l10-7z",
    stop: "M5 5h14v14H5z",
    play: "M6 3v18l16-9z",
    pause: "M5 4h5v16H5zM14 4h5v16h-5z",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {name === "record" ? (
        <circle cx="12" cy="12" r="8" />
      ) : (
        <path d={paths[name]} />
      )}
    </svg>
  );
}
