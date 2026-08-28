"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatPaisa } from "@/lib/money";

export function SalesTrend({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#557f60" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#557f60" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e3dbc6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#557f60" }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: "#e3dbc6" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#557f60" }}
            tickFormatter={(v) => `${Math.round(v / 100)}`}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number) => [formatPaisa(v), "Sales"]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e3dbc6",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#35553f"
            strokeWidth={2}
            fill="url(#sage)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
