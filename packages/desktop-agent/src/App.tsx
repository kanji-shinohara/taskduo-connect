import { useState, useEffect } from "react";
import { useAgentStore } from "./store/agentStore";
import { useAgentDaemon } from "./hooks/useAgentDaemon";
import {
  Bot,
  Server,
  Key,
  User,
  Play,
  Square,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Save,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { SystemResourceWidget } from "./components/SystemResourceWidget";
import { QuotaIndicator } from "./components/QuotaIndicator";


function App() {
  const { isActive, serverUrl, apiKey, workerName, setActive, setConfig } =
    useAgentStore();

  const [localUrl, setLocalUrl] = useState(serverUrl);
  const [localKey, setLocalKey] = useState(apiKey);
  const [localName, setLocalName] = useState(workerName);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Background polling daemon
  useAgentDaemon();

  useEffect(() => {
    if (workerName && workerName.startsWith("Local-Agent-")) {
      invoke("get_hostname")
        .then((hostname) => {
          if (hostname && hostname !== "Local-Agent") {
            const newName = hostname as string;
            setConfig(serverUrl, apiKey, newName);
            setLocalName(newName);
          }
        })
        .catch(console.error);
    }
  }, []);


  useEffect(() => {
    setLocalUrl(serverUrl);
    setLocalKey(apiKey);
    setLocalName(workerName);
  }, [serverUrl, apiKey, workerName]);

  const handleSave = () => {
    setConfig(localUrl, localKey, localName);
    setIsSaved(true);
    setErrorMessage("");
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleLoginViaBrowser = async () => {
    setErrorMessage("");
    if (!localUrl) {
      setErrorMessage("サーバー URL を最初に入力してください");
      return;
    }
    setIsLoggingIn(true);
    try {
      const newApiKey: string = await invoke("login_via_browser", {
        apiUrl: localUrl,
      });
      setLocalKey(newApiKey);
      setConfig(localUrl, newApiKey, localName);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err: any) {
      setErrorMessage(`ログインに失敗しました: ${err}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleToggleWorker = () => {
    setErrorMessage("");
    if (!isActive && (!serverUrl || !apiKey)) {
      setErrorMessage("サーバー URL と API キーを設定・保存してください");
      return;
    }
    setActive(!isActive);
  };

  return (
    <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              TaskDuo Agent
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ローカル AI 実行ワーカー
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isActive
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
              }`}
            />
            {isActive ? "稼働中" : "停止中"}
          </span>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="flex-1 py-4 flex flex-col justify-center gap-3.5">
        {/* Error or Success Alert */}
        {errorMessage ? (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="leading-tight">{errorMessage}</span>
          </div>
        ) : isSaved ? (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="leading-tight">設定を正常に保存しました！</span>
          </div>
        ) : null}

        {/* Server URL Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between ml-1 mr-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-500" />
              サーバー URL (Tailscale MagicDNS / IP)
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              http://host:43000
            </span>
          </div>
          <input
            type="text"
            placeholder="http://localhost:43000 または https://app.taskduo.com"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            className="w-full h-10 px-3 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>

        {/* Agent Name Input */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 ml-1">
            <User className="w-3.5 h-3.5 text-blue-500" />
            エージェント識別名
          </label>
          <input
            type="text"
            placeholder="My-MacBook-Pro"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="w-full h-10 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>

        {/* Authentication Card */}
        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                localKey
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
              }`}
            >
              <Key className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                アカウント認証
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {localKey
                  ? "認証済み (API Key 取得完了)"
                  : "未認証です。ブラウザからログインしてください"}
              </div>
            </div>
          </div>

          <button
            onClick={handleLoginViaBrowser}
            disabled={isLoggingIn}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
              localKey
                ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {isLoggingIn
              ? "待機中..."
              : localKey
                ? "再認証"
                : "ブラウザでログイン"}
          </button>
        </div>
      </div>

      {/* Footer / Action Controls */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
        <button
          onClick={handleSave}
          className="h-10 px-4 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaved ? "保存完了" : "設定を保存"}</span>
        </button>

        <button
          onClick={handleToggleWorker}
          className={`h-10 px-5 rounded-xl font-bold text-xs text-white shadow-md transition-all active:scale-95 flex items-center gap-2 ${
            isActive
              ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/25"
              : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25"
          }`}
        >
          {isActive ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>エージェント停止</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>エージェント起動</span>
            </>
          )}
        </button>
      </div>

      <SystemResourceWidget />
      <QuotaIndicator />
    </div>
  );
}

export default App;
