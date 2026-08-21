#!/usr/bin/env bash
#
# Clones Cheetah and builds/installs it from source.
#
#   curl -fsSL https://raw.githubusercontent.com/himanshuxmehra/cheetah/main/scripts/install.sh | bash
#
set -euo pipefail

REPO_URL="https://github.com/himanshuxmehra/cheetah.git"
INSTALL_DIR="${CHEETAH_INSTALL_DIR:-$HOME/cheetah}"

log() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required but not installed."
command -v npm >/dev/null 2>&1 || die "Node.js/npm is required but not installed. Install Node 18+ from https://nodejs.org."

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) die "Unsupported OS: $(uname -s). Windows users should run 'npm run make' manually and use the Squirrel installer in out/make." ;;
esac

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing checkout in $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  log "Cloning into $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

log "Installing dependencies"
npm install

log "Building Cheetah"
npm run make

if [ "$OS" = darwin ]; then
  ZIP_PATH=$(find out/make/zip/darwin -name '*.zip' -print -quit)
  [ -n "$ZIP_PATH" ] || die "Build finished but no .zip artifact was found under out/make/zip/darwin."

  UNZIP_DIR=$(mktemp -d)
  unzip -q "$ZIP_PATH" -d "$UNZIP_DIR"
  APP_PATH=$(find "$UNZIP_DIR" -maxdepth 1 -name '*.app' -print -quit)
  [ -n "$APP_PATH" ] || die "Could not find a .app bundle inside $ZIP_PATH."

  log "Installing to /Applications"
  rm -rf "/Applications/$(basename "$APP_PATH")"
  cp -R "$APP_PATH" /Applications/
  xattr -cr "/Applications/$(basename "$APP_PATH")" || true
  rm -rf "$UNZIP_DIR"

  log "Installed. Launch Cheetah from /Applications or Spotlight."
else
  if command -v dpkg >/dev/null 2>&1; then
    PKG_PATH=$(find out/make/deb -name '*.deb' -print -quit)
    [ -n "$PKG_PATH" ] || die "Build finished but no .deb artifact was found under out/make/deb."
    log "Installing $PKG_PATH (sudo required)"
    sudo dpkg -i "$PKG_PATH" || sudo apt-get install -f -y
  elif command -v rpm >/dev/null 2>&1; then
    PKG_PATH=$(find out/make/rpm -name '*.rpm' -print -quit)
    [ -n "$PKG_PATH" ] || die "Build finished but no .rpm artifact was found under out/make/rpm."
    log "Installing $PKG_PATH (sudo required)"
    sudo rpm -Uvh "$PKG_PATH"
  else
    die "Neither dpkg nor rpm found; install manually from out/make/ in $INSTALL_DIR."
  fi

  log "Installed. Launch Cheetah from your application menu."
fi
