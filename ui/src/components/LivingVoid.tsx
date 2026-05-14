/**
 * LivingVoid — fixed-position animated background layer.
 *
 * Pure CSS. Sits behind every panel. The interface is supposed to feel
 * suspended over infinite black — this is what does the breathing.
 */
export function LivingVoid() {
  return (
    <>
      <div className="living-void" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
