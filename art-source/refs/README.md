# refs

The DALL·E production renders that feed Meshy. Named `<character>-t<tier>.png`.

These are the source for any re-roll and for re-rendering a character later, so
they live here rather than in a chat upload that dies with its session. Nothing
in this folder is loaded by the game.

`python3 tools/readcheck.py refs/*.png` runs the 96px acceptance test over them.
