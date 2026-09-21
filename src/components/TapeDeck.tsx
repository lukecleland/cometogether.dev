// Inspired by the dark metal cassette deck in the sibling mixtape project.
export function TapeDeck({ id, name, playing, progress, play, pause, stop, seek }: {
  id: string; name: string; playing: boolean; progress: number;
  play: () => void; pause: () => void; stop: () => void; seek: (seconds: number) => void;
}) {
  const fraction = Math.max(0, Math.min(1, progress / 100));
  return <div className="tape-deck w-full max-w-[560px] rounded-xl border border-zinc-600 bg-[#242424] p-3 shadow-xl" data-audio-deck="tape">
    <div className="mb-2 flex justify-between font-mono text-[9px] tracking-[.16em] text-zinc-400"><span>MAKE TOGETHER</span><span>STEREO · TAPE DECK</span></div>
    <svg viewBox="0 0 420 188" className="block max-h-[220px] w-full rounded-lg border border-black bg-[#101010]" role="img" aria-label={`Tape deck — ${name}`}>
      <defs><linearGradient id={`tape-metal-${id}`} x2="0" y2="1"><stop stopColor="#48443f" /><stop offset="1" stopColor="#24211e" /></linearGradient></defs>
      <rect x="13" y="12" width="394" height="164" rx="12" fill={`url(#tape-metal-${id})`} stroke="#67615a" />
      <rect x="27" y="23" width="366" height="35" rx="4" fill="#e7d9b7" />
      <text x="39" y="46" fontSize="13" fontFamily="monospace" fill="#34302b">A</text>
      <text x="210" y="46" textAnchor="middle" fontSize="12" fill="#34302b">{name.length > 38 ? `${name.slice(0, 37)}…` : name}</text>
      <rect x="36" y="68" width="348" height="80" rx="36" fill="#0e0e0e" stroke="#55504a" />
      <path d="M99 129L141 161H279L321 129" stroke="#715035" strokeWidth="3" fill="none" />
      {[99,321].map((x,index) => <g key={x}>
        <circle cx={x} cy="108" r={index === 0 ? 35 - fraction * 13 : 22 + fraction * 13} fill="#4c3020" stroke="#291c14" strokeWidth="3" />
        <g className="tape-sprocket" style={{ transformBox: 'view-box', transformOrigin: `${x}px 108px`, animationPlayState: playing ? 'running' : 'paused' }}>
          <circle cx={x} cy="108" r="19" fill="#b5b1a7" stroke="#ddd8ce" strokeWidth="2" />
          {[0,60,120,180,240,300].map(angle => <rect key={angle} x={x-3} y="91" width="6" height="10" rx="1" fill="#252525" transform={`rotate(${angle} ${x} 108)`} />)}
          <circle cx={x} cy="108" r="7" fill="#151515" />
        </g>
      </g>)}
      <rect x="162" y="86" width="96" height="43" rx="5" fill="#29221c" stroke="#645544" />
      <path d="M173 108h74" stroke="#765137" strokeWidth="4" />
      <rect x="187" y="153" width="46" height="16" rx="3" fill="#111" stroke="#555" />
      {[25,395].flatMap(x => [25,163].map(y => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="3" fill="#999" /><path d={`M${x-2} ${y}h4`} stroke="#222" /></g>))}
    </svg>
    <div className="mt-3 grid grid-cols-5 gap-1.5">
      {[{ label: 'Rewind 10 seconds', text: 'REW', action: () => seek(-10) }, { label: 'Play', text: 'PLAY', action: play }, { label: 'Pause', text: 'PAUSE', action: pause }, { label: 'Stop', text: 'STOP', action: stop }, { label: 'Forward 10 seconds', text: 'FF', action: () => seek(10) }].map(button => <button key={button.text} onClick={button.action} aria-label={button.label} title={button.label} aria-pressed={button.text === 'PLAY' ? playing : undefined} className={`tape-key ${playing && button.text === 'PLAY' ? 'tape-key-down' : ''}`}><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d={button.text === 'REW' ? 'M11 5v14L2 12zM22 5v14l-9-7z' : button.text === 'FF' ? 'M2 5v14l9-7zM13 5v14l9-7z' : button.text === 'PLAY' ? 'M6 3v18l15-9z' : button.text === 'PAUSE' ? 'M5 4h5v16H5zM14 4h5v16h-5z' : 'M5 5h14v14H5z'} /></svg><span className="text-[8px] tracking-wider">{button.text}</span></button>)}
    </div>
  </div>;
}
