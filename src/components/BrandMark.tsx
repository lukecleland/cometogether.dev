/** The two source colors on the left combine into the solid tile on the right. */
export function BrandMark({ className = "", rounded = false }: { className?: string; rounded?: boolean }) {
  return <img src={rounded ? "/brand-mark-rounded.svg?v=1" : "/brand-mark.svg?v=tiles-2"} alt="" aria-hidden="true" width={100} height={100} className={`shrink-0 ${className}`} />;
}
