#!/usr/bin/env python3
"""Regenerate probe.html from index.html.

The game lives in an IIFE with no globals, so tests drive an instrumented copy.
Keep this the single source of the debug handle — hand-pasting it drifted twice
and silently dropped fields, which turned a real tutorial check into a vacuous
pass against `undefined`.
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
DST = os.path.join(ROOT, 'probe.html')   # gitignored; regenerate, never commit

DBG = """  Object.defineProperty(window,'__dbg',{get(){return {
    get tables(){return tables;}, get carried(){return carried;}, get tickets(){return tickets;},
    get player(){return player;}, get score(){return score;}, get cleared(){return cleared;},
    get deliveries(){return deliveries;}, get mode(){return mode;}, get flow(){return flowLit;},
    get streak(){return streak;}, get cap(){return carryCapacity;}, get wrong(){return wrongTurns;},
    get tut(){return tut ? {index:tut.index, practice:!!tut.practice} : null;},
    get steps(){return TUTORIAL_STEPS.length;},
    PASSES:PASSES, BUS:BUS_STATIONS, set elapsed(v){elapsed=v;},
    set score(v){score=v; updateHUD();},
    get tier(){return tierIndex;}, get tierArt(){return tierArt.map(t=>!!t.img);},
    get tierNotice(){return tierNotice;}, setRoster(id,tiers){ROSTER[id]={name:id,tiers:tiers}; loadCharacter(id);},
    get sheetOn(){return sheetReady();} };}});
"""

WAITS = ("      (window.__waits=window.__waits||[]).push(waited);\n"
         "      (window.__flowlog=window.__flowlog||[]).push(flowLit?1:0);\n")

s = open(SRC).read()

anchor = "      deliveries++;\n      carried.splice(carried.indexOf(item), 1);"
assert s.count(anchor) == 1, f'delivery anchor matched {s.count(anchor)} times'
s = s.replace(anchor, WAITS + anchor, 1)

tail = "  // initial static preview render\n  resetGame();"
assert s.count(tail) == 1, f'tail anchor matched {s.count(tail)} times'
s = s.replace(tail, DBG + tail, 1)

open(DST, 'w').write(s)

# prove every field the tests read is actually present
for field in ('tables', 'carried', 'tickets', 'player', 'score', 'cleared',
              'tier', 'tierArt', 'tierNotice',
              'deliveries', 'mode', 'flow', 'streak', 'cap', 'wrong', 'tut',
              'steps', 'PASSES', 'BUS', 'setRoster', 'sheetOn'):
    assert field in DBG, field
print('probe.html regenerated with', len(DBG.splitlines()), 'lines of handle')
