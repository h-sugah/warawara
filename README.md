# Warawara

Warawara is a simple avoidance game. You control a character with your mouse and try to survive as long as possible while enemies ("warawara") chase you around the screen.

"Warawara" is a Japanese word describing the way a large crowd of people swarms and throngs together.

It runs two ways from the exact same code:
- as a page in your web browser, or
- as a standalone desktop app (Windows / macOS), built with [Tauri](https://tauri.app).

## How to Play

- Move your mouse to move your character (the green circle) around the screen.
- Avoid the red enemies. If one touches you, the game ends.
- Four fixed shapes in the corners of the screen are launch points where enemies appear from. They also act as solid obstacles — touching one won't end the game, but it will block your way.
- Your score goes up automatically the longer you survive, and faster the more enemies are on screen at once.
- After a game ends, your result is added to a local top-10 leaderboard.

### Game Modes

Pick a mode on the title screen (use the arrow keys or click, then press START):

| Mode | Description |
|---|---|
| **Normal** | The standard game described above. |
| **Free** | Same as Normal, but there's no game over — enemies never touch you, so you can just watch them pile up. |
| **Dazzle** | Same as Normal, but the background constantly shifts and swirls to make it harder to see clearly. Score is worth 1.3x. |
| **Expert** | Same as Normal, plus several fast-spinning walls in the arena that fling you (and enemies) away on contact. Score is worth 1.7x. |

## Installation

You don't need to install anything to try the browser version. The desktop app requires a one-time build step (see below).

### Option 1: Play in a browser (quickest)

The game is plain HTML/JavaScript with no build step, but it needs to be served over `http://` rather than opened directly as a file (browsers block ES module scripts loaded via `file://`).

1. Clone or download this repository.
2. From the repository root, start a local web server pointed at the `web` folder. Either of these works:

   ```bash
   npx serve web
   ```

   ```bash
   python3 -m http.server 8000 --directory web
   ```

3. Open the URL it prints (e.g. `http://localhost:3000` or `http://localhost:8000`) in your browser.

### Option 2: Build the desktop app

The desktop app is a [Tauri](https://tauri.app) wrapper around the same game code, so it looks and plays identically to the browser version.

**Prerequisites:**

- [Rust](https://rustup.rs) (stable toolchain)
- The Tauri CLI: `cargo install tauri-cli --version "^2.0.0" --locked`
- **macOS**: Xcode (the full app, not just the Command Line Tools)
- **Windows**: Microsoft C++ Build Tools (the "Desktop development with C++" workload) and WebView2 (already included on most modern Windows installs)

**Build and run:**

```bash
cargo tauri dev
```

This opens the game in a native window. To produce a standalone, double-click-to-run app instead:

```bash
cargo tauri build
```

The finished app/installer will be under `src-tauri/target/release/bundle/`, in a subfolder that depends on your OS:

**macOS** (`bundle/macos/` and `bundle/dmg/`)

- Open the `.dmg` file and drag `warawara.app` into your `Applications` folder, or just double-click `warawara.app` directly to run it without installing.
- This build isn't signed/notarized by an Apple developer account. If you built it yourself and run it right away, macOS usually won't complain (Gatekeeper only checks apps that carry a "downloaded from the internet" quarantine flag, which a local build doesn't have). If you instead received the app from someone else — e.g. downloaded via a browser — Gatekeeper will likely refuse to open it on the first try ("warawara.app is damaged and can't be opened" or similar). Right-click (or Control-click) the app, choose **Open**, then confirm **Open** in the dialog that appears — you only need to do this once.

**Windows** (`bundle/msi/` and/or `bundle/nsis/`)

- Run the `.msi` or the `.exe` (NSIS) installer, whichever was produced, and follow the prompts.
- The installer isn't code-signed. As with macOS above, this mainly matters if the installer was downloaded through a browser rather than built locally — Windows SmartScreen may then show a "Windows protected your PC" warning. Click **More info**, then **Run anyway** to proceed.

**Linux** (`bundle/deb/`, `bundle/appimage/`, and/or `bundle/rpm/`, depending on `bundle.targets` in `tauri.conf.json`)

- **`.deb`**: `sudo dpkg -i warawara_0.1.0_amd64.deb` (or double-click it in a GUI package installer).
- **`.rpm`**: `sudo rpm -i warawara-0.1.0.x86_64.rpm` (or the equivalent `dnf install ./warawara-*.rpm`).
- **`.AppImage`**: mark it executable and run it directly — no installation needed: `chmod +x warawara_0.1.0_amd64.AppImage && ./warawara_0.1.0_amd64.AppImage`.

> Windows and macOS builds have been tested. Linux hasn't been tried yet, but should work the same way with the right [Tauri Linux prerequisites](https://tauri.app/start/prerequisites/) installed.

**About code signing**: this project doesn't currently sign or notarize its builds, and that's fine as long as you're building it yourself and running it locally — see the notes above. Code signing (an Apple Developer Program membership for macOS notarization, a code-signing certificate for Windows) would only become worth setting up if these builds start being distributed to other people, e.g. via GitHub Releases, since a downloaded file is what actually triggers the OS-level warnings.

## License

[MIT](LICENSE) © 2026 SUGAHARA Hiroyuki
