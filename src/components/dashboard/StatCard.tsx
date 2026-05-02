"use client";

import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  variant?: "default" | "success" | "warning" | "error";
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
}: StatCardProps) {
  const variantStyles = {
    default: "from-zinc-900 to-zinc-900/50 border-border",
    success: "from-green-950/30 to-zinc-900/50 border-green-500/20",
    warning: "from-amber-950/30 to-zinc-900/50 border-amber-500/20",
    error: "from-red-950/30 to-zinc-900/50 border-red-500/20",
  };

  const iconStyles = {
    default: "bg-secondary text-muted-foreground",
    success: "bg-green-500/10 text-green-400",
    warning: "bg-amber-500/10 text-amber-400",
    error: "bg-red-500/10 text-red-400",
  };

  return (
    <Card
      className={`relative overflow-hidden bg-gradient-to-br ${variantStyles[variant]} p-5`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 pt-1">
              <span
                className={`text-xs font-medium ${
                  trend.positive ? "text-green-400" : "text-red-400"
                }`}
              >
                {trend.positive ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${iconStyles[variant]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {/* Decorative element */}
      <div className="absolute -right-4 -bottom-4 opacity-5">
        <Icon className="h-24 w-24" />
      </div>
    </Card>
  );
}
