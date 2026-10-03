#!/usr/bin/env bash
# Reproduces the research environment: downloads the original Minecraft 1.5.2 client jar,
# remaps it to human-readable MCP names (MCPHackers' 1.5.2 tiny mappings), and decompiles it
# with Vineflower into .cache/src152/ for study. Output is git-ignored and must never be
# committed: it is Mojang's code, used only as a behavioural reference.
#
# Requires: java 17+, curl, unzip. Usage: scripts/decompile.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache/research"
OUT="$ROOT/.cache/src152"
mkdir -p "$CACHE"

fetch() { # url dest
  [ -s "$2" ] || curl -fsSL --retry 4 -o "$2" "$1"
}

fetch "https://launcher.mojang.com/v1/objects/465378c9dc2f779ae1d6e8046ebc46fb53a57968/client.jar" "$CACHE/client.jar"
echo "465378c9dc2f779ae1d6e8046ebc46fb53a57968  $CACHE/client.jar" | sha1sum -c --quiet
fetch "https://mcphackers.org/versionsV2/1.5.2.zip" "$CACHE/mcp-1.5.2.zip"
unzip -o -q "$CACHE/mcp-1.5.2.zip" mappings.tiny -d "$CACHE"
fetch "https://maven.fabricmc.net/net/fabricmc/tiny-remapper/0.10.4/tiny-remapper-0.10.4-fat.jar" "$CACHE/tiny-remapper.jar"
fetch "https://repo1.maven.org/maven2/org/vineflower/vineflower/1.10.1/vineflower-1.10.1.jar" "$CACHE/vineflower.jar"

rm -f "$CACHE/client-named.jar"
java -jar "$CACHE/tiny-remapper.jar" "$CACHE/client.jar" "$CACHE/client-named.jar" \
  "$CACHE/mappings.tiny" official named --ignoreConflicts
rm -rf "$OUT" && mkdir -p "$OUT"
java -Xmx3g -jar "$CACHE/vineflower.jar" -dgs=1 -rsy=1 -log=ERROR "$CACHE/client-named.jar" "$OUT/"
echo "Decompiled sources: $OUT/net/minecraft/src (MCP names)"
