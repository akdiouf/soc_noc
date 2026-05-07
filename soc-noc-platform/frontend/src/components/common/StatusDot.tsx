import React from "react";
import type { DeviceStatus } from "../../types";
import clsx from "clsx";

const COLORS: Record<DeviceStatus, string> = {
  up: "bg-green-500",
  down: "bg-red-500",
  warning: "bg-orange-500",
  critical: "bg-red-600 animate-pulse",
  unknown: "bg-gray-400",
  maintenance: "bg-blue-400",
};

interface Props {
  status: DeviceStatus;
  size?: "sm" | "md" | "lg";
}

export function StatusDot({ status, size = "md" }: Props) {
  const sizeClass = size === "sm" ? "w-2 h-2" : size === "lg" ? "w-4 h-4" : "w-3 h-3";
  return (
    <span className={clsx("inline-block rounded-full", sizeClass, COLORS[status])} />
  );
}
