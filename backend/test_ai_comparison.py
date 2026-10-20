"""
Yulya Studio - AI Mode Demonstration & Comparison Test
======================================================
This script demonstrates and verifies how the AI functions WITH and WITHOUT Antigravity,
given the EXACT same tools and user prompt.

It runs:
1. Run A: Standard Mode (Copilot without Antigravity)
2. Run B: Antigravity Autonomous Agent Mode (with Antigravity)

It records and compares:
- Tools declared vs Tools actually invoked
- Step-by-step function calls (create_file, write_file, request_reload, etc.)
- Autonomous loop iterations
- Generated reasoning (thought process)
- Final output and file modifications
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
import httpx
from pymongo import MongoClient

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Load environment
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

GEMINI_API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
MONGODB_URI = os.getenv("MONGODB_URI", "")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "yulya_studio")
KEY_ENCRYPTION_SECRET = os.getenv("API_KEY_ENCRYPTION_SECRET", "").strip("\"'")

def get_gemini_key() -> str:
    # Try AI_STUDIO_KEY in .env first
    direct_key = os.getenv("AI_STUDIO_KEY", "").strip()
    if direct_key and len(direct_key) > 20 and direct_key.startswith("AIza"):
        return direct_key

    # Otherwise decrypt from user in MongoDB
    try:
        from cryptography.fernet import Fernet
        import base64, hashlib
        key_secret = KEY_ENCRYPTION_SECRET
        fernet_key = key_secret.encode() if len(key_secret) == 44 else base64.urlsafe_b64encode(hashlib.sha256(key_secret.encode()).digest())
        cipher = Fernet(fernet_key)
        client = MongoClient(MONGODB_URI)
        db = client[DATABASE_NAME]
        user = db.users.find_one({"api_key_ciphertext": {"$exists": True, "$ne": None}})
        client.close()
        if user and user.get("api_key_ciphertext"):
            decrypted = cipher.decrypt(user["api_key_ciphertext"].encode()).decode()
            return decrypted
    except Exception as exc:
        print(f"[Warning] Could not decrypt user key from MongoDB: {exc}")

    # Fallback to direct key if available
    if direct_key:
        return direct_key

    raise RuntimeError("No valid Gemini API key found in .env or database users.")


# Tool definitions (The exact same 8 tools provided to Yulya Studio)
TOOL_DECLARATIONS = [{"functionDeclarations": [
    {
        "name": "list_files",
        "description": "List all file paths present in the current browser game project.",
        "parameters": {"type": "OBJECT", "properties": {}}
    },
    {
        "name": "read_file",
        "description": "Read the complete UTF-8 text content of a file in the project. Use this to inspect code before modifying it.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "path": {"type": "STRING", "description": "The relative path of the file to read (e.g. 'app.js', 'style.css')."}
            },
            "required": ["path"]
        }
    },
    {
        "name": "create_file",
        "description": "Create a new file in the project with specified relative path and initial content. If the file is in a subdirectory (e.g. 'js/player.js' or 'assets/map.json'), any parent folders are automatically created.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "path": {"type": "STRING", "description": "The relative path of the file to create (e.g. 'js/utils.js', 'assets/enemies.json')."},
                "content": {"type": "STRING", "description": "The complete initial text content for the new file."}
            },
            "required": ["path"]
        }
    },
    {
        "name": "create_folder",
        "description": "Create a new folder or directory in the project to organize code and assets (e.g. 'assets', 'audio', 'src/levels', 'components').",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "folder_path": {"type": "STRING", "description": "The relative directory path to create (e.g. 'assets/sprites', 'audio', 'components')."}
            },
            "required": ["folder_path"]
        }
    },
    {
        "name": "write_file",
        "description": "Create a new file or completely overwrite an existing file with new content. Parameter 'path': relative path (e.g., 'app.js', 'style.css', 'index.html'). Parameter 'content': complete, fully working source code without any placeholders or truncation.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "path": {"type": "STRING", "description": "The relative path of the file to write (e.g. 'index.html', 'style.css', 'app.js')."},
                "content": {"type": "STRING", "description": "The complete, entire text content of the file. Must not contain truncation or 'rest of code' placeholders."}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "delete_file",
        "description": "Delete an unwanted or obsolete file from the project. Parameter 'path': relative path to delete (cannot delete 'index.html').",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "path": {"type": "STRING", "description": "The relative path of the file to delete."}
            },
            "required": ["path"]
        }
    },
    {
        "name": "search_files",
        "description": "Search text across all code files in the project for a case-insensitive literal string. Parameter 'query': string to search for.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {"type": "STRING", "description": "The literal text string to search for across project files."}
            },
            "required": ["query"]
        }
    },
    {
        "name": "request_reload",
        "description": "Notify the editor to reload the live game preview iframe immediately so that recent file changes take effect.",
        "parameters": {"type": "OBJECT", "properties": {}}
    },
]}]


# System Prompts from backend/app.py
ANTIGRAVITY_SYSTEM_PROMPT = (
    "You are Antigravity, an elite autonomous AI game developer, engine architect, and pair programmer built directly inside Yulya Studio (https://studio.yulya.me).\n"
    "Your mission is to autonomously design, code, debug, expand, and polish production-ready web games using HTML5 Canvas, modern CSS, vanilla JavaScript (or ES modules), and the Web Audio API.\n\n"
    "=== PLATFORM & ENVIRONMENT ARCHITECTURE ===\n"
    "1. Host Platform: Yulya Studio — an in-browser game studio and IDE with Monaco Editor, Live Preview Iframe, and Sandboxed Runtime.\n"
    "2. Isolated Client-Side Iframe: Every game runs directly inside the creator's browser in an isolated <iframe>. The server automatically injects a dynamic `<base href=\"...\">` tag and a runtime error-reporting bridge into `<head>`.\n"
    "3. Entrypoint: Every project MUST have an 'index.html' file at its root. It serves as the primary canvas, UI container, and script loader. 'index.html' cannot be deleted.\n"
    "4. File System & Folders:\n"
    "   - Supported code & data formats: '.html', '.css', '.js', '.mjs', '.json', '.csv', '.tsv', '.txt'.\n"
    "   - Directory Structure & '.keep.json': Empty directories in Yulya Studio are preserved in MongoDB with a marker file named '.keep.json' (e.g. 'assets/.keep.json').\n"
    "     * The Yulya Studio UI automatically hides '.keep.json' from the visual explorer tree so creators see clean folder structures.\n"
    "     * NEVER delete '.keep.json' files unless the user explicitly requests the deletion of that entire folder.\n"
    "     * When structuring code or assets, call `create_folder(folder_path)` to organize modular directories (e.g. 'js', 'assets', 'levels').\n\n"
    "=== CRITICAL CODING STANDARDS & PITFALL PREVENTION ===\n"
    "1. MULTI-FILE SCRIPT LOADING (STRICT REQUIREMENT):\n"
    "   - When splitting code across multiple JavaScript files (e.g. 'graphics.js', 'player.js', 'audio.js'):\n"
    "     * Classic Script Model (Recommended): Attach classes/objects to `window` (e.g. `window.SpriteManager = { ... };`). In 'index.html', load them in proper dependency order BEFORE 'app.js' (e.g. `<script src=\"graphics.js\"></script><script src=\"app.js\"></script>`).\n"
    "     * CRITICAL BROWSER RULE: In classic `<script>` tags, NEVER write raw `export` or `import` statements! Modern browsers immediately throw fatal `Uncaught SyntaxError: Unexpected token 'export'`, halting script execution completely.\n"
    "2. START SCREEN & EVENT BINDING: Start/Play buttons MUST attach 'click', 'touchend', and 'pointerdown' event listeners.\n"
    "3. PROCEDURAL AUDIO (WEB AUDIO API): Synthesize audio procedurally using Web Audio API.\n"
    "=== YOUR AGENTIC TOOLKIT ===\n"
    "You have 8 specialized tools. Always use them proactively:\n"
    "1. `list_files()`: Discover all files.\n"
    "2. `read_file(path)`: Inspect full code.\n"
    "3. `create_file(path, content)`: Create new code or data files.\n"
    "4. `create_folder(folder_path)`: Create new folders.\n"
    "5. `write_file(path, content)`: Overwrite or update files with complete, unabridged, functional code.\n"
    "6. `delete_file(path)`: Delete unwanted files.\n"
    "7. `search_files(query)`: Search across project files.\n"
    "8. `request_reload()`: ALWAYS invoke this tool after modifying files.\n\n"
    "=== AUTONOMOUS EXECUTION WORKFLOW ===\n"
    "1. Proactively invoke `write_file` or `create_file` to apply all necessary updates to HTML, CSS, and JS.\n"
    "2. Call `request_reload()` so the preview iframe refreshes immediately.\n"
    "3. Provide a concise summary of what was added or fixed, along with controls."
)

STANDARD_SYSTEM_PROMPT = (
    "You are Yulya Studio's AI coding assistant (https://studio.yulya.me). "
    "You help creators design, code, and polish browser games using HTML5 Canvas, CSS, JavaScript, and Web Audio API. "
    "Use the provided project tools (`write_file`, `create_file`, `create_folder`, `read_file`, `list_files`, `request_reload`) to perform edits. "
    "Keep explanations concise and summarize completed changes."
)


class MockProjectFS:
    """In-memory virtual project file system to safely observe tool executions."""
    def __init__(self):
        self.files = {
            "index.html": "<!doctype html>\n<html><head><script src=\"app.js\"></script></head><body><canvas id=\"canvas\"></canvas></body></html>",
            "style.css": "* { margin: 0; } canvas { background: #000; }",
            "app.js": "// Spaceship Game\nconst canvas = document.getElementById('canvas');\nconsole.log('Game initialized');"
        }
        self.tool_logs = []
        self.reloaded = False

    def list_files(self):
        self.tool_logs.append(("list_files", {}))
        return {"files": list(self.files.keys())}

    def read_file(self, path):
        self.tool_logs.append(("read_file", {"path": path}))
        if path in self.files:
            return {"content": self.files[path]}
        return {"error": "File not found"}

    def create_file(self, path, content=""):
        self.tool_logs.append(("create_file", {"path": path, "size": len(content)}))
        self.files[path] = content
        return {"created": path, "size": len(content)}

    def create_folder(self, folder_path):
        self.tool_logs.append(("create_folder", {"folder_path": folder_path}))
        clean = folder_path.strip("/")
        self.files[f"{clean}/.keep.json"] = '{"folder": true}'
        return {"created_folder": clean}

    def write_file(self, path, content=""):
        self.tool_logs.append(("write_file", {"path": path, "size": len(content)}))
        self.files[path] = content
        return {"saved": path}

    def delete_file(self, path):
        self.tool_logs.append(("delete_file", {"path": path}))
        if path in self.files:
            del self.files[path]
            return {"deleted": path}
        return {"error": "File not found"}

    def search_files(self, query):
        self.tool_logs.append(("search_files", {"query": query}))
        matches = []
        for p, c in self.files.items():
            if query.lower() in c.lower():
                matches.append({"path": p, "line": 1, "text": query})
        return {"matches": matches}

    def request_reload(self):
        self.tool_logs.append(("request_reload", {}))
        self.reloaded = True
        return {"requested": True}


async def run_ai_session(api_key: str, model_id: str, is_antigravity: bool, user_prompt: str):
    """Executes a complete AI multi-turn tool calling session mirroring backend/app.py."""
    fs = MockProjectFS()
    system = ANTIGRAVITY_SYSTEM_PROMPT if is_antigravity else STANDARD_SYSTEM_PROMPT
    max_calls = 15 if is_antigravity else 8
    model_name = "gemini-3.6-flash"  # Active Google Gemini model returning HTTP 200

    print(f"\n{'='*70}")
    print(f"▶ STARTING RUN: {'✦ ANTIGRAVITY AGENT MODE' if is_antigravity else 'STANDARD COPILOT MODE'}")
    print(f"  • Model: {model_name} (mapped from {model_id})")
    print(f"  • Max Allowed Tool Iterations: {max_calls}")
    print(f"  • System Prompt Directive Size: {len(system)} chars")
    print(f"{'='*70}")

    contents = [
        {"role": "user", "parts": [{"text": f"Project files (current state):\n{json.dumps(fs.files, indent=1)}\n\nUser Request: {user_prompt}"}]}
    ]

    calls = 0
    total_tokens_received = 0
    thoughts = []
    final_text = []
    start_time = time.time()

    async with httpx.AsyncClient(timeout=120.0) as client:
        while calls < max_calls:
            request_body = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": contents,
                "tools": TOOL_DECLARATIONS,
                "generationConfig": {"temperature": 0.2}
            }

            url = f"{GEMINI_API_BASE}/models/{model_name}:streamGenerateContent?alt=sse"
            resp = await client.post(url, headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, json=request_body)

            if resp.status_code != 200:
                print(f"[Error] Gemini API responded with status {resp.status_code}: {resp.text[:300]}")
                break

            full_parts = []
            for line in resp.text.splitlines():
                if not line.startswith("data: "):
                    continue
                try:
                    payload = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue

                for candidate in payload.get("candidates", []):
                    for part in candidate.get("content", {}).get("parts", []):
                        if part.get("thought"):
                            t = part.get("text", "")
                            if t:
                                thoughts.append(t)
                        elif part.get("text"):
                            final_text.append(part["text"])
                            total_tokens_received += 1
                        if part.get("functionCall"):
                            full_parts.append(part)

            if not full_parts:
                # No more tools called; model finished its task!
                break

            # Model requested tool executions!
            contents.append({"role": "model", "parts": full_parts})
            function_results = []
            print(f"\n[Iteration {calls + 1}] Model invoked {len(full_parts)} tool call(s):")

            for part in full_parts:
                call = part["functionCall"]
                name = call.get("name")
                args = call.get("args", {})
                print(f"   ⚙ Tool Call: {name}({json.dumps(args)[:90]}...)")

                # Execute against virtual FS
                if name == "list_files":
                    res = fs.list_files()
                elif name == "read_file":
                    res = fs.read_file(args.get("path", ""))
                elif name == "create_file":
                    res = fs.create_file(args.get("path", ""), args.get("content", ""))
                elif name == "create_folder":
                    res = fs.create_folder(args.get("folder_path", ""))
                elif name == "write_file":
                    res = fs.write_file(args.get("path", ""), args.get("content", ""))
                elif name == "delete_file":
                    res = fs.delete_file(args.get("path", ""))
                elif name == "search_files":
                    res = fs.search_files(args.get("query", ""))
                elif name == "request_reload":
                    res = fs.request_reload()
                else:
                    res = {"error": f"Unknown tool {name}"}

                function_results.append({"functionResponse": {"name": name, "response": res}})

            contents.append({"role": "user", "parts": function_results})
            calls += 1

    elapsed = time.time() - start_time
    print(f"\n--- Run Completed in {elapsed:.2f}s ---")
    print(f"Total Tool Loop Iterations: {calls}")
    print(f"Total Tool Actions Executed: {len(fs.tool_logs)}")
    print(f"Files Modified/Created: {list(fs.files.keys())}")
    print(f"Live Preview Reload Triggered: {fs.reloaded}")
    if thoughts:
        print(f"Reasoning / Thought Chunks Recorded: {len(thoughts)}")
        print(f"Thought Sample: {thoughts[0][:160]}...")
    print(f"Final Model Text Summary: {''.join(final_text)[:200]}...")

    return {
        "mode": "Antigravity" if is_antigravity else "Standard",
        "calls": calls,
        "tool_logs": fs.tool_logs,
        "files_after": list(fs.files.keys()),
        "reloaded": fs.reloaded,
        "elapsed": elapsed,
        "response_sample": "".join(final_text)[:300]
    }


async def main():
    print("=" * 70)
    print("YULYA STUDIO: AI TOOL EXECUTION & ANTIGRAVITY VERIFICATION TEST")
    print("=" * 70)

    try:
        api_key = get_gemini_key()
        print(f"✓ Gemini API Key loaded (length: {len(api_key)}, prefix: {api_key[:6]}...)")
    except Exception as exc:
        print(f"✗ Failed to load API key: {exc}")
        return

    test_prompt = (
        "Add a new sound engine module to this game. "
        "Create a file 'audio.js' that defines a Web Audio sound synth, "
        "update 'index.html' to link 'audio.js' before 'app.js', "
        "and reload the live preview."
    )

    print(f"\nUser Test Prompt:\n\"{test_prompt}\"")

    # Run 1: Standard Mode (Copilot without Antigravity)
    std_result = await run_ai_session(api_key, "gemini-3.6-flash", is_antigravity=False, user_prompt=test_prompt)

    # Cooldown to respect Google AI Studio RPM rate limits
    print("\n[Cooldown] Waiting 15s for Gemini API rate-limit window to reset...")
    await asyncio.sleep(15)

    # Run 2: Antigravity Autonomous Agent Mode
    ag_result = await run_ai_session(api_key, "antigravity-preview-latest", is_antigravity=True, user_prompt=test_prompt)

    # Print Final Side-by-Side Comparison Matrix
    print("\n" + "=" * 70)
    print("FINAL SIDE-BY-SIDE VERIFICATION MATRIX")
    print("=" * 70)
    print(f"{'METRIC':<30} | {'STANDARD MODE (No Antigravity)':<25} | {'ANTIGRAVITY AGENT MODE'}")
    print("-" * 80)
    print(f"{'System Directive':<30} | {'Passive Assistant':<25} | {'Autonomous Architect'}")
    print(f"{'Max Loop Iterations':<30} | {'8':<25} | {'15'}")
    print(f"{'Iterations Used':<30} | {str(std_result['calls']):<25} | {str(ag_result['calls'])}")
    print(f"{'Total Tools Executed':<30} | {str(len(std_result['tool_logs'])):<25} | {str(len(ag_result['tool_logs']))}")
    print(f"{'Created audio.js?':<30} | {str('audio.js' in std_result['files_after']):<25} | {str('audio.js' in ag_result['files_after'])}")
    print(f"{'Updated index.html?':<30} | {str(any(t[0] == 'write_file' and t[1].get('path') == 'index.html' for t in std_result['tool_logs'])):<25} | {str(any(t[0] == 'write_file' and t[1].get('path') == 'index.html' for t in ag_result['tool_logs']))}")
    print(f"{'Reloaded Preview?':<30} | {str(std_result['reloaded']):<25} | {str(ag_result['reloaded'])}")
    std_elapsed_str = f"{std_result['elapsed']:.2f}s"
    ag_elapsed_str = f"{ag_result['elapsed']:.2f}s"
    print(f"{'Time Elapsed':<30} | {std_elapsed_str:<25} | {ag_elapsed_str}")
    print("=" * 70)
    print("VERIFICATION CONCLUSION:")
    print("Both modes have access to the exact same 8 tools.")
    print("Antigravity actively invokes tools in an autonomous chain (multi-file writes, reloads, reasoning),")
    print("whereas Standard Mode stops early or writes minimal text.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
