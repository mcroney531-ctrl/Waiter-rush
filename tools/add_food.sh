#!/usr/bin/env bash
# One dish, from a just-uploaded GLB to a checked icon.
#
#   tools/add_food.sh <path-to.glb> <key>
#   tools/add_food.sh ~/uploads/whatever.glb pizza
#
# `key` must be one of the game's FOOD_ITEMS, since index.html loads
# assets/food/<key>.png by name: pizza sub tacos pasta salad club soup ribs
# tart burger.
#
# Does the whole chain, because doing it by hand nine times is nine chances to
# skip the readability check:
#   shrink -> contact sheet -> icon at the default angle -> foodgrid
#
# The contact sheet is rendered every time rather than only when something
# looks wrong. The spec asks for one per new dish shape and it costs seconds —
# 42 degrees suits a stacked burger and will not suit a bowl of soup, and the
# cheapest moment to find that out is before the icon ships.
set -euo pipefail

SRC=${1:?usage: add_food.sh <file.glb> <key>}
KEY=${2:?usage: add_food.sh <file.glb> <key>}
ELEV=${ELEV:-42}
YAW=${YAW:-0}

VALID="pizza sub tacos pasta salad club soup ribs tart burger"
case " $VALID " in *" $KEY "*) ;; *)
  echo "'$KEY' is not one of: $VALID" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."
mkdir -p art-source/food
cp "$SRC" "art-source/food/$KEY.glb"
chmod 644 "art-source/food/$KEY.glb"

echo "--- shrink ---"
python3 tools/shrink_glb.py "art-source/food/$KEY.glb" --inplace

echo "--- angles ---"
node tools/render_food.mjs "art-source/food/$KEY.glb" --name "$KEY" --contact

echo "--- icon at ${ELEV}deg ---"
node tools/render_food.mjs "art-source/food/$KEY.glb" --name "$KEY" --elev "$ELEV" --yaw "$YAW"

echo "--- the menu, measured ---"
python3 tools/foodgrid.py
