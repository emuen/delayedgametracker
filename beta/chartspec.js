/* Delay Booth · fieldChart3D(): turns a drive into the scene description chart3d.js / chart2d.js draw, plus the info-box text. */
"use strict";
function fieldChart3D(L,specOnly){
  var T=L.T, TC=L.TC||{}, offIsAway=!!(T.away&&T.away.id===L.off), odir=offIsAway?1:-1;
  var defT=offIsAway?T.home:T.away, offCol=(TC[L.off]||{}).bg||"#1d3f8f", defCol=(defT&&TC[defT.id]||{}).bg||"#8f1d1d";
  function F(x){return offIsAway?x:100-x}
  function tm(t){var c=t&&TC[t.id];return {name:t?(t.nm||t.ab):"",bg:c?c.bg:"#1f5a29",ink:c?c.ink:"#fff"}}
  var offInk=(TC[L.off]||{}).ink||"#fff", defInk=(defT&&TC[defT.id]||{}).ink||"#fff", RED="#c62828", FLAGC="#ffd23f";
  var SPX="(?:[A-Z]{2,4} -?\\d+|50)";
  var rows=[], n=L.rows.length, PLAYERS=playersOf(L.j,T);
  L.rows.forEach(function(r,i){
    var k=playKind(r), t=r.text||"", ty=((r.p||{}).type||{}).text||"", t0=t.split(/TWO-POINT CONVERSION/i)[0];
    var col=k==="pen"?FLAGC:k==="kick"?"#f2f2f2":(k==="ret"&&r.byOff===false)?defCol:offCol, ink=col===defCol?defInk:offInk;
    var inc=k==="pass"&&/incomplete/i.test(t0);   /* a failed 2-pt pass is not the play */
    var air=(k==="pass"&&!/sack|scramble/i.test(ty+" "+t0))||(k==="to"&&/intercept/i.test(ty+" "+t0));
    var fs=F(r.s), fe=F(r.e), fc=null, type=k==="kick"?"kick":inc?"inc":air?"air":"ground";
    if(inc){fe=fs+odir*(/deep/i.test(t)?18:9)}
    var yac=(r.p||{}).yardsAfterCatch;
    if(type==="air"&&typeof yac==="number"&&yac>0&&r.kind==="play"&&Math.abs(yac)>=0.5)fc=F(r.e-yac);
    /* Safety: the play ends in the offence's own end zone (the feed's end spot can be the other way). */
    var safety=r.score==="SAFETY"&&r.kind==="play"; if(safety){fe=F(-2);fc=null;type="ground"}
    if(Math.abs(fe-fs)<0.8&&!inc&&fc==null)type="dot";
    if(r.none||k==="off")type="none";   /* no lane: a defensive 2-pt, or offsetting fouls (a ghost of the snap) */
    var yds=r.kind==="play"?Math.round(safety?-2-r.s:r.e-r.s):null;
    var isInt=k==="to"&&/intercept/i.test(t0+" "+ty), defTD=r.score==="TD"&&(k==="to"||(k==="ret"&&r.byOff===false)||!!r.defTDHere);
    rows.push({fs:+fs.toFixed(2),fe:+fe.toFixed(2),fc:fc==null?null:+fc.toFixed(2),type:type,dir:odir,color:col,ink:ink,label:r.score||"",
      /* Replay-only hints (the still image ignores them). */
      kind:k,yds:yds,td:r.score==="TD",fg:(/\d+ yard field goal is/i.test(t)||/^(?:field goal (?:good|missed)|blocked field goal)/i.test(ty))&&r.kind==="play"&&k!=="pen"&&k!=="off"&&!isNullified(t),to:isInt,
      sack:/sack/i.test(ty.replace(/two.?point.*/i,"")+" "+t0)&&k!=="pen",kneel:/\bkneels\b/.test(t0),
      spike:/spike/i.test(t),safety:safety,gdd:L.offAb==="IND"&&r.kind==="play"&&/\(Shotgun\)/i.test((r.p||{}).text||"")&&/\bsacked\b/i.test(t)&&!isNullified(t),punt:k==="kick"&&/punt/i.test(ty+" "+t),defTD:defTD,retColor:k==="to"?defCol:undefined,retInk:k==="to"?defInk:undefined,
      scoreColor:defTD?defCol:col,scoreInk:defTD?defInk:ink,cont:i>0&&!!r.p&&L.rows[i-1].p===r.p});
    var row=rows[rows.length-1], ct=cleanText(t).replace(/\s*\[[^\]]*\]/g,""), m;
    if(r.p&&isKick(r.p))row.uncounted=true;   /* kickoffs and punts: not in the drive's play count */
    /* Injury: "NYG-C.Hood was injured during the play." (live only: the player-down scene with the robots). */
    if((m=/\b([A-Z]{2,4})-([A-Z][A-Za-z.'\- ]*?) was injured during the play/.exec(t))){var hab=ab2(m[1]), hoff=hab===L.offAb;row.hurt={name:m[2],ab:hab,bg:hoff?offCol:defCol,ink:hoff?offInk:defInk}}
    if(r.ring)row.ring=true;
    if(r.lats)row.lats=r.lats.map(function(x){return +F(x).toFixed(2)});
    /* Interception: where the ball was caught (ESPN may credit pressure in brackets or parentheses), so the
       pass flies forward and the return comes back in the defence's colour. A touchback has no return. */
    if(isInt&&(m=new RegExp("INTERCEPTED by \\S+ at ("+SPX+")\\b").exec(ct.replace(/\s*\([^)]*\)/g,"")))){var ia=parseSpot(m[1],L.A);if(ia!=null){row.intAt=+F(ia).toFixed(2);row.retColor=defCol;
      if(/INTERCEPTED by \S+ at \S+ -?\d+\.\s*Touchback/.test(ct.replace(/\s*\([^)]*\)/g,""))){row.fe=row.intAt;row.touchback=true}}}
    /* Returns: the yards the text states (laterals included), unless a penalty or a lateral makes them disagree with the lane. */
    if(k==="ret"){var lane=Math.round((r.e-r.s)*(r.byOff===false?-1:1));row.yds=r.retYds!=null&&Math.abs(Math.abs(lane)-Math.abs(r.retYds))<=2?r.retYds:lane;
      if(r.poss||r.fumRet||(L.rows[i-1]&&L.rows[i-1].p===r.p&&L.rows[i-1].blocked)){row.retChip=col}}
    if(row.fg)fgRow(row,r,t,ty);
    else if(r.blocked){row.blocked=true;row.fe=+F(r.e).toFixed(2);row.type="kick"}
    /* A foul with no play: the play that happened before the flag (replay draws it, then the walk-off). */
    if((k==="pen"||k==="off")&&r.kind==="play"&&!r.place&&!r.addOn){var bf=ct.split(/\.?\s?PENALTY on|\.?\s?Penalty on/)[0], bfx=bf.replace(/\s*\([^)]*\)/g,"");
      var kicker=teamIdOf((r.p||{}).start)===L.off;
      if((m=/\b(?:punts|kicks)(?: onside)? (\d+) yards?/.exec(bfx))&&/\b(?:punts|kicks)\b/.test(bfx))row.prePlay={type:"kick",len:(kicker||/\bpunts\b/.test(bfx)?1:-1)*(+m[1])};
      else if((m=new RegExp("INTERCEPTED by \\S+ at ("+SPX+")").exec(bfx))){var ia2=parseSpot(m[1],L.A), rr=new RegExp("\\.\\s+\\S+ (?:(?:to|pushed ob at|ran ob at) "+SPX+" )?for (-?\\d+) yards?").exec(bfx.slice(m.index));
        if(ia2!=null)row.prePlay={type:"int",len:ia2-r.s,ret:/Touchback/.test(bfx)||!rr?0:-(+rr[1]),retColor:defCol,int:true};}
      else if(/pass incomplete|incomplete pass/i.test(bfx))row.prePlay={type:"inc",len:/deep/i.test(bfx)?18:9};
      else if((m=/for (-?\d+) yards?/.exec(bfx)))row.prePlay={type:/\bpass\b/i.test(bfx)&&!/sacked/i.test(bfx)?"air":"ground",len:+m[1]};
      else if(/for no gain/.test(bfx))row.prePlay={type:"ground",len:0};
      if(row.prePlay){row.ghostColor=offCol;row.prePlay.td=/TOUCHDOWN/.test(bfx)}
      if(k==="off"){row.ghostOnly=true;row.fe=row.fs}}
    /* Who fouled (the first accepted foul), for the flag chip. */
    if(k==="pen"&&(m=/PENALTY on ([A-Z]{2,4})(?:-[^,]+)?,\s*[^,]+,\s*(?:\d+ yards?|placed at)/.exec(t)))row.flagTeam=ab2(m[1]);
    /* Chips that say more than the yards. */
    var sm;
    if(r.place)row.chip={text:"FLAG "+r.place.team+", ball at the "+(r.place.at.match(/-?\d+$/)||["?"])[0],bg:FLAGC,fg:"#17201b",flag:true};
    else if(k==="kick"&&r.onside){var rt=r.onside.team||(r.byOff===false?L.offAb:L.defAb), rc=sideOf(rt,L.A)==="d"?defCol:offCol;row.chip={text:"Onside · "+rt+" recovers",bg:rc,fg:rc===defCol?defInk:offInk}}
    else if(k==="kick"&&r.end)row.chip={text:r.end};
    else if(row.sack&&!row.td&&r.kind==="play"&&(sm=/sacked at \S+ \S+ for (-?\d+) yards?/.exec(t0)))row.chip={text:"Sack, "+ydStr(+sm[1]),bg:"#b4441d"};
    if(r.def2){row.chip={text:"Defensive 2-pt",bg:defCol,fg:defInk};row.label=""}
    if(isInt&&!row.td){
      if(row.touchback)row.chip={text:"Touchback",bg:defCol,fg:defInk};
      else if((m=/INTERCEPTED by \S+ at \S+(?: \S+)?\.\s+\S+ (?:(?:to|pushed ob at|ran ob at) \S+ \S+ )?for (-?\d+) yards?/.exec(ct.replace(/\s*\([^)]*\)/g,""))))row.chip={text:+m[1]?ydStr(+m[1],"return"):"No return",bg:defCol,fg:defInk};
      else if(/INTERCEPTED by \S+ at (?:\S+ -?\d+|50)\.\s+\S+ (?:to \S+ \S+ )?for no gain/.test(ct.replace(/\s*\([^)]*\)/g,"")))row.chip={text:"No return",bg:defCol,fg:defInk};
      else if(row.intAt==null)row.chip={text:"Intercepted",bg:defCol,fg:defInk};
    }
    if(isInt&&row.td&&(m=/INTERCEPTED by \S+ at (?:\S+ -?\d+|50)\.\s+\S+ (?:\S+ )?for (\d+) yards?, TOUCHDOWN/.exec(ct.replace(/\s*\([^)]*\)/g,""))))row.yds=+m[1];
    else if(row.td&&r.defTDHere)row.yds=0;
  });
  /* One look for every change of possession, and scores in the scoring team's colour: the play's last
     row carries the banner (and the hold); the event names it. */
  for(var gi=0;gi<rows.length;){
    var gj=gi; while(gj+1<rows.length&&rows[gj+1].cont)gj++;
    var lastR=rows[gj], lastL=L.rows[gj], poss=null, tx=lastL.text||"";
    for(var q=gi;q<=gj;q++)if(L.rows[q].poss)poss=L.rows[q].poss;
    if(lastR.to)poss="INTERCEPTED";
    else if(!poss&&lastR.kind==="to")poss="FUMBLE";
    if(!poss&&lastL.kind==="play"&&lastL.p&&!isNullified(tx)&&!lastR.fg&&endOf(lastL.p,L.offAb)==="Downs")poss="TURNOVER ON DOWNS";
    if(poss)lastR.poss=poss;
    if(lastR.td){
      var tn=/ATTEMPT SUCCEEDS|\b2-pt good/.test(tx)?"2-pt good":/TWO-POINT CONVERSION ATTEMPT|\b2-pt failed/.test(tx)?"2-pt failed":/extra point is (?:No Good|Blocked)|\bPAT missed/i.test(tx)?"PAT missed":"";
      if(tn){lastR.tryNote=tn;lastR.label="TD · "+tn}
      var nm=!lastR.defTD?"TOUCHDOWN":poss==="INTERCEPTED"||/INTERCEPTED/.test(tx)?"PICK-SIX":poss==="FUMBLE"||/FUMBLES/.test(tx)?"FUMBLE RETURN TD":"TOUCHDOWN";
      lastR.banner={text:nm,bg:lastR.scoreColor,fg:lastR.scoreInk,sub:tn};
    }
    else if(lastR.fg&&!lastR.fgMiss)lastR.banner={text:"FIELD GOAL",bg:lastR.color,fg:lastR.ink,size:18};
    else if(lastR.safety)lastR.banner={text:"SAFETY",bg:RED};
    else if(poss)lastR.banner={text:poss,bg:RED};
    else lastR.banner=null;
    for(q=gi;q<gj;q++)rows[q].banner=null;
    gi=gj+1;
  }
  /* Field goal: the outcome from the play text, the kick distance, and the flight from the spot of
     the kick (7 yards behind the line: distance = line to goal + 17) toward the posts on the end line
     (offence's 110). fe is roughly where the flight ends, for the end-zone tint and the tap targets. */
  function fgRow(row,r,t,ty){
    var m=/(\d+) yard field goal is (GOOD|No Good|BLOCKED)/i.exec(t), dist=m?+m[1]:null, res;
    var what=m?m[2]:/blocked/i.test(ty)?"BLOCKED":/missed|no good/i.test(ty)?"No Good":"GOOD";
    var upL=/hit (?:the )?left upright/i.test(t), upR=/hit (?:the )?right upright/i.test(t);
    if(/blocked/i.test(what))res="blocked";
    else if(/^good$/i.test(what)){res="good";if(upL||upR||/\bupright\b/i.test(t))row.fgDoink=upR?"R":"L"}   /* no side named: drawn off the left one */
    else res=upL?"upL":upR?"upR":/wide left/i.test(t)?"wideL":/wide right/i.test(t)?"wideR":/\bshort\b/i.test(t)?"short":"miss";
    var los=r.s, kickAt=dist&&Math.abs(110-dist-(los-7))<=6?110-dist:los-7;
    row.fgResult=res; row.fgDist=dist; row.fgMiss=res!=="good"; row.type="fg"; row.yds=null;
    if(res==="blocked")row.blocked=true;
    row.fs=+F(kickAt).toFixed(2);
    row.fe=+F(res==="blocked"?los+1:res==="short"||res==="miss"?106:res==="upL"||res==="upR"?106.6:110).toFixed(2);
  }
  /* Team timeouts called just before a play, shown during that play's pre-snap beat in a replay. */
  var tmo=null, ri=0;
  (L.vis||[]).forEach(function(p){
    if(isNonPlay(p)){var m=/^\s*timeout\s*#?(\d+)\s+by\s+([A-Z]{2,4})/i.exec(p.text||"");if(m)tmo=m[2]+" timeout #"+m[1];return}
    while(ri<L.rows.length&&L.rows[ri].p!==p)ri++;
    if(ri<L.rows.length&&tmo){rows[ri].tmo=tmo}
    tmo=null;
  });
  var los=null, ltg=null, lastP=L.real[L.real.length-1];
  if(!L.done&&lastP&&!lastP.scoringPlay){
    var be=toPos(lastP.end,L.off,L.A);
    if(be!=null&&be>=0&&be<=100){los=+F(be).toFixed(2);var dist=+((lastP.end||{}).distance)||0;if(dist&&lastP.end.down>0&&be+dist<100)ltg=+F(be+dist).toFixed(2)}
  }
  /* Play text, condensed and outcome first: no tacklers, snapper/holder or enforcement legalese.
     A "\n" splits it into the box's two lines. */
  /* Sentences that are not the play: eligibility reports, injury notes, replay notes. Reviews and
     challenges are settled before this (ftext keeps the final ruling only). */
  function scrub(t){
    return t.replace(/^.*?reported in as eligible\.\s*/i,"")
      .replace(/\*\*\s*Injury Update:\s*[A-Z]{2,4}-\S+(?:\s+[a-z][^.]*)?\.\s*/g,"").replace(/\s*\*\*.*$/,"")
      .replace(/\s*[A-Z]{2,4}-\S+ (?:was injured during the play|has returned to the game)\.?/g,"")
      .replace(/\s*The [^.]* was assisted by replay\.?/gi,"").replace(/\s*Fumble Forced by \S+\.?/g,"").trim();
  }
  var SP="(?:[A-Z]{2,4} -?\\d+|50)";
  /* Shared clean-up: no formations, tacklers, assists, snapper/holder, declined penalties; PAT / 2-pt /
     fumbles said briefly. Used for both the snap text and the result text. */
  function tidy(raw){
    var off2=0, t=scrub(cleanText(ftext(raw)))
      .replace(/^\((?:Punt|Field Goal|Run|Pass) formation\)\s*/i,"")
      .replace(/(\S+) FUMBLES \(Aborted\)/,"Aborted snap. $1 FUMBLES").replace(/^(\S+) Aborted\.\s+(\S+) FUMBLES/,"Aborted snap. $2 FUMBLES")
      .replace(/\s*\([^)]*\)/g,"").replace(/\s*\[[^\]]*\]/g,"")
      .replace(/([a-z0-9])\.(?=[A-Z]{2,}|Penalty\b|The\b)/g,"$1. ")
      .replace(/,?\s*(?:Center|Holder)-\S+?(?=[,.](?:\s|$)|$)/g,"")
      .replace(/\s*\S+ extra point is GOOD\.?/g," PAT good.").replace(/\s*\S+ extra point is (?:No Good|BLOCKED)[^.]*\.?/gi," PAT missed.")
      .replace(/\s*TWO-POINT CONVERSION ATTEMPT\.\s*.*?ATTEMPT (SUCCEEDS|FAILS)\.?/,function(_,r){return r==="SUCCEEDS"?" 2-pt good.":" 2-pt failed."})
      .replace(/\s*DEFENSIVE TWO-POINT ATTEMPT\.\s*(.*?)\s*ATTEMPT (SUCCEEDS|FAILS)\.?/,function(_,w,r){return r==="SUCCEEDS"?" Defensive 2-pt: "+w.replace(/\.$/,"")+".":""})
      .replace(/\s*Penalty on [^,]+,[^,]+, declined\.?/gi,"")
      .replace(/,?\s*TOUCHDOWN NULLIFIED by Penalty\.?/i," · TD nullified.")
      .replace(/^Direct snap to \S+?\.\s+/,"").replace(new RegExp(",?\\s*impetus ends at "+SP,"g"),"")
      .replace(/,?\s*(downed|fair catch) by \S+?(?=[,.](?:\s|$)|$)/g,", $1")
      .replace(new RegExp("\\s*Penalty on [A-Z]{2,4}(?:-\\S+)?, [^,]+, offsetting(?:, enforced at "+SP+")?(?: - No Play)?\\.?","gi"),function(){off2=1;return ""}).replace(/\s*\d+-second runoff[^.]*\./g,"")
      .replace(new RegExp("\\s*\\S+ MUFFS catch,?\\s*(?:touched at "+SP+",\\s*)?RECOVERED by ([A-Z]{2,4})-\\S+? at ("+SP+")\\.?","gi")," MUFFED, $1 recovers at $2.")
      .replace(new RegExp("\\s*\\S+ MUFFS catch,?\\s*(?:touched at "+SP+",\\s*)?and recovers at ("+SP+")\\.?","g")," MUFFED, recovered at $1.")
      .replace(new RegExp("\\s*\\S+ MUFFS catch,?\\s*ball out of bounds at ("+SP+")\\.?","g")," MUFFED, out of bounds at $1.")
      .replace(new RegExp("FUMBLES(?: at "+SP+")?,?\\.?\\s*(?:touched at "+SP+",\\s*)?RECOVERED by ([A-Z]{2,4})-\\S+? at ("+SP+")\\.?(?:\\s*(?!Lateral)\\S+ (?:to "+SP+" )?for (?:-?\\d+ yards?|no gain)(?=[.,]|$)\\.?)?","gi"),"FUMBLE, $1 recovers at $2.")
      .replace(new RegExp("FUMBLES(?: at "+SP+")?,?\\s*(?:touched at "+SP+",\\s*)?and recovers at ("+SP+")\\.?","g"),"FUMBLE, recovered at $1.")
      .replace(new RegExp("FUMBLES(?: at "+SP+")?,?\\s*ball out of bounds (?:at ("+SP+")|in End Zone)\\.?","g"),function(_,a){return a?"FUMBLE, out of bounds at "+a+".":"FUMBLE, out of the end zone."});
    if(off2)t=t.replace(/[\s.]*$/,"")+". Offsetting penalties, no play.";
    return t.replace(/\s+/g," ").replace(/\s+([.,])/g,"$1").replace(/,\./g,".").replace(/\.{2,}/g,".").trim();
  }
  /* One line of the box: drop trailing " · " parts (if enough is left), then cut at a sentence end, then at a word with "…". Never mid-word. */
  var LINE=52;
  function fitLine(x,max){
    max=max||LINE; x=x.trim(); if(x.length<=max)return x;
    var parts=x.split(" · "); while(parts.length>1&&parts.join(" · ").length>max&&parts.slice(0,-1).join(" · ").length>=max*0.6)parts.pop();
    x=parts.join(" · "); if(x.length<=max)return x;
    var se=x.slice(0,max).lastIndexOf(". "); if(se>=max*0.5)return x.slice(0,se+1);
    var cut=x.slice(0,max-1).lastIndexOf(" "); return (cut>0?x.slice(0,cut):x.slice(0,max-1)).replace(/[\s,;·.]+$/,"")+"…";
  }
  /* Is this team (as the play text spells it) the drive's offence? */
  function isOff(ab){return L.A&&typeof sideOf==="function"?sideOf(ab,L.A)==="o":ab===L.offAb}
  function short(f){
    if(/^Kickoff Short of Landing Zone$/i.test(f))return "Short kickoff";
    return f.charAt(0)+f.slice(1).toLowerCase().replace(/^efensive /,"ef. ").replace(/^ffensive /,"ff. ");
  }
  /* The accepted fouls as "Penalty TEN, Roughing the passer, 15 yds · 1st down" (two by one team:
     "Penalty NE, Def. holding + Unsportsmanlike conduct, 10 yds"). Yards without a sign: the walk-off shows the way. */
  function penOf(t,cp){
    var re=/PENALTY on ([A-Z]{2,4})(?:-[^,]+)?,\s*([^,]+?),\s*(?:(\d+) yards?|placed at ([A-Z]{2,4} -?\d+|50))[^.]*\./gi, m, list=[];
    while((m=re.exec(t)))list.push({idx:m.index,team:m[1],foul:short(m[2]),yds:m[3]?+m[3]:null,at:m[4]||null,between:/enforced between downs/i.test(m[0])});
    if(!list.length)return null;
    var f0=list[0], mine=isOff(f0.team), play=list.filter(function(x){return !x.between});
    /* Only fouls "enforced between downs" (e.g. after a touchdown): they move the next kickoff, not this play. */
    if(!play.length)return {idx:f0.idx, text:"Penalty "+f0.team+", "+f0.foul+(f0.yds?", "+ydStr(f0.yds):"")+" on the kickoff", between:true};
    var same=list.every(function(x){return x.team===f0.team}), tot=list.reduce(function(a,x){return a+(x.yds||0)},0);
    var fd=cp&&cp.end&&cp.end.down===1&&!mine&&tot?" · 1st down":"";
    var txt=same?"Penalty "+f0.team+", "+list.map(function(x){return x.foul}).join(" + ")+(f0.at&&list.length===1?" · ball at "+f0.at:", "+ydStr(tot))
      :list.map(function(x,i){return (i?"":"Penalty ")+x.team+", "+x.foul+(x.yds?", "+ydStr(x.yds):" · ball at "+x.at)}).join(" · ");
    return {idx:f0.idx, text:txt+fd};
  }
  function kindOf(b){
    return /PAT|extra point/i.test(b)?"extra point":/2-pt/.test(b)?"2-pt try":/pass incomplete|incomplete/i.test(b)?"incomplete pass":/sacked/i.test(b)?"sack":/\bpass\b/i.test(b)?"completed pass":/kneels/i.test(b)?"kneel":/punts/i.test(b)?"punt":/kicks/i.test(b)?"kick":/field goal/i.test(b)?"field goal":/scrambles/i.test(b)?"scramble":"run";
  }
  /* What a foul wiped out, in a few words. */
  function wiped(b){return /INTERCEPTED/.test(b)?"INT wiped out":/TD nullified|TOUCHDOWN/.test(b)?"TD wiped out · "+kindOf(b):/FUMBLE, [A-Z]{2,4} recovers/.test(b)&&!/FUMBLE, (?:recovered|out of)/.test(b)?"Fumble wiped out":"No play · "+kindOf(b)}
  /* A play said shortly: "J.Love pass short left to M.Golden for 8 yards" (the spot shows in the next header). */
  function compact(b){return b.replace(new RegExp("\\s(?:to|ran ob at|pushed ob at|out of bounds at) "+SP+"(?= for)","g"),"").replace(/[\s.]+$/,"")}
  /* Box yardage in the page's one format; team codes as the page writes them. */
  function yardsOut(x){return x.replace(/\bfor (-?\d+) yards?\b/g,function(_,n){return "for "+ydStr(+n)}).replace(/(-?\d+)-yd return/g,function(_,n){return ydStr(+n,"return")}).replace(/\b(\d+) yards?\b/g,function(_,n){return ydStr(+n)})}
  function condense(raw,cp){return aliasCodes(yardsOut(condense0(raw,cp)))}
  /* Result text, outcome first. A "\n" splits it into the box's two lines. */
  function condense0(raw,cp){
    var t=tidy(raw), m, pen=penOf(t,cp), nul=isNullified(t);
    if(!nul&&(m=new RegExp("^(.*?)\\s+(?:intended for (\\S+)\\s+)?INTERCEPTED by (\\S+) at ("+SP+")\\.?\\s*(.*)$").exec(t))){
      var r=new RegExp("^\\S+ (?:(?:to|pushed ob at|ran ob at) "+SP+" )?for (-?\\d+) yards?(, TOUCHDOWN)?|^\\S+ (?:to "+SP+" )?for no gain").exec(m[5]), ret="";
      if(r)ret=r[1]==null||+r[1]===0?" · no return":" · "+parseInt(r[1],10)+"-yd return";
      else if(/^Touchback/i.test(m[5]))ret=" · touchback";
      var ip=penOf(m[5],cp), l2=ip?"+ "+ip.text:m[1]+(m[2]?" to "+m[2]:"");
      if(r&&r[2])return "INTERCEPTED by "+m[3]+" · TOUCHDOWN, "+parseInt(r[1],10)+"-yd return\n"+l2;
      return "INTERCEPTED by "+m[3]+" at "+m[4]+ret+"\n"+l2;
    }
    /* Blocked punt: who blocked it, then who recovered and any return. */
    if(!nul&&(m=/^(\S+) punts? is BLOCKED(?: by (\S+?)(?=,|\.\s|\.?$))?/i.exec(t))){
      var bl=blockLine(raw,t), l1="Punt BLOCKED"+(m[2]?" by "+m[2]:" · "+m[1]);
      if(m[2]&&/^Blocked by /.test(bl))bl="";
      return l1+(bl?"\n"+bl:"");
    }
    if(!nul&&(m=/^(\S+) (\d+) yard field goal is (GOOD|No Good|BLOCKED)/i.exec(t))){
      var good=/^good$/i.test(m[3]), blk=/blocked/i.test(m[3]), uL=/hit (?:the )?left upright/i.test(t), uR=/hit (?:the )?right upright/i.test(t);
      var why=blk?blockLine(raw,t):good?(uL||uR?"Off the "+(uL?"left":"right")+" upright and in":/\bupright\b/i.test(t)?"Off the upright and in":""):uL?"Hit left upright":uR?"Hit right upright":/wide left/i.test(t)?"Wide left":/wide right/i.test(t)?"Wide right":/\bshort\b/i.test(t)?"Short":"";
      var l2f=[why,pen?"+ "+pen.text:""].filter(Boolean).join(" · ");
      return "Field goal "+(good?"GOOD":blk?"BLOCKED":"NO GOOD")+" · "+m[1]+" from "+m[2]+" yds"+(l2f?"\n"+l2f:"");
    }
    if(/Offsetting penalties, no play\.?$/.test(t)){var ob=t.replace(/\.?\s*Offsetting penalties, no play\.?$/,"");return "Offsetting penalties · no play"+(ob?"\n"+compact(ob):"")}
    if(pen){
      var before=t.slice(0,pen.idx).replace(/[\s.]+$/,"");
      if(nul||!before)return pen.text+(before?"\n"+wiped(before):nul?"\nNo play":"");
      if(!/\b(?:kicks|punts)\b/.test(before)){
        if(/TOUCHDOWN/.test(before))return "TOUCHDOWN · "+compact(before.replace(/,?\s*TOUCHDOWN\.?/,"."))+"\n+ "+pen.text;
        return compact(before)+"\n+ "+pen.text;
      }
    }
    if((m=/^(\S+) punts? is BLOCKED/i.exec(t)))return "Punt BLOCKED · "+m[1]+"\n"+blockLine(raw,t);
    if((m=new RegExp("^(\\S+) (kicks|punts)(?: onside)? (\\d+) yards? (?:from "+SP+" )?(?:to landing zone )?to ((?:the )?"+SP+"|(?:the )?[A-Z]{2,4} End Zone|end zone)([^.]*)\\.\\s*(.*)$").exec(t))){
      var l1=(m[2]==="punts"?"Punt ":/onside/.test(t)?"Onside kick ":"Kickoff ")+m[3]+" yds to "+m[4].replace(/^the /,"")+m[5].replace(/ by \S+/g,"").replace(/,?\s*Touchback.*$/i,", touchback").replace(/\bFair catch\b/i,"fair catch").replace(/\bOut of bounds\b/i,"out of bounds");
      var rest=m[6], bits=[], r2;
      /* The return: each carrier (laterals included) and the total. */
      if((r2=new RegExp("^(\\S+) (?:(?:to|pushed ob at|ran ob at) "+SP+" )?for (?:(-?\\d+) yards?|no gain)(, TOUCHDOWN)?\\.?\\s*(.*)$").exec(rest))){
        var who=[r2[1]], tot=r2[2]==null?0:+r2[2], tdk=!!r2[3]; rest=r2[4];
        var lr; while(!tdk&&(lr=new RegExp("^Lateral to (\\S+) (?:(?:to|pushed ob at|ran ob at) "+SP+" )?for (-?\\d+) yards?(, TOUCHDOWN)?\\.?\\s*(.*)$").exec(rest))){who.push(lr[1]);tot+=+lr[2];tdk=!!lr[3];rest=lr[4]}
        bits.push(r2[2]==null&&who.length===1?r2[1]+", no return":who.join(", lateral to ")+" · "+ydStr(tot,"return")+(tdk?" · TOUCHDOWN":""));
      }
      if((r2=/^(FUMBLE|MUFFED), ([^.]*)\.\s*(.*)$/.exec(rest))){bits.push(r2[1]+", "+r2[2].replace(/ at .*$/,""));rest=r2[3]}
      if((r2=new RegExp("^RECOVERED by ([A-Z]{2,4})-[A-Za-z.'\\-]+?(?: at "+SP+")?\\.?(?:\\s+|$)(.*)$","i").exec(rest))){bits.push(r2[1]+" recovers");rest=r2[2]}
      var kp=penOf(rest,cp); if(kp){bits.push(kp.text);rest=""}
      if(/PAT|2-pt/.test(rest)){bits.push(rest.replace(/\.$/,""));rest=""}
      if(rest)bits.push(compact(rest).replace(/^Lateral/,"lateral"));
      return l1+(bits.length?"\n"+bits.join(" · "):"");
    }
    if((m=/^(.+?) Defensive PAT Conversion/i.exec(t)))return "Defensive 2-pt\nReturned by "+m[1];
    if(/,?\s*TOUCHDOWN\.?/.test(t))return "TOUCHDOWN · "+t.replace(/,?\s*TOUCHDOWN\.?/,".").replace(/\.\./g,".");
    if((m=/^(.{3,40}?)\s+Safety\.?$/i.exec(t)))return "SAFETY · "+m[1];
    return t.length>LINE*2?compact(t).replace(/\. Lateral/g,", lateral"):t;
  }
  /* After a block: who recovered and any return ("SEA recovers · 20-yd return"), else who blocked it. */
  function blockLine(raw,t){
    var m, rec=new RegExp("\\brecovered by ([A-Z]{2,4})(?:-\\S+?)?(?: at ("+SP+"))?(?=[,.\\s]|$)","i").exec(t);
    var ret=new RegExp("\\.\\s+\\S+ (?:(?:to|pushed ob at|ran ob at) "+SP+" )?for (?:(-?\\d+) yards?|no gain)(, TOUCHDOWN)?").exec(t);
    var parts=[];
    if(rec)parts.push(rec[1]+" recovers"+(rec[2]&&!ret?" at "+rec[2]:""));
    var tot=0,re2=new RegExp("\\.\\s+\\S+ (?:(?:to|pushed ob at|ran ob at) "+SP+" )?for (-?\\d+) yards?","g"),mm2;while((mm2=re2.exec(t)))tot+=+mm2[1];
    if(ret&&ret[1]!=null)ret[1]=String(tot);
    if(ret&&ret[2])parts.push("TOUCHDOWN, "+Math.abs(+ret[1])+"-yd return");
    else if(ret)parts.push(ret[1]==null||+ret[1]===0?"no return":Math.abs(+ret[1])+"-yd return");
    else if(/\bTOUCHDOWN\b/.test(t))parts.push("TOUCHDOWN");
    if(parts.length)return parts.join(" · ");
    m=/BLOCKED \(([^)]+)\)|BLOCKED by (\S+?)(?:,|\.\s|\.?$)/i.exec(cleanText(ftext(raw)));
    return m?"Blocked by "+(m[1]||m[2]):"";
  }
  /* Head notes: a review or challenge, a fake from punt or field-goal formation. */
  function noteOf(cp){
    var raw=cp.text||"", ft=ftext(raw), n=[], fm=/^\s*(?:\([^)]*\)\s*)?\((Punt|Field Goal) formation\)/i.exec(raw.replace(/^\s*\((?:No Huddle,?\s*)?(?:Shotgun|No Huddle)\)\s*/i,""))||/\((Punt|Field Goal) formation\)/i.exec(raw);
    if(fm&&!/\bpunts\b|field goal is|extra point/i.test(ft)&&!/^\s*(?:\([^)]*\)\s*)*PENALTY/i.test(raw)){var fg=/field/i.test(fm[1]);n.push(/FUMBLES|Aborted/i.test(ft)?(fg?"Botched FG":"Botched punt"):fg?"Fake FG":"Fake punt")}
    var rv=reviewNote(raw,L.T); if(rv)n.push(rv);
    return n.join(" · ");
  }
  /* Callout text for any play (used for the newest play, and for each play in a replay). */
  function calloutOf(cp,row,only){
    var st0=cp.start||{}, c0=clockText(cp), ty0=((cp.type||{}).text||"");
    var conv=/extra point|two.?point|2pt|conversion/i.test(ty0)&&!/touchdown/i.test(ty0);
    var head=aliasCodes(conv?"Conversion"+(c0.clk?"  ("+c0.q+" "+c0.clk+")":""):[(st0.down>0?st0.shortDownDistanceText:""),st0.possessionText||""].filter(Boolean).join(" · ")+(c0.clk?"  ("+c0.q+" "+c0.clk+")":""));
    var txt=condense(only||cp.text,cp), hls=[];
    function mark(re,kind){var m;re.lastIndex=0;while((m=re.exec(txt))){var t=m[0].replace(/ /g," ");txt=txt.slice(0,m.index)+t+txt.slice(m.index+m[0].length);hls.push({t:t,k:kind});re.lastIndex=m.index+t.length}}
    mark(/\bfor (?:a loss of )?[−-]?\d+ yds?(?![a-z])|\bfor no gain\b|\bincomplete\b|[−]?\d+ yd return\b|\bno return\b/gi,"yd");
    mark(/\bINTERCEPTED\b|\bintercepted\b|\bField goal (?:NO GOOD|BLOCKED)\b|\bPunt BLOCKED\b/g,"to");
    /* Fumbles and muffs: red only when the other team got the ball. */
    (function(){var re=/\b(?:FUMBLE|MUFFED), (?:([A-Z]{2,4}) recovers|recovered)\b/g,mm,found=[];while((mm=re.exec(txt)))found.push(mm);
      found.forEach(function(x){mark(new RegExp(x[0].replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"),x[1]&&!isOff(x[1])?"to":"fum")})})();
    mark(/\bPAT missed\b|\b2-pt failed\b|\b(?:INT|TD|Fumble) wiped out\b/g,"fum");
    mark(/\bSAFETY\b/g,"to");   /* points against the offence */
    mark(/\bTOUCHDOWN\b|\bField goal GOOD\b|\bPAT good\b|\b2-pt good\b|\bDefensive 2-pt\b/g,"sc");
    mark(/^Penalty [A-Z]{2,4}/g,"yd");
    var parts=txt.split("\n"), l1="", l2="";
    if(parts.length>1){l1=fitLine(parts[0]);l2=fitLine(parts.slice(1).join(" · "))}
    else if(txt.length<=LINE)l1=txt;
    else{var words=txt.split(" ");while(words.length&&(l1+" "+words[0]).trim().length<=LINE)l1=(l1+" "+words.shift()).trim();l2=fitLine(words.join(" "))}
    /* Replay: a pre-snap head, and the play's setup without its result ("T.Lawrence pass deep left to P.Washington…"). */
    var rhead=st0.down>0&&!conv?head:((isKick(cp)?(/punt/i.test(ty0+" "+cp.text)?"Punt":"Kickoff"):conv?"Conversion":/extra point|two-point/i.test(ty0)?"Conversion":ty0)+(conv?(c0.clk?"  ("+c0.q+" "+c0.clk+")":""):head)).trim().replace(/\s+\(/,"  (");
    var pre=tidy(only||cp.text).replace(/\s+incomplete\b/i,"").replace(/\bintended for\b/,"to");
    var cut=pre.search(/\s(?:for (?:a loss of )?-?\d+ yards?|for no gain|pushed ob|ran ob|out of bounds|to (?:[A-Z]{2,4} -?\d+|50)\b|INTERCEPTED|FUMBLE|MUFFED|sacked|is GOOD|is No Good|is BLOCKED|onside|-?\d+ yards? (?:from|to)\b|Safety\b|Defensive PAT)|\.?\s?PENALTY|,?\s?TOUCHDOWN|\s(?:PAT|2-pt)\b/);
    if(cut>=0)pre=pre.slice(0,cut);
    pre=aliasCodes(pre.replace(/^PAT\b.*/,"Extra point").replace(/^2-pt\b.*/,"Two-point try").replace(/[\s.,;]+$/,""));
    var p1="", p2="", pw=pre.split(" ").filter(Boolean);
    while(pw.length&&(p1+" "+pw[0]).trim().length<=LINE-1)p1=(p1+" "+pw.shift()).trim();
    if(pw.length)p2=fitLine(pw.join(" "),LINE-1).replace(/…$/,"");
    if(p2)p2+="…";else if(p1)p1+="…";
    var note=noteOf(cp), fake=/Fake|Botched/.test(note)?note.split(" · ")[0]:"";
    return {head:head,l1:l1,l2:l2,hls:hls,row:row,rhead:rhead,pre:{l1:p1,l2:p2},note:note,preNote:fake,badges:badgesFor([l1,l2,p1,p2],PLAYERS,TC)};
  }
  /* Where each play started, for the replay's line of scrimmage and line to gain. */
  L.rows.forEach(function(r,i){
    var row=rows[i]; if(!row)return;
    row.los=row.fs; row.ltg=null;
    var st=(r.p||{}).start||{};
    if(r.addOn&&i>0)row.ltg=rows[i-1].ltg;
    else if(r.kind==="play"&&!r.place&&st.down>0&&+st.distance&&r.s+(+st.distance)<100)row.ltg=+F(r.s+(+st.distance)).toFixed(2);
    /* A kick (or a lost fumble) that has another row after it: its own result text stops before what follows. */
    var nx=L.rows[i+1], more=nx&&nx.p===r.p, ct0=cleanText(ftext(r.p&&r.p.text));
    var partOnly=!more?"":r.blocked?ct0.replace(/,?\s*recovered by .*$/i,"").replace(/\.\s+\S+ (?:to|for) .*$/,"."):r.kind==="kick"?(ct0.match(/^.*?\.(?=\s|$)/)||[""])[0]:r.fumble?ct0.split(/\.?\s+FUMBLES\b/)[0]+".":"";
    if(r.p&&((r.kind==="play"&&!r.place)||i===0||L.rows[i-1].p!==r.p))row.callout=calloutOf(r.p,i,partOnly||undefined);
    else if(i>0&&r.p&&L.rows[i-1].p===r.p&&(L.rows[i-1].kind==="kick"||L.rows[i-1].blocked||L.rows[i-1].fumble)){var kc=rows[i-1].callout;row.callout=calloutOf(r.p,i);row.callout.pre={l1:kc.l1,l2:kc.l2};row.callout.rhead=kc.rhead}
    else if(i>0&&rows[i-1].callout){var pc=rows[i-1].callout;row.callout=Object.assign({},pc,{row:i,pre:{l1:pc.l1,l2:pc.l2}})}
  });
  var last=L.rows[n-1], callout=last&&last.p?calloutOf(last.p,n-1):null;
  var narrow=window.innerWidth<=700, cw=narrow?Math.max(300,document.documentElement.clientWidth||window.innerWidth):Math.max(300,($("drives").clientWidth||360)-26), dpr=Math.min(3,Math.max(2,window.devicePixelRatio||2));
  /* Drive start: where the offense's first snap was; after a touchback, label it so and connect it to the end zone. */
  var first=null, tbRow=null;
  L.rows.forEach(function(r,i){if(!first&&r.kind==="play")first=r;if(tbRow==null&&r.kind==="kick"&&/touchback/i.test(r.text||""))tbRow=i});
  var start=first?{f:+F(first.s).toFixed(2),color:offCol,dir:odir,label:tbRow!=null?"Touchback":"Drive start",tb:tbRow!=null?{row:tbRow,from:rows[tbRow].fe}:null}:null;
  var spec={away:tm(T.away),home:tm(T.home),rows:rows,los:null,ltg:ltg,callout:callout,start:start,width:Math.round(cw*dpr),height:Math.round(cw*0.56*dpr)};
  if(LANEMODE)spec.laneMode=LANEMODE;
  if(specOnly)return spec;
  /* While the drive is still going (and it's the live drive, not one tapped from the list), keep
     earlier plays dimmed like the animation does; the latest play stays in full colour. */
  if(!L.done&&!S.chartDrive&&S.state==="in"&&n>1){var lp=L.rows[n-1].p,k0=n-1;while(k0>0&&L.rows[k0-1].p===lp)k0--;if(k0>0)spec.dimFrom=k0}
  var url="", use3d=TEST3D&&window.Chart3D&&window.THREE&&!S.no3d;
  if(use3d){try{url=window.Chart3D.render(spec);S.engine="3d"}catch(e){console.log("3D render failed, using the flat chart",e);S.no3d=true;use3d=false}}
  if(!use3d){try{url=window.Chart2D.render(spec);S.engine="2d"}catch(e){console.log("2D render failed",e);S.engine=null;return ""}}
  S.spec3d=spec;
  return DriveCard.html(L,url,"c3d");
}


/* Player badges: each player's jersey number on a plate in his team's colour, so the same player is
   easy to spot again. Numbers come from the game's box score, with the team roster as a fallback.
   Only names already in the shown play text get a badge, so nothing runs ahead of the delay. */
var ROSTER={};   /* team id -> {key: jersey} from the team roster (fetched once per session) */
function nameKey(n){return String(n||"").toLowerCase().replace(/[^a-z]/g,"")}
function rosterLoad(id){
  if(!id||ROSTER[id])return; ROSTER[id]={};
  getJSON(API+"/teams/"+id+"/roster").then(function(x){
    var m={}, add=function(a){if(a&&a.jersey&&(a.shortName||a.displayName)){var k=nameKey(a.shortName||a.displayName);m[k]=m[k]&&m[k]!==a.jersey?"?":a.jersey}};
    (x.athletes||[]).forEach(function(g){if(g&&g.items)g.items.forEach(add);else add(g)});
    ROSTER[id]=m; if(S.view==="game"){S.keys.drives=null;render()}
  }).catch(function(){});
}
/* key -> [{team, jersey}] for both teams of a game. */
function playersOf(j,T){
  var out={}, put=function(team,k,jersey){if(!k||!jersey)return;var l=out[k]=out[k]||[];if(!l.some(function(x){return x.team===team&&x.jersey===jersey}))l.push({team:team,jersey:String(jersey)})};
  ((j&&j.boxscore||{}).players||[]).forEach(function(tb){var tid=String((tb.team||{}).id||"");
    (tb.statistics||[]).forEach(function(st){(st.athletes||[]).forEach(function(a){var at=a.athlete||{};put(tid,nameKey(at.shortName||at.displayName),at.jersey)})})});
  [T.away,T.home].forEach(function(t){if(!t)return;rosterLoad(t.id);var m=ROSTER[t.id]||{};Object.keys(m).forEach(function(k){if(m[k]!=="?"&&!out[k])put(t.id,k,m[k])})});
  return out;
}
/* The badges for the names in some lines of text ("M.Stafford", "A.St. Brown"). */
function badgesFor(lines,P,TC){
  var re=/\b[A-Z][a-z]?\.(?:St\. )?[A-Z][A-Za-z'\-]+/g, seen={}, out=[];
  lines.forEach(function(l){var m;re.lastIndex=0;while((m=re.exec(l||""))){var t=m[0];if(seen[t])continue;seen[t]=1;
    var c=P[nameKey(t)];if(!c||c.length!==1)continue;   /* unknown or ambiguous: no badge */
    var tc=TC[c[0].team]||{};out.push({t:t,num:c[0].jersey,bg:tc.bg||"#1b1b1b",ink:tc.ink||"#fff"})}});
  return out;
}
