#!/bin/bash
if [ -d "icons" ]; then
  echo "Icons already saved, remove icons folder to download again"
  exit 0
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JQ_SHIM="$SCRIPT_DIR/../../scripts/jq-shim.js"

git clone https://github.com/PapirusDevelopmentTeam/papirus-icon-theme.git papirus
mkdir icons
icon_paths=$(node "$JQ_SHIM" -r '.files[] | "\(.source) \(.icon)"' icons.json)
while read -r source icon_path
do
  cp "$source" "$icon_path"
done <<< "$icon_paths"
cp "$(node "$JQ_SHIM" -r '.defaultSource' icons.json)" "$(node "$JQ_SHIM" -r '.default' icons.json)" 
cp "$(node "$JQ_SHIM" -r '.folderSource' icons.json)" "$(node "$JQ_SHIM" -r '.folder' icons.json)" 
rm -rf papirus