import { useEffect, useRef, useCallback } from "react";

/**
 * EdgeCanvas — draws bezier curves between parent and child `.node` elements
 * inside a given container. Uses a <canvas> overlay positioned absolutely.
 *
 * Uses offsetLeft/offsetTop for positioning (immune to CSS transforms).
 * Re-draws on: deps change, window resize, MutationObserver, and
 * ResizeObserver on the container.
 *
 * The canvas finds its own container: the nearest `.tree-container` ancestor.
 */

interface Props {
  /** Arbitrary deps array — redraw when these change */
  deps?: unknown[];
  /** Stroke color (default: rgba(102,155,188,0.25)) */
  color?: string;
  /** Stroke width in CSS px (default: 1.5) */
  lineWidth?: number;
}

/**
 * Get the offset position of `el` relative to `ancestor`.
 * Walks up offsetParent chain summing offsetLeft/offsetTop.
 * These values are immune to CSS transforms on ancestors.
 */
function getOffsetRelativeTo(
  el: HTMLElement,
  ancestor: HTMLElement
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = el;
  while (current && current !== ancestor) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

export default function EdgeCanvas({
  deps = [],
  color = "rgba(102,155,188,0.25)",
  lineWidth = 1.5,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.closest(".tree-container") as HTMLElement | null;
    if (!container) return;

    // Skip drawing for inactive layers — they're invisible anyway
    const treeLayer = container.closest(".tree-layer") as HTMLElement | null;
    if (treeLayer && !treeLayer.classList.contains("tree-layer--active")) {
      // Clear the canvas so stale edges don't flash when switching
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    const w = container.scrollWidth;
    const h = container.scrollHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";

    const branches = container.querySelectorAll<HTMLElement>(".branch");

    branches.forEach((branch) => {
      const parentNode = branch.querySelector<HTMLElement>(
        ":scope > .node-wrap > .node"
      );
      const childrenContainer = branch.querySelector<HTMLElement>(
        ":scope > .children"
      );
      if (!parentNode || !childrenContainer) return;

      const childBranches = childrenContainer.querySelectorAll<HTMLElement>(
        ":scope > .branch"
      );

      // Parent: bottom-center
      const pOff = getOffsetRelativeTo(parentNode, container);
      const x1 = pOff.x + parentNode.offsetWidth / 2;
      const y1 = pOff.y + parentNode.offsetHeight;

      childBranches.forEach((childBranch) => {
        const childNode = childBranch.querySelector<HTMLElement>(
          ":scope > .node-wrap > .node"
        );
        if (!childNode) return;

        // Child: top-center
        const cOff = getOffsetRelativeTo(childNode, container);
        const x2 = cOff.x + childNode.offsetWidth / 2;
        const y2 = cOff.y;

        const cpOffset = Math.min(Math.abs(y2 - y1) * 0.5, 60);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1, y1 + cpOffset, x2, y2 - cpOffset, x2, y2);
        ctx.stroke();
      });
    });
  }, [color, lineWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.closest(".tree-container") as HTMLElement | null;
    const treeLayer = canvas.closest(".tree-layer") as HTMLElement | null;

    const scheduleDraw = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    // Initial draw
    scheduleDraw();

    // Delayed redraw — catches layout that hasn't fully settled yet
    // (e.g. fonts loading, flex layout computing)
    const delayedTimer = setTimeout(scheduleDraw, 100);

    // Redraw on window resize
    window.addEventListener("resize", scheduleDraw);

    // Redraw after CSS transitions on the tree-layer complete
    // (position changes from absolute→relative, transform settles)
    const handleTransitionEnd = (e: TransitionEvent) => {
      // Only care about transform/opacity transitions on the layer itself
      if (e.target === treeLayer) {
        scheduleDraw();
      }
    };
    treeLayer?.addEventListener("transitionend", handleTransitionEnd);

    // Observe DOM mutations in the container (node add/remove/edit)
    let mutationObs: MutationObserver | null = null;
    if (container) {
      mutationObs = new MutationObserver(scheduleDraw);
      mutationObs.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Also observe the tree-layer for class changes (active↔inactive)
    let layerMutationObs: MutationObserver | null = null;
    if (treeLayer) {
      layerMutationObs = new MutationObserver(scheduleDraw);
      layerMutationObs.observe(treeLayer, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // Observe size changes on the container (catches layout reflows)
    let resizeObs: ResizeObserver | null = null;
    if (container) {
      resizeObs = new ResizeObserver(scheduleDraw);
      resizeObs.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(delayedTimer);
      window.removeEventListener("resize", scheduleDraw);
      treeLayer?.removeEventListener("transitionend", handleTransitionEnd);
      mutationObs?.disconnect();
      layerMutationObs?.disconnect();
      resizeObs?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, ...deps]);

  return (
    <canvas
      ref={canvasRef}
      className="edge-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
