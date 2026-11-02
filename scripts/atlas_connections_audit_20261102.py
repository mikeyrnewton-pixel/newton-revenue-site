#!/usr/bin/env python3
"""ATLAS one-shot owner-Mac connections audit.

READ ONLY: never prints credentials, never sends them to the network, never
makes an AI completion or other potentially billable provider call, never
modifies Mac services, installs a dependency or activates an account.
The only remote check is read-only authentication against the OWNER's private
GitHub repository, without prompting or printing authenticated response data.
"""
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = "mikeyrnewton-pixel/Newton-Empire"
QWEN_MODEL = "qwen3:4b-instruct-2507-q4_K_M"
ALLOWED_MODEL_NAMES = {QWEN_MODEL, "ai/" + QWEN_MODEL, "docker.io/ai/" + QWEN_MODEL}
PROVIDERS = (
    ("Cerebras", ("CEREBRAS_API_KEY",), "ROUTED_IN_SOURCE"),
    ("Groq", ("GROQ_API_KEY",), "ROUTED_IN_SOURCE"),
    ("Gemini", ("GEMINI_API_KEY",), "ROUTED_IN_SOURCE"),
    ("Mistral", ("MISTRAL_API_KEY",), "ROUTED_IN_SOURCE"),
    ("NVIDIA", ("NVIDIA_API_KEY",), "ROUTED_IN_SOURCE"),
    ("OpenRouter", ("OPENROUTER_API_KEY",), "ROUTED_IN_SOURCE"),
    ("Cloudflare AI", ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"), "ROUTED_IN_SOURCE"),
    ("DeepSeek", ("DEEPSEEK_API_KEY",), "OPTIONAL_DISABLED"),
    ("xAI / Grok API", ("XAI_API_KEY", "NEWTON_XAI_MODEL"), "OPTIONAL_DISABLED"),
    ("Perplexity API", ("PERPLEXITY_API_KEY",), "OPTIONAL_DISABLED"),
    ("Voyage retrieval", ("VOYAGE_API_KEY",), "RETRIEVAL_ONLY"),
)
WANTED = set(k for _, variables, _ in PROVIDERS for k in variables)

def looks_configured(value):
    if not isinstance(value, str):
        return False
    v = value.strip().strip("'\"").strip()
    if not v or re.fullmatch(
        r"(none|null|unset|not_set|changeme|your_key|your_api_key|replace_me|"
        r"example|placeholder|todo|<.+>|\$\{.+\})", v, re.I
    ):
        return False
    return not bool(re.search(r"(^((your|insert|replace|example|test)[-_ ]))|"
                              r"([-_ ](placeholder|here)$)", v, re.I))

def expected_files():
    h = Path.home()
    return [
        h / "Newton-Empire" / ".env",
        h / "newton-empire" / ".env",
        h / "ATLAS-LOCAL-SETUP" / ".env",
        h / "ATLAS-LOCAL-SETUP" / "Newton-Empire" / ".env",
        h / "ATLAS-BUILD-READY" / "source" / "Newton-Empire" / ".env",
        h / ".newton-empire" / ".env",
    ]

def inspect_env():
    found = {k for k in WANTED if looks_configured(os.environ.get(k))}
    any_config_file = False
    for file in expected_files():
        try:
            info = file.lstat()
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or info.st_size > 512 * 1024 or info.st_size == 0):
                continue
            any_config_file = True
            content = file.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        for line in content.splitlines():
            m = re.match(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$", line)
            if not m or m.group(1) not in WANTED:
                continue
            val = m.group(2).strip()
            if not val.startswith(("'", '"')):
                val = re.split(r"\s+#", val, maxsplit=1)[0].strip()
            if looks_configured(val):
                found.add(m.group(1))
    return found, any_config_file

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, msg, headers, newurl):
        return None

def qwen_model_listed():
    # GET is local, read-only and is NOT a billable model completion.
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open("http://127.0.0.1:12434/v1/models", timeout=5) as response:
            if response.status != 200:
                return "NOT_VERIFIED"
            raw = response.read(16385)
        if len(raw) > 16384:
            return "NOT_VERIFIED"
        listing = json.loads(raw)
        rows = listing.get("data") if isinstance(listing, dict) else None
        if isinstance(rows, list) and any(isinstance(row, dict)
           and row.get("id") in ALLOWED_MODEL_NAMES for row in rows):
            return "EXPECTED_MODEL_LISTED_NO_INFERENCE_TEST"
    except (OSError, ValueError, KeyError):
        pass
    return "NOT_VERIFIED"

def private_github_access():
    # No token is read or printed. Never invoke gh auth token or interactive login.
    env = os.environ.copy()
    env.update({
        "GIT_TERMINAL_PROMPT": "0",
        "GCM_INTERACTIVE": "Never",
        "GIT_SSH_COMMAND": "ssh -oBatchMode=yes -oStrictHostKeyChecking=yes "
                           "-oConnectTimeout=5 -oNumberOfPasswordPrompts=0",
    })
    gh = shutil.which("gh")
    if gh:
        try:
            p = subprocess.run([gh, "api", "repos/" + REPO, "--jq", ".private"],
               capture_output=True, text=True, timeout=10, env=env, check=False)
            if p.returncode == 0 and p.stdout.strip() == "true":
                return "READ_ACCESS_VERIFIED_VIA_GH"
        except (OSError, subprocess.TimeoutExpired):
            pass
    git = shutil.which("git")
    if git and shutil.which("ssh"):
        try:
            p = subprocess.run([git, "ls-remote", "git@github.com:" + REPO + ".git", "HEAD"],
               capture_output=True, text=True, timeout=12, env=env, check=False)
            if p.returncode == 0 and re.match(r"^[0-9a-f]{40}\s+HEAD\s*$",p.stdout):
                return "READ_ACCESS_VERIFIED_VIA_SSH"
        except (OSError, subprocess.TimeoutExpired):
            pass
    return "NOT_VERIFIED_NO_INTERACTIVE_LOGIN_ATTEMPTED"

def run():
    observed, files_found = inspect_env()
    providers = [{
        "provider": name,
        "route": route,
        "credential": "PRESENT_UNTESTED" if all(k in observed for k in keys)
                      else "NOT_FOUND_IN_KNOWN_LOCATIONS"
    } for name,keys,route in PROVIDERS]
    return {
        "schema": "atlas.connections.readonly.v1",
        "scope": "OWNER_MAC_LOCAL_AUDIT_ONLY",
        "provider_config_file_seen": files_found,
        "provider_api_calls": 0,
        "paid_ai_calls": 0,
        "mac_services_changed": False,
        "provider_routes_deployed_on_mac": "NOT_VERIFIED",
        "private_github_read_access": private_github_access(),
        "local_qwen": qwen_model_listed(),
        "providers": providers,
        "notice": "PRESENT_UNTESTED means credential-like value found only. It DOES NOT prove provider auth, free quota, live router deployment or a working model.",
    }

def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        assert looks_configured("abc123") and not looks_configured("placeholder")
        assert not looks_configured("insert_key_here")
        assert len(PROVIDERS) == 11
        print("ATLAS_CONNECTION_AUDIT_SELF_TEST=PASS")
        return
    if len(sys.argv) != 1:
        print("ATLAS_CONNECTION_AUDIT=INVALID_ARGUMENTS")
        sys.exit(2)
    result = run()
    print("ATLAS_CONNECTION_AUDIT=COMPLETE_READ_ONLY")
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))

if __name__ == "__main__":
    main()
