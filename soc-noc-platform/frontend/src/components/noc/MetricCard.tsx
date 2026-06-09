import React from "react";
import clsx from "clsx";

interface Props {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: "green" | "orange" | "red" | "blue" | "gray";
}

const VALUE_COLORS = {
  green: "text-green-600",
  orange: "text-orange-500",
  red: "text-red-600",
  blue: "text-blue-600",
  gray: "text-gray-600",
};

const BG_COLORS = {
  green: "bg-green-50 border-green-100",
  orange: "bg-orange-50 border-orange-100",
  red: "bg-red-50 border-red-100",
  blue: "bg-blue-50 border-blue-100",
  gray: "bg-gray-50 border-gray-100",
};

export function MetricCard({ label, value, subtitle, color = "gray" }: Props) {
  return (
    <div className={clsx("rounded-xl border p-5 shadow-sm", BG_COLORS[color])}>
      <div className="text-sm text-gray-600 font-medium">{label}</div>
      <div className={clsx("text-3xl font-bold mt-1", VALUE_COLORS[color])}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}
