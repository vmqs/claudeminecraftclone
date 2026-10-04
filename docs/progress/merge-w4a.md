# merge-w4a progress

Order: w4/account, w4/controls -> claude/minecraft-1-5-html-clone-wyzct1 (base d0e00fc)

- [x] account (64215f9): clean merge (same base), tsc ok
- [x] controls (25aaa36): conflicts DevTools (both account + controls), TESTING.md + ARCHITECTURE §13 (both rows kept); tsc ok
- [x] vite build
- [x] wire hooks / dedupe: no code needed (skin GL textures are allocateTexture-owned so pack reloads keep them; Steve fallback is the active pack char.png; GuiOptions options unchanged so Account Manager... keeps its free cell). Node: account 74, netskins 17, controls 62, netprotocol 105, netsession 124
- [x] smoke test: title, spawn, interact, controls exit 0 (Default pack renders); account exit 0 after scenario fix (real 'e' key under sky.pin's frozen timer -> mc.dev.press(18, 1))
- [x] ARCHITECTURE §13 (wave-4a paragraph)
