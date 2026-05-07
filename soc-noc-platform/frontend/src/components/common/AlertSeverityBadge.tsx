import React from "react";
import type { AlertSeverity } from "../../types";
import clsx from "clsx";

const STYLES: Record<AlertSeverity, string> = {
  emergency: "bg-red-900 text-white border-red-800",
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-orange-100 text-orange-800 border-orange-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};

const LABELS: Record<AlertSeverity, string> = {
  emergency: "URGENCE",
  critical: "CRITIQUE",
  warning: "AVERTISSEMENT",
  info: "INFO",
};

interface Props {
  severity: AlertSeverity;
  large?: boolean;
}

export function AlertSeverityBadge({ severity, large }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center font-semibold rounded border",
        STYLES[severity],
        large ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs"
      )}
    >
      {large ? LABELS[severity] : severity.toUpperCase()}
    </span>
  );
}
