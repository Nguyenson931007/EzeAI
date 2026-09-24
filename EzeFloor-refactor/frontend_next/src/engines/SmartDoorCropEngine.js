/**
 * SmartDoorCropEngine.js
 * =======================
 * Animates the canvas view port (scale & offset) to center on a local region (hinge point).
 * Employs a cinematic smooth 300ms easeInOutCubic transition via requestAnimationFrame.
 */

// Global reference to cancel active animations if user interacts with canvas during transition
if (typeof window !== "undefined") {
  window.activeDoorZoomAnim = null;
}

export function cancelActiveZoomAnimation() {
  if (typeof window !== "undefined" && window.activeDoorZoomAnim) {
    cancelAnimationFrame(window.activeDoorZoomAnim.frameId);
    window.activeDoorZoomAnim = null;
  }
}

export function animateZoomToHinge({
  hingePoint,
  svgRef,
  currentScale,
  currentOffset,
  setScale,
  setOffset,
  duration = 300
}) {
  if (!svgRef.current || !hingePoint) return;

  // Cancel any existing animation
  cancelActiveZoomAnimation();

  const svgEl = svgRef.current;
  const clientWidth = svgEl.clientWidth || svgEl.getBoundingClientRect().width || 800;
  const clientHeight = svgEl.clientHeight || svgEl.getBoundingClientRect().height || 600;

  // Define target scale (close-up CAD zoom, e.g., 1.3 or double current if already large)
  const targetScale = Math.max(1.3, currentScale * 1.5);

  // Define target offset to center the hinge point
  const centerX = clientWidth / 2;
  const centerY = clientHeight / 2;
  const targetOffsetX = centerX - hingePoint.x * targetScale;
  const targetOffsetY = centerY - hingePoint.y * targetScale;

  const startScale = currentScale;
  const startOffsetX = currentOffset.x;
  const startOffsetY = currentOffset.y;

  const startTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = easeInOutCubic(progress);

    const nextScale = startScale + (targetScale - startScale) * ease;
    const nextOffsetX = startOffsetX + (targetOffsetX - startOffsetX) * ease;
    const nextOffsetY = startOffsetY + (targetOffsetY - startOffsetY) * ease;

    setScale(nextScale);
    setOffset({ x: nextOffsetX, y: nextOffsetY });

    if (progress < 1) {
      if (typeof window !== "undefined" && window.activeDoorZoomAnim) {
        window.activeDoorZoomAnim.frameId = requestAnimationFrame(tick);
      }
    } else {
      if (typeof window !== "undefined") {
        window.activeDoorZoomAnim = null;
      }
    }
  }

  if (typeof window !== "undefined") {
    window.activeDoorZoomAnim = {
      frameId: requestAnimationFrame(tick),
      cancel: () => {
        cancelActiveZoomAnimation();
      }
    };
  }
}
