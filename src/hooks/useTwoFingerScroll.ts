import { useDrag } from "@use-gesture/react";
import { RefObject } from "react";
import { isMobile } from "../utils/platform";

/**
 * Custom hook to enable two-finger vertical scrolling on touch devices.
 * 
 * - Disables browser-default webview scroll/bounce behaviors via `touchAction: "none"`.
 * - Intercepts two-finger touch gestures to manually scroll the terminal viewport.
 * - Leaves mouse and single-finger gestures untouched for normal click-to-focus and selections.
 */
export function useTwoFingerScroll(terminalRef: RefObject<HTMLDivElement | null>) {
  const bind = useDrag(
    ({ delta: [, dy], touches }) => {
      // Only handle double-finger touch scrolling
      if (touches !== 2) return;

      const viewport = terminalRef.current?.querySelector(
        ".xterm-viewport",
      ) as HTMLElement | null;
      if (viewport) {
        viewport.scrollBy({ top: -dy, behavior: "instant" });
      }
    },
    {
      filterTaps: true,
      // Bind only to touch events to prevent blocking mouse interactions on PC
      pointer: { touch: true },
    },
  );

  const shouldEnable = isMobile();

  return {
    gestureProps: shouldEnable ? bind() : {},
    touchAction: shouldEnable ? "none" : "auto",
    isMobile: shouldEnable,
  };
}
