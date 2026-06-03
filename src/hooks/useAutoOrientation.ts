// ── Auto-orientation hook — force portrait or landscape on desktop ──────

import { useLayoutEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { isMobile } from "../utils/platform";

export type Orientation = "portrait" | "landscape";

/**
 * On desktop, automatically flip the window to the requested orientation
 * if it doesn't already match. No-op on mobile.
 */
export function useAutoOrientation(target: Orientation) {
  useLayoutEffect(() => {
    if (isMobile()) return;

    const flip = async () => {
      try {
        const win = getCurrentWindow();
        const size = await win.outerSize();
        const isPortrait = size.height > size.width;
        const needsFlip =
          (target === "portrait" && !isPortrait) ||
          (target === "landscape" && isPortrait);

        if (needsFlip) {
          win.setSize(new PhysicalSize(size.height, size.width));
        }
      } catch (e) {
        console.error(`useAutoOrientation(${target}):`, e);
      }
    };
    flip();
  }, [target]);
}
