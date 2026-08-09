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
    get streak(){return streak;}, set streak(v){streak=v; updateHUD();},
    set flowLit(v){flowLit=v;},
    get cap(){return carryCapacity;}, get wrong(){return wrongTurns;},
    get tut(){return tut ? {index:tut.index, practice:!!tut.practice} : null;},
    get steps(){return TUTORIAL_STEPS.length;},
    PASSES:PASSES, BUS:BUS_STATIONS, set elapsed(v){elapsed=v;},
    set score(v){score=v; updateHUD();},
    get lives(){return lives;}, set lives(v){lives=v; updateHUD();},
    get tier(){return tierIndex;}, get tierArt(){return tierArt.map(t=>!!t.img);},
    get tierNotice(){return tierNotice;}, setRoster(id,tiers){ROSTER[id]={name:id,tiers:tiers}; loadCharacter(id);},
    setChar(id){loadCharacter(id);}, setTier(n){applyTier(n);}, get roster(){return Object.keys(ROSTER);},
    get floaters(){return floaters;}, set hintCooldown(v){hintCooldown=v;},
    SIGN:SIGN, moneyMetrics:(t,px)=>{ctx.save(); ctx.font=px+'px Galindo, sans-serif';
      const w=moneyMetrics(t,px); ctx.restore(); return w;},
    setCap(n){carryCapacity=n;}, forceTicket(side){
      const t = tables.find(t => t.state === 'idle' && sideOfTable(t) === side) || tables[0];
      tickets.push({id:ticketIdCounter++, tableId:t.id, icon:'pizza', side:side,
                    spawnTime:performance.now()});
      t.state='waiting'; t.patience=1; t.warned=false; },
    get sheetOn(){return sheetReady();},
    get drainRate(){return drainRate;}, get spawnInterval(){return spawnInterval;},
    get eatMs(){return eatMs();}, get queueCap(){return queueCapPerSide();},
    get music(){return music;}, get musicErrorStreak(){return musicErrorStreak;},
    get musicSet(){return musicSet;}, get musicTrack(){return musicTrack;}, MUSIC:MUSIC,
    get muted(){return muted;},
    get rushMusic(){return rushMusic ? {src:rushMusic.src, time:rushMusic.currentTime,
      vol:rushMusic.volume, paused:rushMusic.paused, readyState:rushMusic.readyState} : null;},
    get rushMusicPlaying(){return rushMusicPlaying;},
    forceTierNotice(age){applyTier(1); tierNoticeName=(ROSTER[charId]&&ROSTER[charId].name)||'';
      tierNotice = TIER_NOTICE_MS - (age||0);},
    get handsFreeArt(){return !!handsFreeArt.img;},
    get capacityNotice(){return capacityNotice;}, set capacityNotice(v){capacityNotice=v;},
    get rushOver(){return rushOver;}, get rushOverTips(){return rushOverTips;},
    set rushEndsAt(v){rushEndsAt=v;}, set rushTips(v){rushTips=v;},
    get rushTips(){return rushTips;},
    get rushActive(){return rushActive;}, get rushArmedAt(){return rushArmedAt;},
    get rushLandAt(){return rushLandAt;}, get rushEndsAt(){return rushEndsAt;},
    get rushFastCount(){return rushFastCount;}, set rushFastCount(v){rushFastCount=v;},
    get rushReadyAt(){return rushReadyAt;}, get rushFastTarget(){return rushFastTarget;},
    get promoPending(){return promoPending;},
    get capacityNotice(){return capacityNotice;}, set capacityNotice(v){capacityNotice=v;},
    get rushSpawnMult(){return rushSpawnMult;}, get rushDrainMult(){return rushDrainMult;},
    get rushDurationMs(){return rushDurationMs;}, forceRush(){armRush();} };}});
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
              'lives', 'tier', 'tierArt', 'tierNotice',
              'deliveries', 'mode', 'flow', 'streak', 'cap', 'wrong', 'tut',
              'steps', 'PASSES', 'BUS', 'setRoster', 'setChar', 'setTier', 'roster',
              'floaters', 'hintCooldown', 'setCap', 'forceTicket', 'sheetOn',
              'SIGN', 'moneyMetrics', 'drainRate', 'spawnInterval', 'eatMs', 'queueCap', 'music', 'musicErrorStreak', 'musicSet', 'musicTrack',
              'muted', 'rushMusic', 'rushMusicPlaying', 'forceTierNotice',
              'handsFreeArt', 'rushOver', 'rushOverTips', 'rushTips', 'rushActive', 'rushArmedAt', 'rushLandAt', 'rushEndsAt', 'rushFastCount',
              'rushReadyAt', 'rushFastTarget', 'promoPending', 'capacityNotice', 'rushSpawnMult', 'rushDrainMult', 'rushDurationMs', 'forceRush'):
    assert field in DBG, field
print('probe.html regenerated with', len(DBG.splitlines()), 'lines of handle')
