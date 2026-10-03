// Single Recharts instance for the monorepo. ChartContainer's
// ResponsiveContainer and the chart primitives must come from the same copy,
// or the size context doesn't reach the chart (it renders nothing). Apps
// import Recharts from here instead of depending on it directly.
export * from "recharts"
