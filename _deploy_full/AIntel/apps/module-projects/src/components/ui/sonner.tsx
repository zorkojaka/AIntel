"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ style, className, ...props }: ToasterProps) => (
  <Sonner
    className={`toaster group ${className ?? ""}`.trim()}
    position="bottom-left"
    style={{
      "--normal-bg": "var(--popover)",
      "--normal-text": "var(--popover-foreground)",
      "--normal-border": "var(--border)",
      ...(style as CSSProperties | undefined),
    }}
    {...props}
  />
);

export { Toaster };
