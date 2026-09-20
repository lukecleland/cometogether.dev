/** The two source colors on the left combine into the solid tile on the right. */
export function BrandMark({ className = "" }: { className?: string }) {
  return <img src="/brand-mark.svg" alt="" aria-hidden="true" width={100} height={100} className={`shrink-0 ${className}`} />;
}
