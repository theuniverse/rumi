#!/bin/zsh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
cd "$(dirname "$0")/../frontend"
exec npm run dev
