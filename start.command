#!/bin/zsh
set -e
cd "$(dirname "$0")"
export OPEN_BROWSER=1
node server.js
