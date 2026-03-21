/** CRT effect layer — applied once at the shell level, never nested */
export default function CRTOverlay() {
  return (
    <>
      <div className="crt-scanlines" aria-hidden="true" />
      <div className="crt-vignette" aria-hidden="true" />
      <div className="crt-grain" aria-hidden="true" />
    </>
  );
}
