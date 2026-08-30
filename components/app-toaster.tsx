"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

/**
 * Sonner has to be told which theme it is in; it cannot read the class
 * next-themes puts on <html>. Hardcoding it meant every toast in the light
 * theme arrived as a dark box on a white page — the one place in the app
 * where the two themes were visibly disagreeing with each other.
 *
 * `resolvedTheme` rather than `theme`, so "system" resolves to what the
 * visitor is actually looking at instead of falling through to a default.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "font-sans",
          title: "font-medium",
        },
      }}
    />
  );
}
