import { useState, useEffect, useRef, useCallback } from "react";



import { useAgentStore } from "../store/agentStore";
const useApiFetch = () => {
  const { serverUrl, apiKey } = useAgentStore();
  return async (path: string, options?: any) => {
    const baseUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
    if (!baseUrl) throw new Error("No server URL configured");
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
        "x-api-key": apiKey
      }
    });
  };
};

import {
  X,
  Cpu,
  HardDrive,
  Activity,
  RefreshCw,
  Minus,
  Square,
  Server,
  Clock,
  AlertTriangle,
  LineChart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "../lib/utils";

export interface ProcessInfo {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  rssBytes: number;
  name: string;
  command: string;
}

interface SystemResourceData {
  cpu: {
    model: string;
    cores: number;
    usagePercent: number;
    loadAvg: number[];
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usagePercent: number;
  };
  disk: {
    path: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usagePercent: number;
  };
  topCpuProcesses?: ProcessInfo[];
  topMemProcesses?: ProcessInfo[];
  os: {
    platform: string;
    arch: string;
    hostname: string;
    uptimeSeconds: number;
  };
  timestamp: string;
}

const INTERVAL_OPTIONS = [
  { label: "1秒", value: 1000 },
  { label: "3秒", value: 3000 },
  { label: "5秒", value: 5000 },
  { label: "10秒", value: 10000 },
  { label: "30秒 (推奨)", value: 30000 },
  { label: "1分", value: 60000 },
  { label: "手動更新", value: 0 },
];

const MAX_HISTORY_POINTS = 30;

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || "B"}`;
}

function formatUptime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "0分";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}日 ${hours}時間 ${minutes}分`;
  }
  if (hours > 0) {
    return `${hours}時間 ${minutes}分`;
  }
  return `${minutes}分`;
}

function getUsageColor(percent: number) {
  if (percent >= 85) {
    return {
      bar: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      badge:
        "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    };
  }
  if (percent >= 65) {
    return {
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      badge:
        "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    };
  }
  return {
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  };
}

/**
 * 統合マルチライングラフ（CPU, Memory, Disk の推移を1つのチャートで表示）
 */
function CombinedResourceChart({
  cpuData,
  memData,
  diskData,
  height = 90,
}: {
  cpuData: number[];
  memData: number[];
  diskData: number[];
  height?: number;
}) {
  const width = 500;
  const svgHeight = height;
  const paddingLeft = 26;
  const paddingRight = 10;
  const paddingTop = 8;
  const paddingBottom = 16;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxPoints = MAX_HISTORY_POINTS;
  const stepX = chartWidth / (maxPoints - 1);

  const buildSeries = (data: number[]) => {
    const points = data.length > 0 ? data : [0];
    const coords = points.map((val, idx) => {
      const x = paddingLeft + chartWidth - (points.length - 1 - idx) * stepX;
      const clampedVal = Math.max(0, Math.min(100, val));
      const y = paddingTop + chartHeight - (clampedVal / 100) * chartHeight;
      return { x, y, val };
    });

    const linePath = coords.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, "");

    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x},${paddingTop + chartHeight} L ${coords[0].x},${paddingTop + chartHeight} Z`
        : "";

    return {
      coords,
      linePath,
      areaPath,
      last: coords[coords.length - 1],
      latestVal: points[points.length - 1] ?? 0,
    };
  };

  const cpuSeries = buildSeries(cpuData);
  const memSeries = buildSeries(memData);
  const diskSeries = buildSeries(diskData);

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-2 select-none">
      {/* 凡例 & 最新値 */}
      <div className="flex items-center justify-between text-[11px] px-1 font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
            <span className="text-gray-700 dark:text-gray-300 font-bold">
              CPU:
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
              {cpuSeries.latestVal.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-xs" />
            <span className="text-gray-700 dark:text-gray-300 font-bold">
              メモリ:
            </span>
            <span className="text-purple-600 dark:text-purple-400 font-extrabold">
              {memSeries.latestVal.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-xs" />
            <span className="text-gray-700 dark:text-gray-300 font-bold">
              ディスク:
            </span>
            <span className="text-sky-600 dark:text-sky-400 font-extrabold">
              {diskSeries.latestVal.toFixed(1)}%
            </span>
          </div>
        </div>

        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          過去{Math.max(cpuData.length, memData.length, diskData.length)}件
        </span>
      </div>

      {/* 統合SVGチャート */}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${svgHeight}`}
          className="w-full overflow-hidden"
          style={{ height: `${height}px` }}
          preserveAspectRatio="none"
        >
          <defs>
            {/* CPU Gradient */}
            <linearGradient id="cpu-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(16, 185, 129, 0.35)" />
              <stop offset="100%" stopColor="rgba(16, 185, 129, 0.0)" />
            </linearGradient>

            {/* Memory Gradient */}
            <linearGradient id="mem-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(139, 92, 246, 0.30)" />
              <stop offset="100%" stopColor="rgba(139, 92, 246, 0.0)" />
            </linearGradient>

            {/* Disk Gradient */}
            <linearGradient id="disk-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(14, 165, 233, 0.20)" />
              <stop offset="100%" stopColor="rgba(14, 165, 233, 0.0)" />
            </linearGradient>
          </defs>

          {/* Y軸目盛り線 & ラベル */}
          {[100, 75, 50, 25, 0].map((percent) => {
            const y = paddingTop + chartHeight - (percent / 100) * chartHeight;
            return (
              <g key={percent}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-200/70 dark:text-gray-700/60"
                  strokeDasharray={
                    percent === 0 || percent === 100 ? "0" : "3,3"
                  }
                  strokeWidth={percent === 0 ? "1" : "0.75"}
                />
                {(percent === 100 || percent === 50 || percent === 0) && (
                  <text
                    x={paddingLeft - 4}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] fill-gray-400 dark:fill-gray-500 font-mono select-none"
                  >
                    {percent}%
                  </text>
                )}
              </g>
            );
          })}

          {/* エリアグラデーション */}
          {diskSeries.areaPath && (
            <path d={diskSeries.areaPath} fill="url(#disk-grad)" />
          )}
          {memSeries.areaPath && (
            <path d={memSeries.areaPath} fill="url(#mem-grad)" />
          )}
          {cpuSeries.areaPath && (
            <path d={cpuSeries.areaPath} fill="url(#cpu-grad)" />
          )}

          {/* ディスクライン */}
          {diskSeries.linePath && (
            <path
              d={diskSeries.linePath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* メモリライン */}
          {memSeries.linePath && (
            <path
              d={memSeries.linePath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* CPUライン */}
          {cpuSeries.linePath && (
            <path
              d={cpuSeries.linePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* 最新ポイントドット（飛び出し防止のため静的で安定した二重円表示） */}
          {diskSeries.last && (
            <g>
              <circle
                cx={diskSeries.last.x}
                cy={diskSeries.last.y}
                r="4.5"
                fill="rgba(14, 165, 233, 0.3)"
              />
              <circle
                cx={diskSeries.last.x}
                cy={diskSeries.last.y}
                r="2.5"
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth="1"
              />
            </g>
          )}
          {memSeries.last && (
            <g>
              <circle
                cx={memSeries.last.x}
                cy={memSeries.last.y}
                r="5"
                fill="rgba(139, 92, 246, 0.3)"
              />
              <circle
                cx={memSeries.last.x}
                cy={memSeries.last.y}
                r="3"
                fill="#8b5cf6"
                stroke="#ffffff"
                strokeWidth="1"
              />
            </g>
          )}
          {cpuSeries.last && (
            <g>
              <circle
                cx={cpuSeries.last.x}
                cy={cpuSeries.last.y}
                r="5.5"
                fill="rgba(16, 185, 129, 0.3)"
              />
              <circle
                cx={cpuSeries.last.x}
                cy={cpuSeries.last.y}
                r="3.5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * プロセスリスト表示コンポーネント
 */
function ProcessListView({
  title,
  type,
  processes,
  totalMemBytes,
}: {
  title: string;
  type: "cpu" | "mem";
  processes: ProcessInfo[];
  totalMemBytes: number;
}) {
  if (!processes || processes.length === 0) {
    return (
      <div className="p-2 text-center text-xs text-gray-400 dark:text-gray-500">
        プロセス情報を取得中または利用できません
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/60 space-y-1.5 animate-fadeIn">
      <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-1">
        <span>
          {title} (上位{processes.length}件)
        </span>
        <span>{type === "cpu" ? "%CPU" : "メモリ使用量"}</span>
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
        {processes.map((proc, idx) => {
          const mainVal =
            type === "cpu"
              ? `${proc.cpuPercent.toFixed(1)}%`
              : formatBytes(proc.rssBytes);
          const subVal =
            type === "cpu"
              ? formatBytes(proc.rssBytes)
              : `${proc.memPercent.toFixed(1)}%`;

          const barPercent =
            type === "cpu"
              ? Math.min(100, proc.cpuPercent)
              : totalMemBytes > 0
                ? Math.min(100, (proc.rssBytes / totalMemBytes) * 100 * 5) // 視覚的強調のため5倍スケール
                : proc.memPercent * 5;

          return (
            <div
              key={`${proc.pid}-${idx}`}
              className="p-1.5 rounded-lg bg-white/70 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 hover:bg-gray-100/80 dark:hover:bg-gray-700/70 transition-colors text-[11px]"
              title={proc.command}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-gray-200/60 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                    {proc.pid}
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {proc.name}
                  </span>
                  <span className="text-[9px] text-gray-400 truncate">
                    ({proc.user})
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-[10px] text-gray-400">{subVal}</span>
                  <span
                    className={cn(
                      "font-bold",
                      type === "cpu"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-purple-600 dark:text-purple-400",
                    )}
                  >
                    {mainVal}
                  </span>
                </div>
              </div>

              {/* ミニ使用率バー */}
              <div className="h-1 w-full bg-gray-200/70 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${Math.min(100, Math.max(2, barPercent))}%`,
                  }}
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    type === "cpu" ? "bg-emerald-500" : "bg-purple-500",
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SystemResourceWidget() {
  const apiFetchHook = useApiFetch();
  
  const [data, setData] = useState<SystemResourceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChart, setShowChart] = useState(() => {
    return (
      localStorage.getItem("taskduo_system_resource_show_chart") !== "false"
    );
  });
  const isClosed = false;
  const showSystemResourceWidget = true; const handleClose = () => {}; const setIsClosed = (_v: any) => {};

  // プロセス詳細の展開状態 ("none" | "cpu" | "memory")
  const [expandedDetail, setExpandedDetail] = useState<
    "none" | "cpu" | "memory"
  >("none");

  // 履歴データ（時系列統合グラフ用）
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [diskHistory, setDiskHistory] = useState<number[]>([]);

  // 更新頻度設定 (ミリ秒、デフォルト: 30秒)
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem("taskduo_system_resource_interval");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return 30000;
  });

  // ── Drag state ──────────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const TOP_MIN_Y = 80;

  const getSafeDefaultPos = () => ({
    x: Math.max(20, Math.min(window.innerWidth - 580, window.innerWidth - 590)),
    y: Math.max(
      TOP_MIN_Y,
      Math.min(window.innerHeight - 620, window.innerHeight - 640),
    ),
  });

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem("taskduo_system_resource_pos");
      if (saved) {
        const p = JSON.parse(saved);
        if (
          p.y < TOP_MIN_Y ||
          p.x < 0 ||
          p.x > window.innerWidth - 100 ||
          p.y > window.innerHeight - 100
        ) {
          localStorage.removeItem("taskduo_system_resource_pos");
          return getSafeDefaultPos();
        }
        return p;
      }
    } catch {}
    return getSafeDefaultPos();
  });
  const isDragging = useRef(false);

  // ウィンドウサイズ変化時やマウント時に位置を安全圏内に保つ
  useEffect(() => {
    const handleResize = () => {
      setPos((p) => {
        const panelW = panelRef.current?.offsetWidth ?? 560;
        const panelH = panelRef.current?.offsetHeight ?? 500;
        const maxX = Math.max(0, window.innerWidth - panelW);
        const maxY = Math.max(TOP_MIN_Y, window.innerHeight - panelH);
        if (p.x > maxX || p.y > maxY) {
          return {
            x: Math.min(p.x, maxX),
            y: Math.min(p.y, maxY),
          };
        }
        return p;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const panelW = panelRef.current?.offsetWidth ?? 560;
    const panelH = panelRef.current?.offsetHeight ?? 500;
    const newX = Math.max(
      0,
      Math.min(window.innerWidth - panelW, dragState.current.origX + dx),
    );
    const newY = Math.max(
      TOP_MIN_Y,
      Math.min(window.innerHeight - panelH, dragState.current.origY + dy),
    );
    setPos({ x: newX, y: newY });
  }, []);

  const onMouseUp = useCallback(() => {
    if (!dragState.current) return;
    dragState.current = null;
    isDragging.current = false;
    setPos((p) => {
      localStorage.setItem("taskduo_system_resource_pos", JSON.stringify(p));
      return p;
    });
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, select, input")) return;
      e.preventDefault();
      isDragging.current = true;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [pos, onMouseMove, onMouseUp],
  );

  // ── Data Fetching ───────────────────────────────────────────────────────
  const fetchResources = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetchHook("/api/system-resources");
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch`);
      const json: SystemResourceData = await res.json();
      if ((json as any).error) {
        throw new Error((json as any).error);
      }
      setData(json);
      setError(null);

      // 履歴データの追記
      if (json.cpu?.usagePercent !== undefined) {
        setCpuHistory((prev) => [
          ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
          json.cpu.usagePercent,
        ]);
      }
      if (json.memory?.usagePercent !== undefined) {
        setMemHistory((prev) => [
          ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
          json.memory.usagePercent,
        ]);
      }
      if (json.disk?.usagePercent !== undefined) {
        setDiskHistory((prev) => [
          ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
          json.disk.usagePercent,
        ]);
      }

      // キャッシュに保存
      try {
        localStorage.setItem(
          "taskduo_system_resource_cache",
          JSON.stringify(json),
        );
      } catch (e) {
        console.error("[SystemResourceWidget] Failed to cache data", e);
      }
    } catch (err: any) {
      console.error("[SystemResourceWidget] Fetch error:", err);
      setError(err.message || "Failed to retrieve system resources");
    } finally {
      setLoading(false);
    }
  };

  // ── Event Handlers ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleShow = () => {
      localStorage.removeItem("taskduo_hide_system_resource_widget");
      setIsClosed(false);
    };

    const handleHide = () => {
      localStorage.setItem("taskduo_hide_system_resource_widget", "true");
      setIsClosed(true);
    };

    const handleToggle = () => {
      setIsClosed((prev: any) => {
        const next = !prev;
        if (next) {
          localStorage.setItem("taskduo_hide_system_resource_widget", "true");
        } else {
          localStorage.removeItem("taskduo_hide_system_resource_widget");
        }
        return next;
      });
    };

    const handleCenter = () => {
      setPos(getSafeDefaultPos());
    };

    window.addEventListener("systemresource:show", handleShow);
    window.addEventListener("systemresource:hide", handleHide);
    window.addEventListener("systemresource:toggle", handleToggle);
    window.addEventListener("systemresource:refresh", () =>
      fetchResources(false),
    );
    window.addEventListener("widgets:center_windows", handleCenter);

    (window as any).resetSystemResourceWidget = () => {
      localStorage.removeItem("taskduo_hide_system_resource_widget");
      localStorage.removeItem("taskduo_system_resource_pos");
      localStorage.removeItem("taskduo_system_resource_interval");
      localStorage.removeItem("taskduo_system_resource_show_chart");
      setIsClosed(false);
      setIsMinimized(false);
      setShowChart(true);
      setRefreshInterval(30000);
      setExpandedDetail("none");
      setPos(getSafeDefaultPos());
    };

    return () => {
      window.removeEventListener("systemresource:show", handleShow);
      window.removeEventListener("systemresource:hide", handleHide);
      window.removeEventListener("systemresource:toggle", handleToggle);
      window.removeEventListener("widgets:center_windows", handleCenter);
    };
  }, []);

  // ── Polling by Interval ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showSystemResourceWidget || isClosed) return;

    // 初回キャッシュ読み込み
    const cached = localStorage.getItem("taskduo_system_resource_cache");
    if (cached && !data) {
      try {
        const parsed = JSON.parse(cached);
        setData(parsed);
        if (parsed.cpu?.usagePercent !== undefined) {
          setCpuHistory([parsed.cpu.usagePercent]);
        }
        if (parsed.memory?.usagePercent !== undefined) {
          setMemHistory([parsed.memory.usagePercent]);
        }
        if (parsed.disk?.usagePercent !== undefined) {
          setDiskHistory([parsed.disk.usagePercent]);
        }
      } catch (e) {
        console.error(e);
      }
    }

    // 初回即時フェッチ
    fetchResources(true);

    if (refreshInterval <= 0) return;

    const timer = setInterval(() => {
      fetchResources(true);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [showSystemResourceWidget, isClosed, refreshInterval]);

  const handleIntervalChange = (newVal: number) => {
    setRefreshInterval(newVal);
    localStorage.setItem("taskduo_system_resource_interval", newVal.toString());
  };

  const toggleChart = () => {
    setShowChart((prev) => {
      const next = !prev;
      localStorage.setItem(
        "taskduo_system_resource_show_chart",
        next.toString(),
      );
      return next;
    });
  };

  

  const cpuUsage = data?.cpu?.usagePercent ?? 0;
  const memUsage = data?.memory?.usagePercent ?? 0;
  const diskUsage = data?.disk?.usagePercent ?? 0;

  const cpuColor = getUsageColor(cpuUsage);
  const memColor = getUsageColor(memUsage);
  const diskColor = getUsageColor(diskUsage);

  return (
    <div
      ref={panelRef}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }}
      className={cn(
        "fixed z-40 select-none bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-gray-200 dark:border-gray-700 shadow-lg rounded-2xl p-4 text-xs text-gray-800 dark:text-gray-200 hover:shadow-xl transition-shadow",
        isMinimized ? "w-80" : "w-[560px]",
        "flex flex-col overflow-hidden",
      )}
    >
      {/* ── Header (AI Quota Monitor 準拠スタイル) ────────────────────────── */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex items-center justify-between gap-4 mb-3 border-b border-gray-100 dark:border-gray-700/50 pb-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100 min-w-0">
          <Activity className="w-4 h-4 text-primary-500 shrink-0" />
          <span className="truncate">System Resource Monitor</span>
          {data?.os?.hostname && (
            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
              {data.os.hostname}
            </span>
          )}
          {loading && (
            <RefreshCw className="w-3 h-3 animate-spin text-gray-400 shrink-0" />
          )}
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Chart Toggle */}
          {!isMinimized && (
            <button
              type="button"
              onClick={toggleChart}
              title={showChart ? "グラフを非表示" : "グラフを表示"}
              className={cn(
                "p-1 rounded-lg transition-colors",
                showChart
                  ? "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50",
              )}
            >
              <LineChart className="w-4 h-4" />
            </button>
          )}

          {/* Refresh Interval Dropdown */}
          {!isMinimized && (
            <select
              value={refreshInterval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              title="自動更新間隔"
              className="text-[11px] font-medium bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-xs"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => fetchResources(false)}
            disabled={loading}
            title="手動更新"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-90 disabled:opacity-50"
          >
            <RefreshCw
              className={cn(
                "w-4 h-4",
                loading && "animate-spin text-primary-500",
              )}
            />
          </button>

          {/* Minimize / Maximize */}
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "展開" : "最小化"}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
          >
            {isMinimized ? (
              <Square className="w-4 h-4" />
            ) : (
              <Minus className="w-4 h-4" />
            )}
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            title="非表示にする"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {!isMinimized ? (
        <div className="space-y-2.5 max-h-[75vh] overflow-y-auto pr-0.5 custom-scrollbar">
          {error && (
            <div className="text-rose-500 flex items-center gap-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="font-semibold truncate">{error}</span>
            </div>
          )}

          {/* 1. 統合推移グラフ (CPU, Memory, Disk) */}
          {showChart && (
            <CombinedResourceChart
              cpuData={cpuHistory}
              memData={memHistory}
              diskData={diskHistory}
              height={85}
            />
          )}

          {/* 2. CPU Usage Card (クリックでプロセス展開) */}
          <div className="bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-1.5">
            <div
              onClick={() =>
                setExpandedDetail((prev) => (prev === "cpu" ? "none" : "cpu"))
              }
              className="flex items-center justify-between text-xs cursor-pointer hover:opacity-80 transition-opacity"
              title="クリックしてプロセス毎のCPU使用量を表示"
            >
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  CPU
                </span>
                {data?.cpu?.cores && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    ({data.cpu.cores} Cores)
                  </span>
                )}
                {data?.cpu?.model && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[140px]">
                    {data.cpu.model}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {data?.cpu?.loadAvg && data.cpu.loadAvg.length > 0 && (
                  <span
                    className="text-[10px] text-gray-400 dark:text-gray-500 font-mono"
                    title="Load Average (1m, 5m, 15m)"
                  >
                    LA: {data.cpu.loadAvg.join(", ")}
                  </span>
                )}
                <span
                  className={cn(
                    "font-extrabold text-sm font-mono",
                    cpuColor.text,
                  )}
                >
                  {cpuUsage.toFixed(1)}%
                </span>
                <span className="text-gray-400 p-0.5">
                  {expandedDetail === "cpu" ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.min(100, Math.max(0, cpuUsage))}%` }}
                className={cn(
                  "h-full transition-all duration-500 rounded-full",
                  cpuColor.bar,
                )}
              />
            </div>

            {/* CPU プロセスリスト展開エリア */}
            {expandedDetail === "cpu" && (
              <ProcessListView
                title="CPU 高負荷プロセス"
                type="cpu"
                processes={data?.topCpuProcesses || []}
                totalMemBytes={data?.memory?.totalBytes || 0}
              />
            )}
          </div>

          {/* 3. Memory (RAM) Card (クリックでプロセス展開) */}
          <div className="bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-1.5">
            <div
              onClick={() =>
                setExpandedDetail((prev) =>
                  prev === "memory" ? "none" : "memory",
                )
              }
              className="flex items-center justify-between text-xs cursor-pointer hover:opacity-80 transition-opacity"
              title="クリックしてプロセス毎のメモリ使用量を表示"
            >
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  メモリ (RAM)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                  {formatBytes(data?.memory?.usedBytes ?? 0)} /{" "}
                  {formatBytes(data?.memory?.totalBytes ?? 0)}
                </span>
                <span
                  className={cn(
                    "font-extrabold text-sm font-mono",
                    memColor.text,
                  )}
                >
                  {memUsage.toFixed(1)}%
                </span>
                <span className="text-gray-400 p-0.5">
                  {expandedDetail === "memory" ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.min(100, Math.max(0, memUsage))}%` }}
                className={cn(
                  "h-full transition-all duration-500 rounded-full",
                  memColor.bar,
                )}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400 font-mono pt-0.5">
              <span title="利用可能空きメモリ（解放可能なキャッシュ領域等を含みます）">
                利用可能空き: {formatBytes(data?.memory?.freeBytes ?? 0)}
              </span>
              <span>合計: {formatBytes(data?.memory?.totalBytes ?? 0)}</span>
            </div>

            {/* メモリ プロセスリスト展開エリア */}
            {expandedDetail === "memory" && (
              <ProcessListView
                title="メモリ大量消費プロセス"
                type="mem"
                processes={data?.topMemProcesses || []}
                totalMemBytes={data?.memory?.totalBytes || 0}
              />
            )}
          </div>

          {/* 4. Disk Space Card */}
          <div className="bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  ディスク容量
                </span>
                {data?.disk?.path && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                    ({data.disk.path})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                  {formatBytes(data?.disk?.usedBytes ?? 0)} /{" "}
                  {formatBytes(data?.disk?.totalBytes ?? 0)}
                </span>
                <span
                  className={cn(
                    "font-extrabold text-sm font-mono",
                    diskColor.text,
                  )}
                >
                  {diskUsage.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Storage Progress Bar */}
            <div className="h-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, Math.max(0, diskUsage))}%` }}
                className={cn(
                  "h-full transition-all duration-500",
                  diskColor.bar,
                )}
              />
              <div
                style={{
                  width: `${Math.max(0, 100 - Math.min(100, diskUsage))}%`,
                }}
                className="h-full bg-emerald-500/25 dark:bg-emerald-400/25"
              />
            </div>

            <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400 font-mono pt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 inline-block" />
                使用中: {formatBytes(data?.disk?.usedBytes ?? 0)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 inline-block" />
                空き: {formatBytes(data?.disk?.freeBytes ?? 0)}
              </span>
              <span>合計: {formatBytes(data?.disk?.totalBytes ?? 0)}</span>
            </div>
          </div>

          {/* ── Footer Stats ──────────────────────────────────────────────── */}
          <div className="pt-1.5 flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-gray-400" />
              <span>
                稼働時間: {formatUptime(data?.os?.uptimeSeconds ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              {data?.os?.platform && (
                <span className="uppercase">
                  {data.os.platform} ({data.os.arch})
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Minimized View */
        <div className="flex items-center justify-between text-xs font-mono py-0.5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-emerald-500" />
              <span className={cpuColor.text}>{cpuUsage.toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-1">
              <Server className="w-3.5 h-3.5 text-purple-500" />
              <span className={memColor.text}>{memUsage.toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-sky-500" />
              <span className={diskColor.text}>{diskUsage.toFixed(0)}%</span>
            </span>
          </div>
          <span className="text-[10px] text-gray-400">
            {formatUptime(data?.os?.uptimeSeconds ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}
