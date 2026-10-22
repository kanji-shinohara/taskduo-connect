import pty
import os
import subprocess
import time
import sys
import fcntl
import termios
import struct
import re
import json
import select
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime


def clean_ansi(text: str) -> str:
    # Convert cursor forward (CUF) sequences (e.g. \x1b[1C or \x1b[C) into spaces so words aren't glued together
    text = re.sub(
        r"\x1B\[(\d*)C",
        lambda m: " " * (int(m.group(1)) if m.group(1) else 1),
        text,
    )
    ansi_escape = re.compile(r"(?:\x1B[@-_][0-?]*[ -/]*[@-~])")
    text = ansi_escape.sub("", text)
    text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", text)
    return text


def clean_reset_string(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^[:\s]+", "", text)
    # Remove terminal/PTY escape garbage like (B or [B at the end
    text = re.sub(r"\([a-zA-Z]$", "", text)
    text = re.sub(r"\[[a-zA-Z]$", "", text)
    return text.strip()


def send_input_slowly(master, text: str):
    for char in text:
        os.write(master, char.encode("utf-8"))
        time.sleep(0.05)


def run_cli_command(cmd, target):
    master, slave = pty.openpty()
    winsize = struct.pack(
        "HHHH", 100, 120, 0, 0
    )  # 100 rows x 120 cols (ensure layout fits without wrapping)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, winsize)
    fcntl.ioctl(master, termios.TIOCSWINSZ, winsize)

    # Dynamic repository root resolution (or fallback to home)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    current = script_dir
    found_root = None
    for _ in range(5):
        if os.path.exists(os.path.join(current, ".git")):
            found_root = current
            break
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

    cwd = found_root or os.path.expanduser("~")

    # Inject OAuth Token from Keychain for non-interactive execution of claude CLI
    env = os.environ.copy()
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["BROWSER"] = "/usr/bin/true"
    if target == "claude":
        # Safe debug logger
        def log_dbg(msg):
            try:
                with open("/tmp/keychain_debug.log", "a", encoding="utf-8") as f_dbg:
                    f_dbg.write(f"{msg}\n")
            except Exception:
                pass

        # Clear old debug log
        try:
            if os.path.exists("/tmp/keychain_debug.log"):
                os.remove("/tmp/keychain_debug.log")
        except Exception:
            pass

        password = os.environ.get("REMOTE_PASSWORD")
        if not password:
            # Fallback: inspect .env files to get REMOTE_PASSWORD
            env_candidates = [
                "/Applications/TaskDuo.app/Contents/MacOS/.env",
                os.path.join(cwd, ".env"),
                os.path.join(script_dir, "..", ".env"),
                os.path.join(script_dir, "..", "..", ".env"),
            ]
            for env_path in env_candidates:
                if os.path.exists(env_path):
                    try:
                        with open(env_path, "r", encoding="utf-8") as f_env:
                            for line in f_env:
                                line = line.strip()
                                if line.startswith("REMOTE_PASSWORD="):
                                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                    if val:
                                        password = val
                                        break
                    except Exception:
                        pass
                if password:
                    break

        log_dbg(f"REMOTE_PASSWORD status: {'set' if password else 'empty'}")

        # Explicitly unlock macOS keychain if REMOTE_PASSWORD is provided to access OAuth tokens
        if password:
            try:
                log_dbg("Attempting to unlock login keychain...")
                keychain_path = os.path.expanduser(
                    "~/Library/Keychains/login.keychain-db"
                )
                subprocess.run(
                    ["security", "unlock-keychain", "-p", password, keychain_path],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                log_dbg("Keychain unlocked successfully.")
            except Exception as ke:
                log_dbg(f"Failed to unlock keychain: {str(ke)}")

        # Ensure credentials in Keychain are synced to ~/.claude/.credentials.json if Keychain has valid/newer token
        try:
            cred_res = subprocess.run(
                ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
                capture_output=True,
                text=True,
            )
            if cred_res.returncode == 0 and cred_res.stdout.strip():
                cred_json_str = cred_res.stdout.strip()
                claude_dir = os.path.expanduser("~/.claude")
                os.makedirs(claude_dir, exist_ok=True)
                cred_file = os.path.join(claude_dir, ".credentials.json")
                should_write = True
                try:
                    kc_data = json.loads(cred_json_str)
                    kc_exp = kc_data.get("claudeAiOauth", {}).get("expiresAt", 0) or 0
                    if os.path.exists(cred_file):
                        with open(cred_file, "r", encoding="utf-8") as f_existing:
                            ex_data = json.load(f_existing)
                        ex_exp = ex_data.get("claudeAiOauth", {}).get("expiresAt", 0) or 0
                        if ex_exp > kc_exp:
                            should_write = False
                except Exception:
                    pass
                if should_write:
                    with open(cred_file, "w", encoding="utf-8") as f_cred:
                        f_cred.write(cred_json_str)
                    log_dbg("Synced Claude Code-credentials to ~/.claude/.credentials.json")
        except Exception as e_sync:
            log_dbg(f"Failed to sync credentials: {str(e_sync)}")

        # Explicitly ensure HOME env var is set to the user's home directory
        # so Claude Code CLI can find ~/.claude/ configuration/credentials.
        env["HOME"] = os.path.expanduser("~")
        log_dbg(f"HOME set to: {env['HOME']}")

        # Clear API keys to prevent API billing mode if OAuth is expected from ~/.claude/
        env.pop("CLAUDE_API_KEY", None)
        env.pop("ANTHROPIC_API_KEY", None)

    try:
        with open(f"/tmp/env_debug_{target}.txt", "w") as f_dbg:
            for k_dbg, v_dbg in env.items():
                if any(
                    x_dbg in k_dbg.upper()
                    for x_dbg in ["CLAUDE", "ANTHROPIC", "KEY", "TOKEN"]
                ):
                    val_str_dbg = (
                        f"{str(v_dbg)[:10]}... (len: {len(str(v_dbg))})"
                        if v_dbg is not None
                        else "None"
                    )
                    f_dbg.write(f"{k_dbg}: {val_str_dbg}\n")
    except Exception:
        pass

    proc = subprocess.Popen(
        cmd,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        cwd=cwd,
        env=env,
    )
    os.close(slave)

    output = b""

    def read_output(timeout=0.1):
        nonlocal output
        try:
            r, _, _ = select.select([master], [], [], timeout)
            if r:
                chunk = os.read(master, 4096)
                if chunk:
                    output += chunk
        except (BlockingIOError, OSError):
            pass
        return output.decode("utf-8", errors="ignore")

    start_time = time.time()
    interacted = False
    interact_time = 0.0
    trust_bypassed = False
    menu_focused = False

    while time.time() - start_time < 45:  # 45 seconds timeout
        time.sleep(0.5)
        text = read_output()
        cleaned_text = clean_ansi(text)

        if target == "claude" and (
            "Add directory to workspace" in cleaned_text
            or "Enter the path to the directory" in cleaned_text
            or "What do you want to do?" in cleaned_text
            or "rate-limit-options" in cleaned_text
            or "Stop and wait for limit to reset" in cleaned_text
        ):
            os.write(master, b"\x1b")
            time.sleep(0.5)
            read_output()
            continue

        if target == "kiro":
            lower_clean = cleaned_text.lower()
            if (
                "signed in" in lower_clean
                or "continue to the browser" in lower_clean
                or "opening browser" in lower_clean
                or "choose a way to sign in" in lower_clean
                or "sign in/sign up" in lower_clean
                or ("login" in lower_clean and "press enter" in lower_clean)
            ):
                # Unauthenticated Kiro CLI: immediately send ESC to prevent browser launch and abort
                try:
                    os.write(master, b"\x1b")
                    time.sleep(0.2)
                    read_output()
                except Exception:
                    pass
                break

        if target == "agy":
            lower_clean = cleaned_text.lower()
            if (
                "not logged into antigravity" in lower_clean
                or "you are not logged in" in lower_clean
                or "not logged into" in lower_clean
                or "not authenticated" in lower_clean
                or "trying silent auth" in lower_clean
                or "silent auth failed" in lower_clean
                or "accounts.google.com" in lower_clean
                or "local chrome mode" in lower_clean
                or "choose an account" in lower_clean
                or "sign in with google" in lower_clean
            ):
                # Unauthenticated Antigravity CLI: immediately send Ctrl+C to prevent browser launch and abort
                try:
                    os.write(master, b"\x03")
                    time.sleep(0.2)
                    read_output()
                except Exception:
                    pass
                break

        if proc.poll() is not None:
            break

        no_space_clean = re.sub(r"\s+", "", cleaned_text.lower())
        if not trust_bypassed:
            if (
                "trust this folder" in cleaned_text.lower()
                or "trustthisfolder" in no_space_clean
                or "trust the contents" in cleaned_text.lower()
                or "trustthecontents" in no_space_clean
                or "1. yes" in cleaned_text.lower()
                or "1.yes" in no_space_clean
                or "safety check" in cleaned_text.lower()
                or "safetycheck" in no_space_clean
            ):
                if target == "claude":
                    # Send down arrow + enter to select "Yes, I trust this folder"
                    os.write(master, b"\x1b[B")
                    time.sleep(0.3)
                    os.write(master, b"\r")
                elif "1. yes" in cleaned_text.lower() or "1.yes" in no_space_clean:
                    os.write(master, b"1\r")
                else:
                    os.write(master, b"\r")
                trust_bypassed = True
                time.sleep(0.5)
                read_output()
                continue

        if not interacted:
            if target == "claude":
                if (
                    "Try" in cleaned_text
                    or "ctrl+g" in cleaned_text
                    or "manual mode" in cleaned_text
                    or "auto mode" in cleaned_text
                    or "❯" in cleaned_text
                ):
                    time.sleep(0.5)  # Wait briefly for prompt to stabilize
                    send_input_slowly(master, "/usage\r")
                    time.sleep(1.0)  # Wait for usage screen to load
                    os.write(master, b"w")  # Switch to weekly
                    interacted = True
                    interact_time = time.time()
                    menu_focused = True
            elif target == "kiro":
                if (
                    "kiro_default" in cleaned_text
                    or "ask a question" in cleaned_text.lower()
                    or "auto" in cleaned_text.lower()
                ) and "initializing" not in cleaned_text.splitlines()[-1].lower():
                    time.sleep(1.0)
                    # Write "/usage\r" all at once to prevent Kiro's autocomplete menu from hijacking the command
                    os.write(master, b"/usage\r")
                    interacted = True
                    interact_time = time.time()
            else:  # agy
                if ("@" in cleaned_text or "Gemini" in cleaned_text) and (
                    ">" in cleaned_text or "Models & Quota" in cleaned_text
                ):
                    send_input_slowly(master, "/usage\r")
                    time.sleep(0.5)
                    os.write(master, b"\r")
                    interacted = True
                    interact_time = time.time()
        else:
            elapsed = time.time() - interact_time
            # After 3 seconds, scroll down to reveal all content
            if not menu_focused:
                if target == "agy":
                    if elapsed >= 3.0:
                        # Try Ctrl+End escape sequence (standard terminal)
                        os.write(master, b"\x1b[1;5F")
                        time.sleep(0.3)
                        read_output()
                        # Also send pgdown twice as fallback
                        os.write(master, b"\x1b[6~")
                        time.sleep(0.3)
                        read_output()
                        os.write(master, b"\x1b[6~")
                        time.sleep(0.3)
                        read_output()
                        menu_focused = True
                else:  # claude
                    # Wait dynamically for scan to complete naturally: look for operation guides "to day" or "to week"
                    if "to day" in cleaned_text or "to week" in cleaned_text:
                        # Send 'w' directly to switch to Week view so weekly limits are rendered
                        os.write(master, b"w")
                        time.sleep(2.0)
                        read_output()
                        menu_focused = True
                    elif elapsed >= 10.0:
                        # Fallback if operation guides are not found but 10s elapsed
                        os.write(master, b"w")
                        time.sleep(2.0)
                        read_output()
                        menu_focused = True
            # Early exit for Kiro once usage screen is rendered
            if target == "kiro":
                if "credits (" in cleaned_text.lower() or "bonus credits" in cleaned_text.lower():
                    time.sleep(1.0)
                    read_output()
                    break
            # Wait dynamically: if weekly gauges are loaded (or API Usage Billing modal finished), break early.
            lower_now = cleaned_text.lower()
            if menu_focused and (
                "current week" in lower_now
                or ("api usage billing" in lower_now and "esc to cancel" in lower_now)
            ):
                time.sleep(1.0)
                read_output()
                break
            if elapsed >= 25.0:
                break

    try:
        # Dismiss any open modal/dialog first with Escape
        os.write(master, b"\x1b\x1b")
        time.sleep(0.2)
        send_input_slowly(master, "/exit\r")
        time.sleep(0.3)
        read_output()
    except Exception:
        pass

    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

    # Write raw output for backend execution debugging
    try:
        with open(f"/tmp/{target}_pty_debug.txt", "w", encoding="utf-8") as f:
            f.write(clean_ansi(output.decode("utf-8", errors="ignore")))
    except Exception:
        pass

    return clean_ansi(output.decode("utf-8", errors="ignore"))


def parse_agy(text: str):
    res = {}
    if not text:
        return res
    lower = text.lower()
    if (
        "not logged into antigravity" in lower
        or "you are not logged in" in lower
        or "not logged into" in lower
        or "not authenticated" in lower
        or "silent auth" in lower
        or "accounts.google.com" in lower
        or "local chrome mode" in lower
        or "choose an account" in lower
        or "sign in" in lower
    ):
        return {
            "session_expired": True,
            "error": "Antigravity CLI は未ログイン（セッション切れ）です。'agy' を実行してログインしてください。",
        }

    # Detect group sections
    lower = text.lower()
    gemini_pos = lower.find("gemini models")
    claude_gpt_pos = lower.find("claude and gpt models")

    def extract_limit_in_section(section_text: str, section_key: str):
        """Extract Weekly Limit and Five Hour Limit within a text section."""
        for limit_name, key_suffix in [
            ("Weekly Limit", "weekly_limit"),
            ("Five Hour Limit", "five_hour_limit"),
        ]:
            limit_pos = section_text.lower().find(limit_name.lower())
            if limit_pos == -1:
                continue
            sub = section_text[limit_pos:]
            # Pattern: bar [...] XX% then optionally "YY% remaining · Refreshes in ZZZ"
            pct_match = re.search(r"\[.*?\]\s*([\d.]+)%", sub, re.DOTALL)
            if not pct_match:
                continue
            rem_pct = float(pct_match.group(1))
            # Try to find refreshes_in text
            refreshes_match = re.search(
                r"(?:remaining\s*·\s*Refreshes in|Refreshes in)\s*([^\r\n]+)",
                sub,
                re.IGNORECASE,
            )
            refreshes_in = (
                refreshes_match.group(1).strip() if refreshes_match else "N/A"
            )
            res[f"{section_key}_{key_suffix}"] = {
                "remaining_percent": rem_pct,
                "used_percent": round(100.0 - rem_pct, 2),
                "refreshes_in": refreshes_in,
            }

    if gemini_pos != -1:
        # Section ends at claude_gpt_pos (or end of text)
        end_pos = claude_gpt_pos if claude_gpt_pos != -1 else len(text)
        gemini_section = text[gemini_pos:end_pos]
        extract_limit_in_section(gemini_section, "gemini")

    if claude_gpt_pos != -1:
        claude_gpt_section = text[claude_gpt_pos:]
        extract_limit_in_section(claude_gpt_section, "claude_gpt")

    return res


def parse_kiro(text: str):
    res = {}
    if not text:
        return res
    lower = text.lower()
    if (
        "signed in" in lower
        or "continue to the browser" in lower
        or "opening browser" in lower
        or "choose a way to sign in" in lower
        or "sign in/sign up" in lower
    ):
        return {
            "session_expired": True,
            "error": "Kiro CLI は未ログイン（セッション切れ）です。'kiro-cli login' を実行してください。",
        }
    if "error" in lower and "credits" not in lower:
        return {"error": text.strip()}

    credits_match = re.search(
        r"Credits\s*\(\s*([\d.]+)\s*of\s*([\d.]+)", text, re.IGNORECASE
    )
    resets_match = re.search(r"resets\s*on\s*(\d{4}-\d{2}-\d{2})", text, re.IGNORECASE)
    # Match percentage specifically from the gauge/progress bar (e.g. ==== 165%), not from prompt status
    pct_match = re.search(r"[=\-#\s]{3,}\s*([\d.]+)%", text)

    resets_at = resets_match.group(1) if resets_match else None

    if credits_match:
        rem_credits = float(credits_match.group(1))
        base_credits = float(credits_match.group(2))
        # pct_match (e.g. 165%) represents remaining credit percentage in Kiro CLI
        if pct_match:
            rem_pct = float(pct_match.group(1))
        else:
            rem_pct = round((rem_credits / base_credits) * 100.0, 2)
        # Usage percent is 0% when bonus credits make remaining > 100%
        used_pct = round(max(0.0, 100.0 - min(100.0, rem_pct)), 2)
        used_credits = round(max(0.0, base_credits - rem_credits), 2)

        res["credits"] = {
            "used_percent": used_pct,
            "remaining_percent": rem_pct,
            "resets_at": resets_at or "N/A",
            "used_credits": used_credits,
            "remaining_credits": rem_credits,
            "total_credits": base_credits,
        }
    elif pct_match:
        rem_pct = float(pct_match.group(1))
        used_pct = round(max(0.0, 100.0 - min(100.0, rem_pct)), 2)
        res["credits"] = {
            "used_percent": used_pct,
            "remaining_percent": rem_pct,
            "resets_at": resets_at or "N/A",
        }
    else:
        res["error"] = "Kiro CLI の /usage 情報のパースに失敗しました"
    return res


def is_claude_oauth_expired() -> bool:
    """Check if Claude Code OAuth credentials exist and are expired (e.g. expiresAt == 0 or <= now)."""
    now_ms = int(time.time() * 1000)
    max_exp = None
    has_oauth_cred = False

    cred_file = os.path.expanduser("~/.claude/.credentials.json")
    if os.path.exists(cred_file):
        try:
            with open(cred_file, "r", encoding="utf-8") as f:
                d = json.load(f)
            oauth = d.get("claudeAiOauth")
            if isinstance(oauth, dict):
                has_oauth_cred = True
                exp = oauth.get("expiresAt")
                if isinstance(exp, (int, float)):
                    max_exp = exp if max_exp is None else max(max_exp, exp)
        except Exception:
            pass

    try:
        r = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if r.returncode == 0 and r.stdout.strip():
            d = json.loads(r.stdout.strip())
            oauth = d.get("claudeAiOauth")
            if isinstance(oauth, dict):
                has_oauth_cred = True
                exp = oauth.get("expiresAt")
                if isinstance(exp, (int, float)):
                    max_exp = exp if max_exp is None else max(max_exp, exp)
    except Exception:
        pass

    if has_oauth_cred and max_exp is not None and max_exp <= now_ms:
        return True
    return False


def is_iso_reset_expired(resets_at_str: str) -> bool:
    """Return True if resets_at_str is an ISO timestamp that has already passed."""
    if not resets_at_str or resets_at_str == "N/A":
        return False
    try:
        dt = datetime.fromisoformat(resets_at_str.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            now_dt = datetime.now(dt.tzinfo)
            return dt <= now_dt
    except Exception:
        pass
    return False


def read_claude_json_cache():
    if is_claude_oauth_expired():
        return None
    claude_json_path = os.path.expanduser("~/.claude.json")
    if not os.path.exists(claude_json_path):
        return None
    try:
        with open(claude_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached = data.get("cachedUsageUtilization")
        if not cached:
            return None
        util = cached.get("utilization", {})
        result = {"weekly": {}}

        def build_limit_entry(pct_val, raw_resets_at):
            cleaned_reset = clean_reset_string(raw_resets_at or "") or "N/A"
            if is_iso_reset_expired(cleaned_reset):
                return {
                    "used_percent": 0.0,
                    "remaining_percent": 100.0,
                    "resets_at": "N/A",
                }
            used_pct = float(pct_val)
            rem_pct = round(max(0.0, 100.0 - used_pct), 2)
            return {
                "used_percent": used_pct,
                "remaining_percent": rem_pct,
                "resets_at": cleaned_reset,
            }

        # 1. Check limits array
        limits = util.get("limits", [])
        for lim in limits:
            kind = lim.get("kind")
            pct = lim.get("percent")
            resets_at = lim.get("resets_at")
            if pct is not None:
                limit_info = build_limit_entry(pct, resets_at)
                if kind == "session":
                    result["session"] = limit_info
                elif kind == "weekly_all":
                    result["weekly"]["all_models"] = limit_info
                elif kind == "weekly_fable":
                    result["weekly"]["fable"] = limit_info

        # 2. Fallback to five_hour and seven_day fields
        if "session" not in result and util.get("five_hour"):
            fh = util["five_hour"]
            u = fh.get("utilization")
            if u is not None:
                result["session"] = build_limit_entry(u, fh.get("resets_at"))

        if "all_models" not in result["weekly"] and util.get("seven_day"):
            sd = util["seven_day"]
            u = sd.get("utilization")
            if u is not None:
                result["weekly"]["all_models"] = build_limit_entry(u, sd.get("resets_at"))

        return result
    except Exception:
        return None


def parse_claude(text: str):
    res = {}
    cost_match = re.search(r"Total\s*cost:\s*\$([\d.]+)", text, re.IGNORECASE)
    res["total_cost"] = float(cost_match.group(1)) if cost_match else 0.0

    res["weekly"] = {}
    lower_text = text.lower()

    # Check for login expiration / auth failure
    normalized_text = re.sub(r"\s+", "", lower_text)
    if (
        "loginexpired" in normalized_text
        or "pleaserun/login" in normalized_text
        or "failedtoauthenticate" in normalized_text
        or "oauthsessionexpired" in normalized_text
    ):
        res["session_expired"] = True
        res["error"] = (
            "Claude CLI のログインセッションが期限切れです。claude /login を実行してください。"
        )
        return res

    # Check for weekly limit hit message directly (e.g. "You've hit your weekly limit · resets Sep 11 at 3am (Asia/Tokyo)")
    hit_limit_match = re.search(
        r"(?:you'?ve\s*hit\s*your\s*weekly\s*limit|weekly\s*limit\s*reached)[\s\S]*?(?:resets|reset)\s*([^\r\n│]+)",
        text,
        re.IGNORECASE,
    )
    if hit_limit_match:
        reset_str = clean_reset_string(hit_limit_match.group(1))
        reset_str = re.split(
            r"(?:what|approximate|scanning|│|\s{2,})",
            reset_str,
            flags=re.IGNORECASE,
        )[0].strip()
        res["weekly"]["all_models"] = {
            "used_percent": 100.0,
            "remaining_percent": 0.0,
            "resets_at": clean_reset_string(reset_str),
        }

    # --- Session Parse ---
    sess_pos = lower_text.find("sess")
    if sess_pos != -1:
        sub_text = text[sess_pos:]
        match = re.search(
            r"([\d.]+)\s*%\s*(?:use|used|usd)[\s\S]*?(?:resets|reset|rests|rest|set|rset|se?t)\s*([^\r\n│]+)",
            sub_text,
            re.IGNORECASE,
        )
        if match:
            used_pct = float(match.group(1))
            reset_str = match.group(2).strip()
            reset_str = re.split(
                r"(?:current|curent|week|all|fable|what|approximate|scanning|│|\s{2,})",
                reset_str,
                flags=re.IGNORECASE,
            )[0].strip()
            res["session"] = {
                "used_percent": used_pct,
                "remaining_percent": round(max(0.0, 100.0 - used_pct), 2),
                "resets_at": clean_reset_string(reset_str),
            }

    # --- Weekly (all models) Parse ---
    all_models_pos = -1
    for kw in ["all models", "allmodels", "(all"]:
        pos = lower_text.find(kw)
        if pos != -1:
            all_models_pos = pos
            break

    if all_models_pos != -1:
        sub_text = text[all_models_pos:]
        match = re.search(
            r"([\d.]+)\s*%\s*(?:use|used|usd)[\s\S]*?(?:resets|reset|rests|rest|set|rset|se?t)\s*([^\r\n│]+)",
            sub_text,
            re.IGNORECASE,
        )
        if match:
            used_pct = float(match.group(1))
            reset_str = match.group(2).strip()
            reset_str = re.split(
                r"(?:current|curent|week|all|fable|what|approximate|scanning|│|\s{2,})",
                reset_str,
                flags=re.IGNORECASE,
            )[0].strip()
            res["weekly"]["all_models"] = {
                "used_percent": used_pct,
                "remaining_percent": round(max(0.0, 100.0 - used_pct), 2),
                "resets_at": clean_reset_string(reset_str),
            }

    # --- Weekly (Fable) Parse ---
    fable_pos = lower_text.find("fable")
    if fable_pos != -1:
        sub_text = text[fable_pos:]
        match = re.search(
            r"([\d.]+)\s*%\s*(?:use|used|usd)[\s\S]*?(?:resets|reset|rests|rest|set|rset|se?t)\s*([^\r\n│]+)",
            sub_text,
            re.IGNORECASE,
        )
        if match:
            used_pct = float(match.group(1))
            reset_str = match.group(2).strip()
            reset_str = re.split(
                r"(?:current|curent|week|all|fable|what|approximate|scanning|│|\s{2,})",
                reset_str,
                flags=re.IGNORECASE,
            )[0].strip()
            res["weekly"]["fable"] = {
                "used_percent": used_pct,
                "remaining_percent": round(max(0.0, 100.0 - used_pct), 2),
                "resets_at": clean_reset_string(reset_str),
            }

    is_api_text = "apiusagebilling" in normalized_text or "apibilling" in normalized_text
    oauth_expired = is_claude_oauth_expired()

    # Fallback: If session or weekly is missing, try reading ~/.claude.json cache ONLY when OAuth is not expired and CLI did not fall back to API billing
    if (not res.get("session") or not res.get("weekly", {}).get("all_models")) and not oauth_expired and not is_api_text:
        claude_json_cache = read_claude_json_cache()
        if claude_json_cache:
            if claude_json_cache.get("session") and not res.get("session"):
                res["session"] = claude_json_cache["session"]
            if claude_json_cache.get("weekly"):
                for k, v in claude_json_cache["weekly"].items():
                    if k not in res["weekly"]:
                        res["weekly"][k] = v

    # Determine is_api_billing:
    # Only true if explicit API billing text is present AND no quota limits exist (pure API pay-as-you-go)
    has_quota = bool(res.get("session") or res.get("weekly", {}).get("all_models"))
    res["is_api_billing"] = is_api_text and not has_quota and not oauth_expired

    # If OAuth is expired or it claimed API billing with 0 cost in safe mode, report session expiration
    if not has_quota and (oauth_expired or (is_api_text and res.get("total_cost", 0.0) == 0.0)):
        if (
            oauth_expired
            or "failed to authenticate" in lower_text
            or "oauth session expired" in lower_text
            or "login" in lower_text
            or "safe mode" in lower_text
        ):
            res["is_api_billing"] = False
            res["session_expired"] = True
            res["error"] = "Claude CLI のログインセッションが期限切れです。claude /login を実行してください。"

    # If still completely empty without billing mode, set meaningful error so frontend doesn't show N/A
    if not res.get("session") and not res.get("weekly") and not res.get("is_api_billing") and "error" not in res:
        res["error"] = "Claude 利用状況の取得に失敗しました（/usage 画面を開けませんでした）"

    return res


# Ensure system search paths include common user binary locations
extra_paths = [
    os.path.expanduser("~/.local/bin"),
    os.path.expanduser("~/bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    os.path.expanduser("~/.cargo/bin"),
]
existing_path = os.environ.get("PATH", "")
os.environ["PATH"] = ":".join(extra_paths) + ":" + existing_path


def resolve_binary(bin_name: str, alt_paths: list = None) -> str:
    """Find binary executable in system PATH or explicit alternative locations."""
    if alt_paths:
        for p in alt_paths:
            if os.path.exists(p) and os.access(p, os.X_OK):
                return p
    # Check PATH
    for path_dir in os.environ["PATH"].split(":"):
        candidate = os.path.join(path_dir, bin_name)
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def fetch_claude_credits():
    claude_bin = resolve_binary(
        "claude",
        [
            os.path.expanduser("~/.local/bin/claude"),
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
        ],
    )
    if not claude_bin:
        return {"error": "Claude Code CLI がインストールされていません"}
    try:
        claude_output = run_cli_command([claude_bin, "--safe-mode"], "claude")
        if claude_output:
            return parse_claude(claude_output)
        else:
            return {"error": "Claude Code CLI の応答を取得できませんでした"}
    except Exception as e:
        err_str = str(e)
        if (
            "[Errno 2]" in err_str
            or "No such file" in err_str
            or "not found" in err_str.lower()
        ):
            return {"error": "Claude Code CLI がインストールされていません"}
        return {"error": err_str}


def fetch_agy_credits():
    disable_agy = os.environ.get("DISABLE_AGY_MONITOR", "").strip().lower() in ("true", "1", "yes")
    if disable_agy:
        return {"error": "Antigravity CLI (agy) の監視は環境変数 DISABLE_AGY_MONITOR により無効化されています"}
    agy_bin = resolve_binary(
        "agy",
        [
            os.path.expanduser("~/.local/bin/agy"),
            "/usr/local/bin/agy",
            "/opt/homebrew/bin/agy",
        ],
    )
    if not agy_bin:
        return {"error": "Antigravity CLI (agy) がインストールされていません"}
    try:
        agy_output = run_cli_command([agy_bin], "agy")
        if agy_output:
            return parse_agy(agy_output)
        else:
            return {"error": "Antigravity CLI の応答を取得できませんでした"}
    except Exception as e:
        err_str = str(e)
        if (
            "[Errno 2]" in err_str
            or "No such file" in err_str
            or "not found" in err_str.lower()
        ):
            return {"error": "Antigravity CLI (agy) がインストールされていません"}
        return {"error": err_str}


def fetch_kiro_credits():
    kiro_bin = resolve_binary(
        "kiro-cli",
        [
            os.path.expanduser("~/.local/bin/kiro-cli"),
            os.path.expanduser("~/bin/kiro-cli"),
            "/usr/local/bin/kiro-cli",
            "/opt/homebrew/bin/kiro-cli",
            "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli",
            os.path.expanduser("~/.local/bin/kiro"),
            os.path.expanduser("~/bin/kiro"),
        ],
    )
    if not kiro_bin:
        return {"error": "Kiro CLI がインストールされていません"}
    try:
        kiro_output = run_cli_command([kiro_bin, "chat"], "kiro")
        if kiro_output:
            return parse_kiro(kiro_output)
        else:
            return {"error": "Kiro CLI の応答を取得できませんでした"}
    except Exception as e:
        err_str = str(e)
        if (
            "[Errno 2]" in err_str
            or "No such file" in err_str
            or "not found" in err_str.lower()
        ):
            return {"error": "Kiro CLI がインストールされていません"}
        return {"error": err_str}


def get_credits() -> str:
    result = {
        "claude": {},
        "agy": {},
        "kiro": {},
        "timestamp": datetime.now().isoformat(),
    }

    with ThreadPoolExecutor(max_workers=3) as executor:
        future_claude = executor.submit(fetch_claude_credits)
        future_agy = executor.submit(fetch_agy_credits)
        future_kiro = executor.submit(fetch_kiro_credits)

        result["claude"] = future_claude.result()
        result["agy"] = future_agy.result()
        result["kiro"] = future_kiro.result()

    return json.dumps(result, indent=2, ensure_ascii=False)


def send_macos_notification(
    message: str, title: str = "Credit Monitor", subtitle: str = ""
):
    message_esc = message.replace('"', '\\"')
    title_esc = title.replace('"', '\\"')
    subtitle_esc = subtitle.replace('"', '\\"')

    script = f'display notification "{message_esc}" with title "{title_esc}"'
    if subtitle_esc:
        script += f' subtitle "{subtitle_esc}"'

    subprocess.run(["osascript", "-e", script])


def check_credits_and_notify() -> str:
    """Check credit usage and trigger macOS notification if used > 80% or remaining < 20%."""
    credits_str = get_credits()
    data = json.loads(credits_str)

    alerts = []

    # Check Claude limits
    claude = data.get("claude", {})
    if "error" not in claude:
        # Check session
        session = claude.get("session", {})
        if session:
            used = session.get("used_percent", 0.0)
            if used > 80.0:
                alerts.append(f"Claude Session limit exceeded: {used}% used")

        # Check weekly limits
        weekly = claude.get("weekly", {})
        for label, limit in weekly.items():
            used = limit.get("used_percent", 0.0)
            if used > 80.0:
                alerts.append(f"Claude Weekly limit ({label}): {used}% used")

    # Check Kiro limits
    kiro = data.get("kiro", {})
    if isinstance(kiro, dict) and "error" not in kiro:
        for limit_name, limit in kiro.items():
            if isinstance(limit, dict):
                rem = limit.get("remaining_percent", 100.0)
                if rem < 20.0:
                    used = limit.get("used_percent", 0.0)
                    alerts.append(
                        f"Kiro {limit_name.replace('_', ' ').title()}: {used}% used ({rem}% remaining)"
                    )

    # Check Antigravity limits
    agy = data.get("agy", {})
    if "error" not in agy:
        for limit_name, limit in agy.items():
            # For agy, limit shows remaining percentage
            rem = limit.get("remaining_percent", 100.0)
            if rem < 20.0:
                used = limit.get("used_percent", 0.0)
                alerts.append(
                    f"Antigravity {limit_name.replace('_', ' ').title()}: {used}% used ({rem}% remaining)"
                )

    if alerts:
        alert_msg = " | ".join(alerts)
        send_macos_notification(
            message=alert_msg,
            title="Credit Monitor Alert",
            subtitle="Usage Threshold Exceeded!",
        )
        return json.dumps({"status": "alert_sent", "alerts": alerts}, indent=2)
    else:
        # Send a normal notification if everything is OK to verify it works (or we can skip it,
        # but for tool feedback let's display notification if explicitly called)
        send_macos_notification(
            message="All credit levels are within safe thresholds.",
            title="Credit Monitor Status",
            subtitle="Credits Check Complete",
        )
        return json.dumps({"status": "ok", "alerts": []}, indent=2)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        print(check_credits_and_notify())
    else:
        print(get_credits())
