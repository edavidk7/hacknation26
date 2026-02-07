import { useEffect, useRef } from "react";

/**
 * EdgeCanvas — draws bezier curves between parent and child `.node` elements
 * inside a given container. Uses a <canvas> overlay positioned absolutely.
 *
 * Re-draws on: deps change, window resize, MutationObserver on the container.
 * Supports HiDPI via devicePixelRatio.
 */

interface Props {
  /** Ref to the container div that holds the tree nodes */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Arbitrary deps array — redraw when these change */
  deps?: unknown[];
  /** Stroke color (default: rgba(108,99,255,0.25)) */
  color?: string;
  /** Stroke width in CSS px (default: 1.5) */
  lineWidth?: number;
}

export default function EdgeCanvas({
  containerRef,
  deps = [],
  color = "rgba(108,99,255,0.25)",
  lineWidth = 1.5,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();

      // Size the canvas to match the container
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";

      // Find all .branch elements. Each .branch has a .node inside it,
      // and optionally a .children container with child .branch elements.
      const branches = container.querySelectorAll<HTMLElement>(".branch");

      branches.forEach((branch) => {
        const parentNode = branch.querySelector<HTMLElement>(
          ":scope > .node-wrap > .node"
        );
        const childrenContainer = branch.querySelector<HTMLElement>(
          ":scope > .children"
        );
        if (!parentNode || !childrenContainer) return;

        // Get child nodes (direct .branch children of .children container)
        const childBranches = childrenContainer.querySelectorAll<HTMLElement>(
          ":scope > .branch"
        );

        childBranches.forEach((childBranch) => {
          const childNode = childBranch.querySelector<HTMLElement>(
            ":scope > .node-wrap > .node"
          );
          if (!childNode) return;

          const pRect = parentNode.getBoundingClientRect();
          const cRect = childNode.getBoundingClientRect();

          // Start: bottom-center of parent
          const x1 = pRect.left + pRect.width / 2 - rect.left;
          const y1 = pRect.bottom - rect.top;

          // End: top-center of child
          const x2 = cRect.left + cRect.width / 2 - rect.left;
          const y2 = cRect.top - rect.top;

          // Bezier control points — vertical offset for smooth curves
          const cpOffset = Math.min(Math.abs(y2 - y1) * 0.5, 60);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1, y1 + cpOffset, x2, y2 - cpOffset, x2, y2);
          ctx.stroke();
        });
      });
    };

    // Initial draw
    draw();

    // Redraw on resize
    const onResize = () => requestAnimationFrame(draw);
    window.addEventListener("resize", onResize);

    // Observe DOM mutations in the container (node additions, removals, attribute changes)
    const observer = new MutationObserver(() => requestAnimationFrame(draw));
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, color, lineWidth, ...deps]);

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
