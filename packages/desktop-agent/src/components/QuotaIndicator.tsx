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

import { X, Gauge, AlertTriangle, RefreshCw } from "lucide-react";

interface QuotaLimit {
  remaining_percent: number;
  used_percent: number;
  refreshes_in?: string;
  resets_at?: string;
}

interface QuotaData {
  claude?: {
    total_cost?: number;
    is_api_billing?: boolean;
    session?: QuotaLimit;
    weekly?: {
      [key: string]: QuotaLimit;
    };
    error?: string;
  };
  agy?: {
    /** Legacy keys (may still be present) */
    weekly_limit?: QuotaLimit;
    five_hour_limit?: QuotaLimit;
    /** New per-group keys */
    gemini_weekly_limit?: QuotaLimit;
    gemini_five_hour_limit?: QuotaLimit;
    claude_gpt_weekly_limit?: QuotaLimit;
    claude_gpt_five_hour_limit?: QuotaLimit;
    error?: string;
  };
  kiro?: {
    [key: string]: QuotaLimit | string | undefined;
    error?: string;
  };
  error?: string;
}

export function QuotaIndicator() {
  const apiFetchHook = useApiFetch();
  
  const language = "ja";
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isClosed = false;
  const showQuotaIndicator = true;
  const handleClose = () => {}; const setIsClosed = (_v: any) => {};

  // ── Drag state ──────────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const TOP_MIN_Y = 110; // アプリナビバー高さ分を確保（余裕をもって110px）

  const getSafeDefaultPos = () => ({
    x: Math.max(
      20,
      Math.min(window.innerWidth - 580, window.innerWidth / 2 - 280),
    ),
    y: Math.max(
      TOP_MIN_Y,
      Math.min(window.innerHeight - 420, window.innerHeight - 450),
    ),
  });

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem("taskduo_quota_pos");
      if (saved) {
        const p = JSON.parse(saved);
        if (
          p.y < TOP_MIN_Y ||
          p.x < 0 ||
          p.x > window.innerWidth - 100 ||
          p.y > window.innerHeight - 100
        ) {
          localStorage.removeItem("taskduo_quota_pos");
          return getSafeDefaultPos();
        }
        return p;
      }
    } catch {}
    return getSafeDefaultPos();
  });
  const isDragging = useRef(false);

  // マウント時にも位置を検証（古いキャッシュ対策）
  useEffect(() => {
    const safe = getSafeDefaultPos();
    setPos((p) => {
      if (
        p.y < TOP_MIN_Y ||
        p.x < 0 ||
        p.x > window.innerWidth - 100 ||
        p.y > window.innerHeight - 100
      ) {
        localStorage.removeItem("taskduo_quota_pos");
        return safe;
      }
      return p;
    });

    (window as any).resetQuotaIndicator = () => {
      localStorage.removeItem("taskduo_hide_quota_indicator");
      localStorage.removeItem("taskduo_quota_pos");
      setIsClosed(false);
      setPos(getSafeDefaultPos());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const panelW = panelRef.current?.offsetWidth ?? 480;
    const panelH = panelRef.current?.offsetHeight ?? 400;
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
      localStorage.setItem("taskduo_quota_pos", JSON.stringify(p));
      return p;
    });
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return; // ignore close btn
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
  // ────────────────────────────────────────────────────────────────────────

  const fetchCredits = async (silent = false, force = false) => {
    if (!silent) setLoading(true);
    try {
      const url = force ? "/api/credits?force=true" : "/api/credits";
      const res = await apiFetchHook(url);
      if (!res.ok) throw new Error("Failed to fetch quota info");
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
      setError(null);
      // キャッシュに保存
      try {
        localStorage.setItem("taskduo_quota_cache_data", JSON.stringify(json));
        localStorage.setItem(
          "taskduo_quota_cache_timestamp",
          Date.now().toString(),
        );
      } catch (e) {
        console.error("[QuotaIndicator] Failed to cache data", e);
      }
    } catch (err: any) {
      console.error("[QuotaIndicator] Error:", err);
      setError(err.message || "Quota retrieval error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleShow = () => {
      localStorage.removeItem("taskduo_hide_quota_indicator");
      localStorage.removeItem("taskduo_quota_pos");
      setPos(getSafeDefaultPos());
      setIsClosed(false);
    };

    const handleHide = () => {
      localStorage.setItem("taskduo_hide_quota_indicator", "true");
      setIsClosed(true);
    };

    const handleToggle = () => {
      setIsClosed((_prev: any) => {
        const next = !_prev;
        if (next) {
          localStorage.setItem("taskduo_hide_quota_indicator", "true");
        } else {
          localStorage.removeItem("taskduo_hide_quota_indicator");
        }
        return next;
      });
    };

    window.addEventListener("quota:show", handleShow);
    window.addEventListener("quota:hide", handleHide);
    window.addEventListener("quota:toggle", handleToggle);
    return () => {
      window.removeEventListener("quota:show", handleShow);
      window.removeEventListener("quota:hide", handleHide);
      window.removeEventListener("quota:toggle", handleToggle);
    };
  }, []);

  useEffect(() => {
    if (showQuotaIndicator) {
      setIsClosed(false);
    }
  }, [showQuotaIndicator]);

  useEffect(() => {
    if (!showQuotaIndicator || isClosed) return;

    // 1. キャッシュから読み込む
    const cachedData = localStorage.getItem("taskduo_quota_cache_data");
    const cachedTime = localStorage.getItem("taskduo_quota_cache_timestamp");
    let shouldFetch = true;

    if (cachedData && cachedTime) {
      try {
        const parsed = JSON.parse(cachedData);
        setData(parsed);
        const timeDiff = Date.now() - parseInt(cachedTime, 10);
        // 5分 (300,000ms) 未満であれば、初期ロードでの fetch をスキップする
        if (timeDiff < 5 * 60 * 1000) {
          shouldFetch = false;
        }
      } catch (e) {
        console.error("[QuotaIndicator] Cached parsing error", e);
      }
    }

    if (shouldFetch) {
      fetchCredits(true);
    }

    // 2. 5分毎のポーリング設定
    const interval = setInterval(
      () => {
        fetchCredits(true);
      },
      5 * 60 * 1000,
    );

    // 3. quota:refresh イベント時の強制リフレッシュ
    const handleRefresh = () => {
      fetchCredits(true, true);
    };
    window.addEventListener("quota:refresh", handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("quota:refresh", handleRefresh);
    };
  }, [showQuotaIndicator, isClosed]);

  // If globally disabled, or closed by user, don't render anything
  

  const getProgressBarColor = (remPercent: number) => {
    if (remPercent <= 20) return "bg-rose-500 animate-pulse";
    if (remPercent <= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const timeUnits = {
    ja: {
      day: "日",
      hour: "時間",
      min: "分",
      sec: "秒",
      resets: "リセットまで",
      resetAt: "リセット:",
      resetsSuffix: "",
      unlimited: "制限なし",
      apiBilling: "従量課金",
      sessionCost: "Session Cost",
      sessionCostDesc: "セッションコスト",
    },
    en: {
      day: "d ",
      hour: "h ",
      min: "m",
      sec: "s",
      resets: "resets in",
      resetAt: "resets at:",
      resetsSuffix: "",
      unlimited: "Unlimited",
      apiBilling: "API Billing",
      sessionCost: "Session Cost",
      sessionCostDesc: "Session Cost",
    },
    zh: {
      day: "天",
      hour: "小时",
      min: "分",
      sec: "秒",
      resets: "距离重置",
      resetAt: "重置于:",
      resetsSuffix: "",
      unlimited: "无限制",
      apiBilling: "按量付费",
      sessionCost: "Session Cost",
      sessionCostDesc: "单次会话消费",
    },
    ko: {
      day: "일",
      hour: "시간",
      min: "분",
      sec: "초",
      resets: "리셋まで",
      resetAt: "리셋:",
      resetsSuffix: "",
      unlimited: "제한 없음",
      apiBilling: "종량제",
      sessionCost: "Session Cost",
      sessionCostDesc: "세션 비용",
    },
    fr: {
      day: "j ",
      hour: "h ",
      min: "m",
      sec: "s",
      resets: "réinitialisation dans",
      resetAt: "réinitialisation à:",
      resetsSuffix: "",
      unlimited: "Illimité",
      apiBilling: "Facturation API",
      sessionCost: "Session Cost",
      sessionCostDesc: "Coût de la session",
    },
  };

  const parseResetStringToDate = (str: string): Date | null => {
    if (!str) return null;
    const isoMs = Date.parse(str);
    if (!isNaN(isoMs)) {
      return new Date(isoMs);
    }
    const cleaned = str.replace(/\([^)]+\)/g, "").trim();
    const now = new Date();
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth();
    let targetDate = now.getDate();
    let targetHours = 0;
    let targetMinutes = 0;
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const mMatch = cleaned.match(
      /([a-zA-Z]{3})\s*(\d+)\s*(?:at)?\s*(\d+)\s*(am|pm)/i,
    );
    if (mMatch) {
      const mStr = mMatch[1].toLowerCase();
      const monthIndex = months.indexOf(mStr);
      if (monthIndex !== -1) {
        targetMonth = monthIndex;
      }
      targetDate = parseInt(mMatch[2], 10);
      let h = parseInt(mMatch[3], 10);
      const ampm = mMatch[4].toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      targetHours = h;
      targetMinutes = 0;
    } else {
      const tMatch = cleaned.match(/(\d+):(\d+)\s*(am|pm)?/i);
      if (tMatch) {
        let h = parseInt(tMatch[1], 10);
        const m = parseInt(tMatch[2], 10);
        const ampm = tMatch[3] ? tMatch[3].toLowerCase() : "";
        if (ampm === "pm" && h < 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        targetHours = h;
        targetMinutes = m;
        const testDate = new Date(
          targetYear,
          targetMonth,
          targetDate,
          targetHours,
          targetMinutes,
        );
        if (testDate.getTime() < now.getTime()) {
          targetDate += 1;
        }
      } else {
        return null;
      }
    }
    return new Date(
      targetYear,
      targetMonth,
      targetDate,
      targetHours,
      targetMinutes,
    );
  };

  const calculateTimeRemainingPercent = (
    totalDurationMs: number,
    refreshesInStr?: string,
    resetsAtStr?: string,
  ): number | null => {
    if (resetsAtStr) {
      const targetDate = parseResetStringToDate(resetsAtStr);
      if (targetDate) {
        const diffMs = targetDate.getTime() - Date.now();
        if (diffMs > 0) {
          return Math.min(100, Math.max(0, (diffMs / totalDurationMs) * 100));
        }
        return 0;
      }
    }
    if (refreshesInStr) {
      const hMatch = refreshesInStr.match(/(\d+)\s*h/);
      const mMatch = refreshesInStr.match(/(\d+)\s*m/);
      const sMatch = refreshesInStr.match(/(\d+)\s*s/);
      let hours = hMatch ? parseInt(hMatch[1], 10) : 0;
      let mins = mMatch ? parseInt(mMatch[1], 10) : 0;
      let secs = sMatch ? parseInt(sMatch[1], 10) : 0;
      if (hours === 0 && mins === 0 && secs === 0) {
        const val = parseInt(refreshesInStr, 10);
        if (!isNaN(val)) hours = val;
      }
      const diffMs = (hours * 3600 + mins * 60 + secs) * 1000;
      if (diffMs > 0) {
        return Math.min(100, Math.max(0, (diffMs / totalDurationMs) * 100));
      }
      return 0;
    }
    return null;
  };

  const formatRelativeResetTime = (
    refreshesInStr?: string,
    resetsAtStr?: string,
  ) => {
    const units = timeUnits[language as keyof typeof timeUnits] || timeUnits.en;
    if (resetsAtStr) {
      const targetDate = parseResetStringToDate(resetsAtStr);
      if (targetDate) {
        const diffMs = targetDate.getTime() - Date.now();
        if (diffMs > 0) {
          const totalSecs = Math.floor(diffMs / 1000);
          const totalMins = Math.floor(totalSecs / 60);
          const mins = totalMins % 60;
          const totalHours = Math.floor(totalMins / 60);
          const hours = totalHours % 24;
          const days = Math.floor(totalHours / 24);
          let result = "";
          if (days > 0) result += `${days}${units.day}`;
          if (hours > 0 || days > 0) result += `${hours}${units.hour}`;
          if (mins > 0 || hours > 0 || days > 0)
            result += `${mins}${units.min}`;
          return `${units.resets} ${result.trim()}${units.resetsSuffix}`;
        }
      }
      return `${units.resetAt} ${resetsAtStr}`;
    }
    if (refreshesInStr) {
      const hMatch = refreshesInStr.match(/(\d+)\s*h/);
      const mMatch = refreshesInStr.match(/(\d+)\s*m/);
      const sMatch = refreshesInStr.match(/(\d+)\s*s/);
      let hours = hMatch ? parseInt(hMatch[1], 10) : 0;
      let mins = mMatch ? parseInt(mMatch[1], 10) : 0;
      let secs = sMatch ? parseInt(sMatch[1], 10) : 0;
      if (hours === 0 && mins === 0 && secs === 0) {
        const val = parseInt(refreshesInStr, 10);
        if (!isNaN(val)) hours = val;
      }
      if (hours > 0 || mins > 0 || secs > 0) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        let result = "";
        if (days > 0) result += `${days}${units.day}`;
        if (remHours > 0 || days > 0) result += `${remHours}${units.hour}`;
        if (mins > 0 || remHours > 0 || days > 0)
          result += `${mins}${units.min}`;
        if (secs > 0 && days === 0 && remHours === 0)
          result += `${secs}${units.sec}`;
        return `${units.resets} ${result.trim()}${units.resetsSuffix}`;
      }
      return `${units.resets} ${refreshesInStr}${units.resetsSuffix}`;
    }
    return "十分";
  };

  const getClaudeSession = data?.claude?.session || null;
  // Extract specific Claude weekly limits
  const getClaudeWeekly =
    data?.claude?.weekly?.all_models || data?.claude?.weekly?.allmodels || null;
  const getClaudeFable = data?.claude?.weekly?.fable || null;
  const getClaudeTotalCost = data?.claude?.total_cost;
  const isClaudeApiBilling = data?.claude?.is_api_billing || false;
  const units = timeUnits[language as keyof typeof timeUnits] || timeUnits.en;

  // Agy 4 limits (gemini/claude_gpt × weekly/five_hour)
  const getAgyGeminiWeekly = data?.agy?.gemini_weekly_limit || null;
  const getAgyGeminiFiveHour = data?.agy?.gemini_five_hour_limit || null;
  const getAgyClaudeGptWeekly = data?.agy?.claude_gpt_weekly_limit || null;
  const getAgyClaudeGptFiveHour = data?.agy?.claude_gpt_five_hour_limit || null;

  const DURATION_WEEKLY = 7 * 24 * 60 * 60 * 1000;
  const DURATION_5HOUR = 5 * 60 * 60 * 1000;
  const DURATION_SESSION = 5 * 60 * 60 * 1000; // Default to 5 hours for Claude session

  const claudeSessionTimePercent = getClaudeSession
    ? calculateTimeRemainingPercent(
        DURATION_SESSION,
        undefined,
        getClaudeSession.resets_at,
      )
    : null;

  const getErrorTitle = (agentName: string, err: any): string => {
    if (!err) return `${agentName} CLI 未検出`;
    const rawMsg =
      typeof err === "string"
        ? err
        : typeof err?.error === "string"
          ? err.error
          : JSON.stringify(err);
    const lower = rawMsg.toLowerCase();
    if (
      lower.includes("login") ||
      lower.includes("ログイン") ||
      lower.includes("expired") ||
      lower.includes("期限切れ") ||
      lower.includes("auth")
    ) {
      return "認証エラー (ログインが必要です)";
    }
    return `${agentName} CLI 未検出`;
  };

  const formatAgentError = (agentName: string, err: any): string => {
    if (!err) return `${agentName} CLI がインストールされていません`;
    const rawMsg =
      typeof err === "string"
        ? err
        : typeof err?.error === "string"
          ? err.error
          : JSON.stringify(err);
    const lower = rawMsg.toLowerCase();
    if (
      lower.includes("not installed") ||
      lower.includes("no such file") ||
      lower.includes("errno 2") ||
      lower.includes("not found")
    ) {
      return `${agentName} CLI がインストールされていません`;
    }
    return rawMsg;
  };

  const claudeError = data?.claude?.error;
  const agyError = data?.agy?.error;
  const getKiroLimits = data?.kiro || null;
  const kiroKeys = getKiroLimits
    ? Object.keys(getKiroLimits).filter((k) => k !== "error")
    : [];
  const kiroError = data?.kiro?.error;

  const claudeWeeklyTimePercent = getClaudeWeekly
    ? calculateTimeRemainingPercent(
        DURATION_WEEKLY,
        undefined,
        getClaudeWeekly.resets_at,
      )
    : null;

  const claudeFableTimePercent = getClaudeFable
    ? calculateTimeRemainingPercent(
        DURATION_WEEKLY,
        undefined,
        getClaudeFable.resets_at,
      )
    : null;

  const geminiWeeklyTimePercent = getAgyGeminiWeekly
    ? calculateTimeRemainingPercent(
        DURATION_WEEKLY,
        getAgyGeminiWeekly.refreshes_in,
        undefined,
      )
    : null;

  const geminiFiveHourTimePercent = getAgyGeminiFiveHour
    ? calculateTimeRemainingPercent(
        DURATION_5HOUR,
        getAgyGeminiFiveHour.refreshes_in,
        undefined,
      )
    : null;

  const claudeGptWeeklyTimePercent = getAgyClaudeGptWeekly
    ? calculateTimeRemainingPercent(
        DURATION_WEEKLY,
        getAgyClaudeGptWeekly.refreshes_in,
        undefined,
      )
    : null;

  const claudeGptFiveHourTimePercent = getAgyClaudeGptFiveHour
    ? calculateTimeRemainingPercent(
        DURATION_5HOUR,
        getAgyClaudeGptFiveHour.refreshes_in,
        undefined,
      )
    : null;

  const hasKiroAlert = getKiroLimits
    ? Object.values(getKiroLimits).some(
        (l) =>
          l &&
          typeof l === "object" &&
          typeof (l as any).remaining_percent === "number" &&
          (l as any).remaining_percent <= 20,
      )
    : false;

  const hasAlert =
    (getClaudeSession && getClaudeSession.remaining_percent <= 20) ||
    (getClaudeWeekly && getClaudeWeekly.remaining_percent <= 20) ||
    (getClaudeFable && getClaudeFable.remaining_percent <= 20) ||
    (getAgyGeminiWeekly && getAgyGeminiWeekly.remaining_percent <= 20) ||
    (getAgyGeminiFiveHour && getAgyGeminiFiveHour.remaining_percent <= 20) ||
    (getAgyClaudeGptWeekly && getAgyClaudeGptWeekly.remaining_percent <= 20) ||
    (getAgyClaudeGptFiveHour &&
      getAgyClaudeGptFiveHour.remaining_percent <= 20) ||
    hasKiroAlert;

  return (
    <div
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
      className={`fixed z-40 w-[560px] bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border ${
        hasAlert
          ? "border-rose-300 dark:border-rose-800/50 shadow-rose-100 dark:shadow-none"
          : "border-gray-200 dark:border-gray-700"
      } shadow-lg rounded-2xl p-4 text-xs text-gray-800 dark:text-gray-200 hover:shadow-xl select-none`}
    >
      <div
        className="flex items-center justify-between gap-4 mb-3 border-b border-gray-100 dark:border-gray-700/50 pb-2 cursor-grab active:cursor-grabbing"
        onMouseDown={onHeaderMouseDown}
      >
        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100">
          <Gauge
            className={`w-4 h-4 ${hasAlert ? "text-rose-500" : "text-primary-500"}`}
          />
          <span>AI Quota Monitor</span>
          {loading && (
            <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => fetchCredits(false, true)}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-90"
            title="手動更新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
            title="非表示にする"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="text-rose-500 flex flex-col items-center justify-center gap-2 py-3 text-center">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      ) : !data ? (
        <div className="text-gray-400 dark:text-gray-500 animate-pulse py-3 text-center flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-gray-300 dark:text-gray-600" />
          <span>クォータ情報を読み込み中...</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-5 gap-y-3.5">
          {/* ── Column 1: Claude (Orange) ── */}
          <div className="flex flex-col gap-3.5">
            <div className="text-[9px] font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wider">
              Claude
            </div>

            {claudeError ? (
              <div className="text-orange-400/80 dark:text-orange-300/70 text-[10px] italic flex flex-col justify-center h-full gap-1 p-2.5 bg-orange-50/50 dark:bg-orange-950/20 rounded-xl border border-orange-100 dark:border-orange-900/30">
                <span className="font-semibold text-orange-600 dark:text-orange-400">
                  {getErrorTitle("Claude Code", claudeError)}
                </span>
                <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                  {formatAgentError("Claude Code", claudeError)}
                </span>
              </div>
            ) : (
              <>
                {/* Session */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getClaudeSession ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Session
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {Math.max(0, getClaudeSession.remaining_percent)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getClaudeSession.remaining_percent)}`}
                          style={{
                            width: `${getClaudeSession.remaining_percent}%`,
                          }}
                        />
                        {claudeSessionTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getClaudeSession.remaining_percent <
                              claudeSessionTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${claudeSessionTimePercent}%` }}
                            title={`時間の残り: ${claudeSessionTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div
                        className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate"
                        title={getClaudeSession.resets_at}
                      >
                        {formatRelativeResetTime(
                          undefined,
                          getClaudeSession.resets_at,
                        )}
                      </div>
                    </>
                  ) : isClaudeApiBilling ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Session
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-1">
                          {units.unlimited}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        {units.apiBilling}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400 dark:text-gray-600 text-[10px] italic flex items-center h-full">
                      Session: N/A
                    </div>
                  )}
                </div>

                {/* Weekly (All) */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getClaudeWeekly ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Weekly (All)
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {getClaudeWeekly.remaining_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getClaudeWeekly.remaining_percent)}`}
                          style={{
                            width: `${getClaudeWeekly.remaining_percent}%`,
                          }}
                        />
                        {claudeWeeklyTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getClaudeWeekly.remaining_percent <
                              claudeWeeklyTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${claudeWeeklyTimePercent}%` }}
                            title={`時間の残り: ${claudeWeeklyTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div
                        className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate"
                        title={getClaudeWeekly.resets_at}
                      >
                        {formatRelativeResetTime(
                          undefined,
                          getClaudeWeekly.resets_at,
                        )}
                      </div>
                    </>
                  ) : isClaudeApiBilling ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Weekly (All)
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-1">
                          {units.unlimited}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        {units.apiBilling}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400 dark:text-gray-600 text-[10px] italic flex items-center h-full">
                      Weekly (All): N/A
                    </div>
                  )}
                </div>

                {/* Weekly (Fable) / API Billing */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getClaudeFable ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Weekly (Fable)
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {getClaudeFable.remaining_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getClaudeFable.remaining_percent)}`}
                          style={{
                            width: `${getClaudeFable.remaining_percent}%`,
                          }}
                        />
                        {claudeFableTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getClaudeFable.remaining_percent <
                              claudeFableTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${claudeFableTimePercent}%` }}
                            title={`時間の残り: ${claudeFableTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div
                        className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate"
                        title={getClaudeFable.resets_at}
                      >
                        {formatRelativeResetTime(
                          undefined,
                          getClaudeFable.resets_at,
                        )}
                      </div>
                    </>
                  ) : isClaudeApiBilling && getClaudeTotalCost !== undefined ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          API Billing
                        </span>
                      </div>
                      <div className="text-gray-700 dark:text-gray-300 font-bold text-[11px] mb-1">
                        Cost: ${getClaudeTotalCost.toFixed(4)}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        従量課金
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-300 dark:text-gray-700 text-[9px] italic flex items-center h-full">
                      Fable: -
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Column 2: Antigravity (Blue) ── */}
          <div className="flex flex-col gap-3.5">
            <div className="text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">
              Antigravity
            </div>

            {agyError ? (
              <div className="text-blue-400/80 dark:text-blue-300/70 text-[10px] italic flex flex-col justify-center h-full gap-1 p-2.5 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {getErrorTitle("Antigravity", agyError)}
                </span>
                <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                  {formatAgentError("Antigravity", agyError)}
                </span>
              </div>
            ) : (
              <>
                {/* Gemini Weekly */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getAgyGeminiWeekly ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Gemini Weekly
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {getAgyGeminiWeekly.remaining_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getAgyGeminiWeekly.remaining_percent)}`}
                          style={{
                            width: `${getAgyGeminiWeekly.remaining_percent}%`,
                          }}
                        />
                        {geminiWeeklyTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getAgyGeminiWeekly.remaining_percent <
                              geminiWeeklyTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${geminiWeeklyTimePercent}%` }}
                            title={`時間の残り: ${geminiWeeklyTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        {formatRelativeResetTime(
                          getAgyGeminiWeekly.refreshes_in,
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400 dark:text-gray-600 text-[10px] italic flex items-center h-full">
                      Gemini Weekly: N/A
                    </div>
                  )}
                </div>

                {/* Gemini 5-Hour */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getAgyGeminiFiveHour ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Gemini 5-Hour
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {getAgyGeminiFiveHour.remaining_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getAgyGeminiFiveHour.remaining_percent)}`}
                          style={{
                            width: `${getAgyGeminiFiveHour.remaining_percent}%`,
                          }}
                        />
                        {geminiFiveHourTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getAgyGeminiFiveHour.remaining_percent <
                              geminiFiveHourTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${geminiFiveHourTimePercent}%` }}
                            title={`時間の残り: ${geminiFiveHourTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        {formatRelativeResetTime(
                          getAgyGeminiFiveHour.refreshes_in,
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400 dark:text-gray-600 text-[10px] italic flex items-center h-full">
                      Gemini 5-Hour: N/A
                    </div>
                  )}
                </div>

                {/* Claude+GPT Weekly */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getAgyClaudeGptWeekly ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Claude+GPT Weekly
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {getAgyClaudeGptWeekly.remaining_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getAgyClaudeGptWeekly.remaining_percent)}`}
                          style={{
                            width: `${getAgyClaudeGptWeekly.remaining_percent}%`,
                          }}
                        />
                        {claudeGptWeeklyTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getAgyClaudeGptWeekly.remaining_percent <
                              claudeGptWeeklyTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${claudeGptWeeklyTimePercent}%` }}
                            title={`時間の残り: ${claudeGptWeeklyTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        {formatRelativeResetTime(
                          getAgyClaudeGptWeekly.refreshes_in,
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-300 dark:text-gray-700 text-[9px] italic flex items-center h-full">
                      Claude+GPT Weekly: -
                    </div>
                  )}
                </div>

                {/* Claude+GPT 5-Hour */}
                <div className="group relative min-h-[46px] flex flex-col justify-between">
                  {getAgyClaudeGptFiveHour ? (
                    <>
                      <div className="flex justify-between items-center mb-1 text-[10px]">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                          Claude+GPT 5-Hour
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                          {getAgyClaudeGptFiveHour.remaining_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(getAgyClaudeGptFiveHour.remaining_percent)}`}
                          style={{
                            width: `${getAgyClaudeGptFiveHour.remaining_percent}%`,
                          }}
                        />
                        {claudeGptFiveHourTimePercent !== null && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 w-[3px] -ml-[1.5px] z-10 rounded-full border border-white dark:border-gray-800 shadow-sm ${
                              getAgyClaudeGptFiveHour.remaining_percent <
                              claudeGptFiveHourTimePercent
                                ? "bg-rose-500 animate-pulse"
                                : "bg-emerald-500"
                            }`}
                            style={{ left: `${claudeGptFiveHourTimePercent}%` }}
                            title={`時間の残り: ${claudeGptFiveHourTimePercent.toFixed(1)}%`}
                          />
                        )}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                        {formatRelativeResetTime(
                          getAgyClaudeGptFiveHour.refreshes_in,
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400 dark:text-gray-600 text-[10px] italic flex items-center h-full">
                      Claude+GPT 5-Hour: N/A
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Column 3: Kiro (Purple) ── */}
          <div className="flex flex-col gap-3.5">
            <div className="text-[9px] font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider">
              Kiro
            </div>

            {kiroError ? (
              <div className="text-purple-400/80 dark:text-purple-300/70 text-[10px] italic flex flex-col justify-center h-full gap-1 p-2.5 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <span className="font-semibold text-purple-600 dark:text-purple-400">
                  {getErrorTitle("Kiro", kiroError)}
                </span>
                <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                  {formatAgentError("Kiro", kiroError)}
                </span>
              </div>
            ) : kiroKeys.length === 0 ? (
              <div className="group relative min-h-[46px] flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1 text-[10px]">
                  <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                    Status
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-1">
                    Normal
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                  CLI Active
                </div>
              </div>
            ) : (
              kiroKeys.map((key) => {
                const item: any = getKiroLimits![key];
                if (!item || typeof item !== "object") return null;
                const label = key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                const remPercent =
                  typeof item.remaining_percent === "number"
                    ? item.remaining_percent
                    : 100;
                return (
                  <div
                    key={key}
                    className="group relative min-h-[46px] flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-center mb-1 text-[10px]">
                      <span className="text-gray-500 dark:text-gray-400 font-semibold truncate">
                        {label}
                      </span>
                      <span className="font-bold text-gray-700 dark:text-gray-300 shrink-0 ml-1">
                        {remPercent}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full mb-1 relative">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(remPercent)}`}
                        style={{ width: `${remPercent}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right truncate">
                      {item.used_credits !== undefined &&
                      item.total_credits !== undefined
                        ? `使用: ${item.used_credits} / ${item.total_credits}`
                        : formatRelativeResetTime(
                            item.refreshes_in,
                            item.resets_at,
                          )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
