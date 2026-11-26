/* Delay Booth · Reading the ESPN feed: teams, colours, drive results, field positions, kicks, blocks, fumbles, latestDrive(). */
"use strict";
/* ---------- reading the feed ---------- */
function hdrComp(j){return ((j.header||{}).competitions||[])[0]||{}}
function teamsOf(j){
  var out={home:null,away:null,byId:{}};
  (hdrComp(j).competitors||[]).forEach(function(c){
    var tm=c.team||{}, t={id:String(tm.id||c.id),ab:tm.abbreviation||"?",ha:c.homeAway,nm:tm.name||tm.nickname||tm.shortDisplayName||tm.abbreviation||"",loc:tm.location||"",dn:tm.displayName||""};
    out[c.homeAway]=t; out.byId[t.id]=t;
  });
  out.mine=out.away; out.opp=out.home;
  return out;
}
/* Team colours: from the feed, with a fallback table. Picks a shade that stands out
   on the current background, and separates two teams with similar colours. */
var COLORS={ARI:["97233F","FFB612"],ATL:["A71930","000000"],BAL:["241773","9E7C0C"],BUF:["00338D","C60C30"],CAR:["0085CA","101820"],CHI:["0B162A","C83803"],CIN:["FB4F14","000000"],CLE:["311D00","FF3C00"],DAL:["003594","869397"],DEN:["FB4F14","002244"],DET:["0076B6","B0B7BC"],GB:["203731","FFB612"],HOU:["03202F","A71930"],IND:["002C5F","A2AAAD"],JAX:["006778","D7A22A"],KC:["E31837","FFB81C"],LV:["000000","A5ACAF"],LAC:["0080C6","FFC20E"],LAR:["003594","FFA300"],MIA:["008E97","FC4C02"],MIN:["4F2683","FFC62F"],NE:["002244","C60C30"],NO:["D3BC8D","101820"],NYG:["0B2265","A71930"],NYJ:["125740","FFFFFF"],PHI:["004C54","A5ACAF"],PIT:["FFB612","101820"],SF:["AA0000","B3995D"],SEA:["002244","69BE28"],TB:["D50A0A","FF7900"],TEN:["0C2340","4B92DB"],WSH:["5A1414","FFB612"]};
function hexRgb(h){h=String(h||"").replace("#","");if(!/^[0-9a-f]{6}$/i.test(h))return null;return [0,2,4].map(function(i){return parseInt(h.substr(i,2),16)})}
function lum(c){var a=c.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]}
function contrast(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
/* Two colours look alike if they are close as the eye sees them (CIELAB distance under 30). */
function labOf(c){
  var f=function(v){v/=255;return v>0.04045?Math.pow((v+0.055)/1.055,2.4):v/12.92}, r=f(c[0]),g=f(c[1]),b=f(c[2]);
  var x=(r*.4124+g*.3576+b*.1805)/.95047, y=r*.2126+g*.7152+b*.0722, z=(r*.0193+g*.1192+b*.9505)/1.08883;
  var h=function(t){return t>0.008856?Math.cbrt(t):7.787*t+16/116};
  return [116*h(y)-16,500*(h(x)-h(y)),200*(h(y)-h(z))];
}
function near(c,d){var a=labOf(c),b=labOf(d);return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<30}
function teamColors(j,T,badge){
  var dark=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches, surf=dark?[42,48,57]:[255,255,255];
  var raw={};
  (hdrComp(j).competitors||[]).forEach(function(c){var t=c.team||{},ab=t.abbreviation,fb=COLORS[ab]||[];raw[String(t.id)]=[hexRgb(t.color)||hexRgb(fb[0]),hexRgb(t.alternateColor)||hexRgb(fb[1])]});
  function pick(id,avoid){
    var opts=(raw[id]||[]).filter(Boolean), best=null;
    opts.forEach(function(c){if(best)return;if(contrast(c,surf)<1.8)return;if(avoid&&near(c,avoid))return;best=c});
    if(best)return best;
    var ok=opts.filter(function(c){return contrast(c,surf)>=1.8})[0]||null;
    /* Score badges: if the readable colour would look like the other team's, keep the team's own
       colour instead (dark mode gives it a light edge), as long as that one is clearly different. */
    if(badge&&ok&&avoid&&near(ok,avoid)&&opts[0]&&!near(opts[0],avoid)){edge[id]=contrast(opts[0],surf)<1.8;return opts[0]}
    return ok;
  }
  var edge={};
  var out={}, h=T.home&&T.home.id, a=T.away&&T.away.id;
  if(h)out[h]=pick(h); if(a)out[a]=pick(a,out[h]);
  Object.keys(out).forEach(function(k){var c=out[k];if(!c){delete out[k];return}out[k]={bg:"rgb("+c.join(",")+")",ink:lum(c)>0.35?"#111":"#fff",edge:!!edge[k]}});
  return out;
}
function qLabel(n){return n>5?(n-4)+"nd overtime":n===5?"Overtime":["","1st","2nd","3rd","4th"][n]+" quarter"}
function drivesOf(j){
  var d=j.drives||{}, list=(d.previous||[]).slice(), seen={};
  if(d.current)list.push(d.current);
  return list.filter(function(x){var k=x.id;if(k==null)return true;if(seen[k])return false;seen[k]=1;return true});
}
function allPlays(j){
  var out=[],seen={};
  drivesOf(j).forEach(function(d){(d.plays||[]).forEach(function(p){if(p.id&&!seen[p.id]&&!isOfficialTO(p)){seen[p.id]=1;out.push(p)}})});
  out.sort(function(a,b){return (+a.sequenceNumber||0)-(+b.sequenceNumber||0)});
  return out;
}
/* A game as it stood one delay ago, from its play-by-play: the score, quarter, clock and team with the
   ball after the last play that happened at least your delay ago (play time plus ESPN's usual lag).
   Used right after opening, before anything collected is your delay old. EARLY caches it per game. */
var EARLY={};
function delayedState(j){
  var cut=Date.now()-S.delay*1000-lagEst()*1000, best=null;
  allPlays(j).forEach(function(p){var w=Date.parse(p.wallclock);if(!isNaN(w)&&w<=cut&&p.homeScore!=null)best=p});
  if(!best)return null;
  return {a:+best.awayScore||0,h:+best.homeScore||0,period:+((best.period||{}).number)||0,clock:((best.clock||{}).displayValue)||"",pos:ballAfter(best)};
}
/* Usable for 3 min after it was read; asked again after 1 min. */
function earlyOf(id){var E=EARLY[id];return E&&!E.loading&&Date.now()-E.t<180000?E:null}
function fetchEarly(id,done){
  var E=EARLY[id]; if(E&&(E.loading||Date.now()-E.t<60000))return;
  EARLY[id]={loading:1};
  getJSON(API+"/summary?event="+id).then(function(j){
    var d=delayedState(j); if(!d){delete EARLY[id];return}
    d.t=Date.now(); EARLY[id]=d; if(done)done(j);
  }).catch(function(){delete EARLY[id]});
}
/* Finished games: "Final" is only shown once the game ended at least your delay ago. Known-safe games are
   kept (FINALOK, saved) so this is checked once per game: from the game list's saved scoreboards if
   they already show it finished that long ago, otherwise from its play-by-play (last play's time). */
var FINALOK=load("db_finalok",{}), FINALTRY={};
function finalSafe(id){return !!FINALOK[id]}
function checkFinal(id,done){
  if(FINALOK[id]||(FINALTRY[id]&&Date.now()-FINALTRY[id]<60000))return;
  var cut=Date.now()-S.delay*1000;
  function ok(){FINALOK[id]=1;save("db_finalok",FINALOK);if(done)done()}
  if((window.LS&&LS.hist||[]).some(function(x){return x.t<=cut&&x.m[id]&&x.m[id].st==="post"}))return ok();
  FINALTRY[id]=Date.now();
  getJSON(API+"/summary?event="+id).then(function(j){
    var last=0; allPlays(j).forEach(function(p){var w=Date.parse(p.wallclock);if(!isNaN(w)&&w>last)last=w});
    if(last&&last+lagEst()*1000<=Date.now()-S.delay*1000)ok();
  }).catch(function(){});
}
function teamIdOf(s){if(!s||s.team==null)return null;return String(typeof s.team==="object"?s.team.id:s.team)}
function playTime(p){
  var seen=S.seen[p.id]||Date.now();
  if(S.estimated[p.id]){var w=Date.parse(p.wallclock);return isNaN(w)?0:Math.min(seen,w+lagEst()*1000)}
  return seen;
}
function visibleIds(j){
  var now=Date.now(), cut=now-S.delay*1000, plays=allPlays(j), last=-1;
  plays.forEach(function(p,i){if(playTime(p)<=cut)last=i});
  var ids={}; for(var i=0;i<=last;i++){ids[plays[i].id]=1;if(!S.shownAt[plays[i].id])S.shownAt[plays[i].id]=S.loaded&&!S.estimated[plays[i].id]?now:0}
  return {ids:ids,plays:plays,last:last};
}
function clockText(p){
  var per=((p||{}).period||{}).number||0, clk=((p||{}).clock||{}).displayValue||"";
  return {q:per>4?"OT":per?"Q"+per:"",clk:clk};
}
function fmtDelay(s){return s>=60?Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):s+"s"}
function cleanText(t){
  return String(t||"")
    .replace(/^\s*\((?:No Huddle,?\s*)?(?:Shotgun|No Huddle)\)\s*/i,"")
    .replace(/\s*\((?:[A-Z][a-zA-Z]{0,2}\.\s?[A-Za-z'\-]+(?:\s*[;,]\s*)?)+\)(\.?)\s*$/,"$1")
    .trim();
}
/* Drive list text: drop feed bookkeeping (eligible-receiver reports, injury updates). */
function dropNoise(t){
  return String(t||"")
    .replace(/\s*\*\*\s*Injury Update:[^*]*?(?=\s*\*\*|$)/gi,"")
    .replace(/(?:^|\s)(?:(?:[A-Z][\w'-]*\.\s?)+[A-Z][\w'-]*(?:\s(?:Jr|Sr|II|III|IV)\.?)?(?:\s*(?:,|and)\s*)?)+\s+(?:reported|reports|report) in as (?:an )?eligible(?: receiver)?\.\s*/g," ")
    .replace(/\s*\*\*\s*$/,"").trim();
}
var NOYARD=/timeout|end of|two-minute|kickoff|punt|extra point|field goal|coin toss|end period|official/i;
/* Timeouts, quarter breaks and warnings: listed, but not plays. */
/* Team with the ball after a play, for the ticker's yellow dot. None after a score (through the try and
   until the kickoff is caught) or at the end of a quarter, half or game, so it never points at the wrong team. */
function ballAfter(p){
  if(!p)return null;
  var ty=((p.type||{}).text||"");
  if(p.scoringPlay||/touchdown|field goal good|safety|extra point|two-point|2pt|conversion|end of|end period|end quarter|end game|halftime/i.test(ty))return null;
  return teamIdOf(p.end)||teamIdOf(p.start);
}
function isNonPlay(p){var ty=((p.type||{}).text||""),t=p.text||"";return /timeout|end of|end period|end quarter|end game|two-minute|coin toss/i.test(ty)||/^\s*(official\s+)?timeout\b|^\s*end (of )?(quarter|half|game)|^\s*two-minute warning/i.test(t)}
function isOfficialTO(p){return /official timeout|tv timeout/i.test(((p.type||{}).text||"")+" "+(p.text||""))}
/* What ends a drive: score, punt, turnover, missed FG, safety. */
function endOf(p,offAb){
  var ty=((p.type||{}).text||"").toLowerCase(), t=ftext(p.text);
  if(/touchdown/.test(ty)||(p.scoringPlay&&/touchdown/i.test(t))){
    if(/interception/.test(ty)||(/intercepted/i.test(t)&&!/passing|rushing/.test(ty)))return "Pick-six";
    if(/blocked punt/.test(ty)||/punts? is BLOCKED/i.test(t))return "Blocked punt";
    if(/fumble/.test(ty)&&!/passing|rushing/.test(ty))return "Fumble return TD";
    if(/punt return/.test(ty))return "Punt";
    return "Touchdown";
  }
  if(/field goal good/.test(ty)||(p.scoringPlay&&/field goal is good/i.test(t)))return "Field goal";
  if(/blocked field goal/.test(ty)||/field goal is blocked/i.test(t))return "Blocked FG";
  if(/field goal missed|missed field goal/.test(ty)||/field goal is no good/i.test(t))return "Missed FG";
  if(/blocked punt/.test(ty)||/punts? is BLOCKED/i.test(t))return "Blocked punt";
  if(/punt/.test(ty)||/\bpunts\b/.test(t))return "Punt";
  if(/interception/.test(ty)||/\bintercepted\b/i.test(t))return "Interception";
  if(/fumble recovery \(opponent\)|fumble return|muffed punt recovery \(opponent\)/.test(ty))return "Fumble";
  if(/safety/.test(ty))return "Safety";
  var a=teamIdOf(p.start), b=teamIdOf(p.end), st=p.start||{};
  if(st.down===4&&a&&b&&a!==b)return "Downs";
  /* Live, ESPN often still has the offence on the end spot of a failed 4th down for a while: decide from
     the play itself (4th down, short of the line to gain, no score, no accepted penalty, not a kick). */
  if(st.down===4&&!p.scoringPlay&&!/kneels|spiked/i.test(t)&&penaltyKeepsResult(t,offAb)&&!/kick|punt|field goal|timeout|end of|two-minute/.test(ty)){
    var dist=+st.distance||0, gain=/\bincomplete\b/i.test(t)?0:(typeof p.statYardage==="number"?p.statYardage:textGain(t));
    if(dist>0&&gain!=null&&gain<dist)return "Downs";
  }
  return null;
}
/* A penalty on a 4th-down play still leaves a turnover on downs when every accepted foul is either by
   the offence (the defence just declines it) or a dead-ball foul after the play (taunting, unsportsmanlike). */
function penaltyKeepsResult(t,offAb){
  if(!/PENALTY/.test(t))return true;
  if(/\bno play\b/i.test(t))return false;
  var fouls=String(t).split(/PENALTY on /).slice(1);
  return fouls.every(function(f){
    if(/declined|offsetting/i.test(f.split(/\.\s/)[0]))return true;
    var team=aliasCodes((f.match(/^([A-Z]{2,3})-/)||[])[1]||"");
    if(offAb&&team&&team===aliasCodes(offAb))return true;
    return /^[^,]*,\s*(Taunting|Unsportsmanlike Conduct)\b/i.test(f);
  });
}
/* Yards gained, read from the play text when the feed has no number yet ("for 2 yards", "for no gain", "for -3 yards"). */
function textGain(t){
  if(/\bfor no gain\b/i.test(t))return 0;
  var m=String(t).match(/\bfor (-?\d+) yards?\b/i); if(m)return +m[1];
  if(/\bsacked\b/i.test(t)){var s=String(t).match(/\bfor (?:a )?loss of (\d+) yards?\b/i);if(s)return -s[1]}
  return null;
}
/* One table for drive results, whether the label comes from ESPN or from the page itself. */
function resultLabel(x){
  if(!x)return x; var k=String(x).toLowerCase().replace(/\s+/g," ").trim();
  var M={"touchdown":"Touchdown","field goal":"Field goal","fg":"Field goal","missed fg":"Missed FG","fg missed":"Missed FG","missed field goal":"Missed FG",
    "blocked fg":"Blocked FG","blocked fg, downs":"Blocked FG","blocked field goal":"Blocked FG","punt":"Punt","punt touchdown":"Punt","punt return touchdown":"Punt",
    "blocked punt":"Blocked punt","blocked punt, downs":"Blocked punt","blocked punt touchdown":"Blocked punt","interception":"Interception",
    "interception touchdown":"Pick-six","interception td":"Pick-six","pick-six":"Pick-six","fumble":"Fumble","fumble touchdown":"Fumble return TD",
    "fumble return touchdown":"Fumble return TD","fumble td":"Fumble return TD","fumble return td":"Fumble return TD","downs":"Downs","safety":"Safety",
    "end of half":"End of half","end of game":"End of game","end of regulation":"End of game"};
  return M[k]||String(x).charAt(0).toUpperCase()+String(x).slice(1).toLowerCase();
}
/* A drive's state as far as your stream has got. ESPN's own result is used only
   once every play of the drive is showing, so it can't spoil anything. */
function driveState(d,vis,all,cur){
  var isCur=cur&&d.id===cur.id&&S.state!=="post";
  var espnDone=vis.length===all.length&&!isCur, endLabel=null;
  /* The deciding play is the last one that ends a drive; plays wiped out by a penalty don't count. */
  vis.forEach(function(p){if(isNonPlay(p)||isNullified(ftext(p.text)))return;var e=endOf(p,(d.team||{}).abbreviation);if(e)endLabel=e});
  var ended=espnDone||!!endLabel;
  var espnRes=[d.displayResult,d.result].filter(function(r){return r&&!/^\s*(unknown|none|n\/a|-+)\s*$/i.test(r)})[0];
  var label=resultLabel(espnDone?(espnRes||endLabel||"Drive over"):endLabel);
  var scored=espnDone&&d.isScore!=null?!!d.isScore:/^(Touchdown|Field goal)$/.test(label||"");
  return {ended:ended,label:label,scored:scored};
}
/* ESPN's play text sometimes uses the league's older codes. */
var ALIAS={ARZ:"ARI",LA:"LAR",WAS:"WSH",JAC:"JAX",BLT:"BAL",CLV:"CLE",HST:"HOU",OAK:"LV",SD:"LAC",STL:"LAR"};
/* Team codes as the rest of the page writes them (BAL, not BLT). */
function aliasCodes(x){return String(x||"").replace(/\b(ARZ|LA|WAS|JAC|BLT|CLV|HST|OAK|SD|STL)\b(?![.'a-z])/g,function(m){return ALIAS[m]})}
function ab2(a){return ALIAS[a]||a}
/* The one yardage format (drivecore.js): "18 yds", "1 yd", "−5 yd return". */
function ydStr(n,noun){return window.DriveCore&&window.DriveCore.ydStr?window.DriveCore.ydStr(n,noun):Math.round(n)+(noun?" yd "+noun:" yds")}
/* Reviews and challenges: ESPN tells the play twice; only the final ruling counts. */
var REV_RE=/\s*(?:The Replay Official reviewed|((?:[A-Z][a-z]+\s){0,2}(?:[A-Z][a-z]+|49ers)) challenged)[^.]*?(?:,\s*)?and the play was (REVERSED|Upheld|confirmed)\.(?:\s*The ruling on the field (?:stands|was confirmed)\.)?(?:\s*\(Timeout #\d+\.\))?\s*/;
function ftext(t){
  t=String(t||""); var m=REV_RE.exec(t), out=t;
  if(m)out=/REVERSED/.test(m[2])?(t.slice(m.index+m[0].length).trim()||t.slice(0,m.index)):(t.slice(0,m.index)+" "+t.slice(m.index+m[0].length)).trim();
  return shortFmt(out);
}
function reviewNote(t,T){
  var m=REV_RE.exec(t||""); if(!m)return "";
  var r=/REVERSED/.test(m[2])?"reversed":"upheld", ab="";
  if(m[1]&&T){var nm=m[1].trim();[T.home,T.away].forEach(function(x){if(x&&(x.dn===nm||x.loc===nm||(x.nm&&nm.slice(-x.nm.length)===x.nm)||x.ab===nm))ab=x.ab})}
  return m[1]?"challenge"+(ab?" by "+ab:"")+": "+r:"after review: "+r;
}
/* ESPN's short format ("X 9 Yd pass from Y (Z Kick)") turned into the normal play text. */
function shortFmt(t){
  var m, s=String(t||"").trim();
  function tr(x){return !x?"":/Kick\)?$/i.test(x)&&!/fail|block/i.test(x)?" PAT good.":/PAT (?:failed|blocked)|Kick failed/i.test(x)?" PAT missed.":/Conversion Failed|Two-Point.*Failed/i.test(x)?" 2-pt failed.":/Two-Point Conversion/i.test(x)?" 2-pt good.":""}
  if((m=/^(.+?) (\d+) Yd pass from (.+?)(?: \((.+)\))?\.?$/.exec(s)))return m[3]+" pass to "+m[1]+" for "+m[2]+" yards, TOUCHDOWN."+tr(m[4]);
  if((m=/^(.+?) (\d+) Yd Run(?: \((.+)\))?\.?$/.exec(s)))return m[1]+" run for "+m[2]+" yards, TOUCHDOWN."+tr(m[3]);
  if((m=/^(.+?) (\d+) Yd Interception Return(?: \((.+)\))?\.?$/.exec(s)))return "Interception return by "+m[1]+" for "+m[2]+" yards, TOUCHDOWN."+tr(m[3]);
  if((m=/^(.+?) (\d+) Yd Fumble Recovery(?: \((.+)\))?\.?$/.exec(s))&&m[3])return "Fumble recovery by "+m[1]+" for "+m[2]+" yards, TOUCHDOWN."+tr(m[3]);
  if((m=/^(.+?) Pass Complete for (\d+) Yds to (.+?)(?: \3 Fumble (.+?) \d+ Yd Fumble Recovery)?\.?$/.exec(s)))return m[1]+" pass to "+m[3]+" for "+m[2]+" yards."+(m[4]?" "+m[3]+" FUMBLE, "+m[4]+" recovers.":"");
  if((m=/^(.+?) Incomplete Pass, Intended For (.+?)\.?$/.exec(s)))return m[1]+" pass incomplete to "+m[2]+".";
  if((m=/^(.+?) (\d+) Yd Pnlty (.+?) (\d+) Yd Rush\.?$/.exec(s)))return m[3]+" run for "+m[4]+" yards. Flag on "+m[1]+", "+m[2]+" yards.";
  return t;
}
/* A play wiped out by an accepted foul ("No Play", "NULLIFIED"); offsetting fouls are their own case. */
function isOffsetting(t){return /offsetting/i.test(t||"")&&(/\bNo Play\b/i.test(t||"")||(String(t).match(/offsetting/gi)||[]).length>=2)&&!/PENALTY on [^,]+,[^,]+,\s*(?:\d+ yards?|placed at)/.test(String(t).replace(/Penalty on [^.]*offsetting[^.]*\./gi,""))}
function isNullified(t){t=t||"";return (/\bNo Play\b/i.test(t)||/NULLIFIED/.test(t))&&/PENALTY on/i.test(t)||isOffsetting(t)}

/* ---------- field positions ---------- */
function toPos(sit,off,A){
  if(!sit)return null;
  var txt=sit.possessionText||((sit.downDistanceText||"").split(" at ")[1]);
  var x=A?parseSpot(txt,A):null;
  if(x!=null)return x;
  if(sit.yardsToEndzone==null)return null;
  var y=+sit.yardsToEndzone, t=teamIdOf(sit);
  return (!t||t===off)?100-y:y;
}
function sideOf(a,A){
  if(a===A.off)return "o"; if(a===A.def)return "d";
  if(ALIAS[a]){if(ALIAS[a]===A.off)return "o";if(ALIAS[a]===A.def)return "d"}
  var o=A.off.indexOf(a)===0||a.indexOf(A.off)===0, d=A.def.indexOf(a)===0||a.indexOf(A.def)===0;
  return o&&!d?"o":d&&!o?"d":null;
}
function parseSpot(s,A){
  if(!s)return null;
  if(/^\s*(the\s+)?50\b/i.test(s))return 50;
  var m=String(s).match(/\b([A-Z]{2,4})\s+(End Zone|-?\d{1,2})\b/);
  if(!m)return null;
  var side=sideOf(m[1],A); if(!side)return null;
  if(m[2]==="End Zone")return side==="o"?-4:104;
  var n=+m[2]; return side==="o"?n:100-n;
}
function isKick(p){var t=p.text||"",type=((p.type||{}).text||"").toLowerCase();return /punt|kickoff/.test(type)||/\bpunts\b/.test(t)||/\bkicks\b.*\bfrom\b/.test(t)}
var SPOT_="(?:[A-Z]{2,4} -?\\d{1,2}|50)";
/* Plain text for parsing: final ruling only, no tackler names in brackets or parentheses. */
function bare(t){return ftext(t).replace(/\s*\[[^\]]*\]/g,"").replace(/\s*\((?!Aborted)[^)]*\)/g,"")}
/* A ball carrier's legs: "X to SPOT for N yards", then each "Lateral to Y … SPOT for M yards". */
function legsOf(t,A){
  var re=new RegExp("(?:^|\\.\\s+)(Lateral to )?(\\S+)(?: (?:\\S+ ){0,3}?)?(?:(?:to|pushed ob at|ran ob at|out of bounds at) ("+SPOT_+") )?for (-?\\d+) yards?(, TOUCHDOWN)?","g"), m, out=[];
  while((m=re.exec(t))){out.push({lat:!!m[1],who:m[2],at:m[3]?parseSpot(m[3],A):null,yds:+m[4],td:!!m[5]});if(m[5])break}
  return out;
}
/* Kicks: the kick, then (if there is one) the return in the returning team's colour. The kick row
   names how it ended (k.end) when nothing follows. A muff or a fumble the kicking team recovers gets
   a red ring and a lane in the kicking team's colour; a kickoff placed by rule is a flag walk. */
function kickRows(p,off,A,s,e){
  if(!isKick(p))return null;
  var t=bare(p.text), type=((p.type||{}).text||"").toLowerCase();
  if(isNullified(t))return null;   /* wiped out by a foul: drawn as the penalty (latestDrive) */
  var isPunt=/punt/.test(type)||/\bpunts\b/.test(t);
  if(isPunt&&s!=null&&/\bBLOCKED\b/.test(t))return blockRows(p,A,s,e,"kick");
  var fallback=(s!=null||e!=null)?[{s:s!=null?s:e,e:e!=null?e:s,kind:"kick",text:t}]:null;
  var los=isPunt?s:null, land=null, m;
  if(!isPunt&&(m=t.match(/\bfrom\s+([A-Z]{2,4}\s+-?\d{1,2}|50)/)))los=parseSpot(m[1],A);
  if(los==null)return fallback;
  var st=teamIdOf(p.start), kickerOff=st?st===off:(isPunt||los<50), kd=kickerOff?1:-1;
  if((m=t.match(/\b(?:punts|kicks)(?: onside)?\s+(-?\d+)\s+yards?\s+(?:from\s+\S+\s+\S+\s+)?(?:to landing zone )?to\s+(?:the\s+)?([A-Z]{2,4}\s+(?:End Zone|-?\d{1,2})|50)/)))land=parseSpot(m[2],A);
  if(land==null&&(m=t.match(/\b(?:punts|kicks)(?: onside)?\s+(-?\d+)\s+yards?/)))land=los+kd*(+m[1]);
  if(land==null)return fallback;
  var k={s:los,e:land,kind:"kick",text:t,byOff:kickerOff}, rows=[k];
  var cut=t.search(/\.\s+(?=\S)/), head=cut>=0?t.slice(0,cut):t, rest=cut>=0?t.slice(cut+1).trim():"";
  function side(ab){var x=sideOf(ab,A);return x?x==="o":null}
  var kSide=kickerOff;   /* true: the kicking team is the drive's offence */
  /* Placed by rule (kickoff short of the landing zone or out of bounds): a flag walk to the spot. */
  if((m=new RegExp("PENALTY on ([A-Z]{2,4})(?:-\\S+)?, Kickoff (Short of Landing Zone|Out of Bounds), placed at ("+SPOT_+")").exec(t))){
    var pl=parseSpot(m[3],A); k.end=/short/i.test(m[2])?"Short of landing zone":"Out of bounds";
    if(pl!=null)rows.push({s:land,e:pl,kind:"play",forceKind:"pen",place:{team:ab2(m[1]),at:m[3]},text:t,byOff:!kickerOff});
    return rows;
  }
  if(/onside/.test(head)){
    var rec=/RECOVERED by ([A-Z]{2,4})/i.exec(rest), rs=rec?side(rec[1]):!kSide;
    k.onside={team:rec?ab2(rec[1]):null,byKicker:rs===kSide};
    if(k.onside.byKicker){k.ring=true;k.poss="ONSIDE RECOVERED"}
    return rows;
  }
  if(/touchback/i.test(head)){k.end="Touchback";return rows}
  if(/fair catch/i.test(head)){k.end="Fair catch";return rows}
  if(/downed/i.test(head)){k.end="Downed";return rows}
  if(/out of bounds/i.test(head)){k.end="Out of bounds";return rows}
  /* Muff: who got the ball, and any run after it. */
  if((m=new RegExp("^(\\S+) MUFFS catch,?\\s*(?:touched at "+SPOT_+",\\s*)?(?:RECOVERED by ([A-Z]{2,4})-\\S+? at ("+SPOT_+")|and recovers at ("+SPOT_+")|ball out of bounds at ("+SPOT_+"))\\.?\\s*(.*)$","i").exec(rest))){
    var mSide=m[2]?side(m[2]):!kSide, at=parseSpot(m[3]||m[4]||m[5],A);
    k.muff=true; k.end="Muffed";
    if(mSide===kSide){k.ring=true;k.poss=isPunt?"MUFFED PUNT":"MUFFED KICK"}
    var lg=legsOf(m[6],A).filter(function(x){return x.at!=null||x.td});
    if(at!=null&&lg.length){var last=lg[lg.length-1], to=last.td?(mSide?100:0):last.at;
      if(Math.abs(to-at)>=1||last.td){rows.push({s:at,e:to,kind:"ret",text:t,byOff:mSide,retYds:lg.reduce(function(a,x){return a+x.yds},0),poss:k.poss});delete k.poss}}
    return rows;
  }
  /* A return: the legs (laterals included), then a fumble on the return if any. */
  var fm=rest.search(/\bFUMBLES\b/), retTxt=fm>=0?rest.slice(0,fm):rest, legs=legsOf(retTxt,A);
  if(!legs.length){
    if(/for no gain/.test(retTxt))k.end="No return";
    else if(e!=null&&Math.abs(e-land)>0.8&&!/PENALTY/.test(rest))rows.push({s:land,e:e,kind:"ret",text:t,byOff:!kickerOff});
    else k.end="No return";
    return rows;
  }
  var lastL=legs[legs.length-1], retEnd=lastL.td?(kickerOff?0:100):lastL.at!=null?lastL.at:land-kd*legs.reduce(function(a,x){return a+x.yds},0);
  var ret={s:land,e:retEnd,kind:"ret",text:t,byOff:!kickerOff,retYds:legs.reduce(function(a,x){return a+x.yds},0)};
  var lats=[]; legs.forEach(function(x,i){if(x.lat&&i>0&&legs[i-1].at!=null)lats.push(legs[i-1].at)}); if(lats.length)ret.lats=lats;
  rows.push(ret);
  if(fm>=0){
    var fr=new RegExp("^FUMBLES,?\\s*(?:touched at "+SPOT_+",\\s*)?RECOVERED by ([A-Z]{2,4})-\\S+? at ("+SPOT_+")\\.?\\s*(.*)$","i").exec(rest.slice(fm));
    if(fr&&side(fr[1])===kSide){
      ret.ring=true; ret.poss="FUMBLE";
      var at2=parseSpot(fr[2],A), lg2=legsOf(fr[3],A).filter(function(x){return x.at!=null||x.td});
      if(at2!=null&&lg2.length){var l2=lg2[lg2.length-1], to2=l2.td?(kickerOff?100:0):l2.at;
        if(Math.abs(to2-at2)>=1||l2.td){delete ret.poss;rows.push({s:at2,e:to2,kind:"ret",text:t,byOff:kickerOff,retYds:lg2.reduce(function(a,x){return a+x.yds},0),poss:"FUMBLE"})}}
    }
  }
  return rows;
}
/* A blocked field goal or punt: the kick stops just past the line of scrimmage (kind "play" for a
   field goal, "kick" for a punt). If the text tells of a return, a second row runs from the recovery
   spot to where the play ended, for whichever team recovered it (byOff false = the defence, as for
   kick returns). Parsing is defensive: any part may be missing. */
function blockRows(p,A,s,e,kind){
  var t=bare(p.text), SPOT="([A-Z]{2,4} -?\\d{1,2}|50)", m;
  var rows=[{s:s,e:s+1,kind:kind,blocked:true,byOff:true,text:t}];
  var rec=new RegExp("\\brecovered by ([A-Z]{2,4})(?:-[^\\s,]+)?(?: at "+SPOT+")?","i").exec(t);
  var ret=new RegExp("\\.\\s+\\S+ (?:(?:to|pushed ob at|ran ob at) "+SPOT+" )?for (-?\\d+) yards?").exec(t)||new RegExp("\\.\\s+\\S+ (?:to "+SPOT+" )?for no gain").exec(t);
  var td=/\bTOUCHDOWN\b/.test(t), side=rec?sideOf(rec[1],A):null, byOff=side==="o";   /* unknown: the defence, which usually gets a block */
  rows[0].poss=kind==="kick"?"BLOCKED PUNT":"BLOCKED FG";
  if(!ret&&!td)return rows;
  var from=rec&&rec[2]?parseSpot(rec[2],A):null; if(from==null)from=s;
  var to=td?(byOff?100:0):e!=null?e:ret&&ret[1]?parseSpot(ret[1],A):null; if(to==null)to=from;
  /* The return's legs as the text tells them (a fumble on the return may hand it to a teammate). */
  var lg=legsOf(t.slice(rec?rec.index:0),A).filter(function(x){return x.at!=null||x.td});
  if(lg.length&&!td)to=lg[lg.length-1].at;
  if(Math.abs(to-from)>=1||td){
    var r2={s:from,e:to,kind:"ret",byOff:byOff,text:t,poss:rows[0].poss};
    delete rows[0].poss;
    if(lg.length)r2.retYds=lg.reduce(function(a,x){return a+x.yds},0);
    else if(ret&&ret[2]!=null)r2.retYds=Math.abs(+ret[2]);
    rows.push(r2);
  }
  return rows;
}
/* A lost fumble: the offence's arrow stops where the ball came out (red ring); the recovering team's
   return is a second row in its colour. Fumbles the offence keeps, and texts that can't be read,
   return null (drawn as one row, as before). */
function fumbleRows(p,A,s,e){
  var t=bare(p.text); if(isNullified(t)||/INTERCEPTED/.test(t))return null;
  var m=new RegExp("FUMBLES(?: \\(Aborted\\))?(?: at ("+SPOT_+"))?,?\\.?\\s*(?:touched at "+SPOT_+",\\s*)?RECOVERED by ([A-Z]{2,4})-\\S+? at ("+SPOT_+")\\.?\\s*(.*)$","i").exec(t);
  if(!m||sideOf(m[2],A)!=="d")return null;
  var before=t.slice(0,m.index), F=m[1]?parseSpot(m[1],A):null, R=parseSpot(m[3],A), after=m[4];
  if(F==null){var sp=new RegExp("(?:to|at|pushed ob at|ran ob at|out of bounds at) ("+SPOT_+")(?: for (?:-?\\d+ yards?|no gain))?[.,]?\\s*$").exec(before.trim());
    if(sp)F=parseSpot(sp[1],A);
    else if((sp=/for (-?\d+) yards?[.,]?\s*$/.exec(before.trim()))&&s!=null)F=s+(+sp[1]);
    else if(/for no gain[.,]?\s*$/.test(before.trim())&&s!=null)F=s;}
  if(F==null||R==null||s==null)return null;
  var td=/\bTOUCHDOWN\b/.test(after), lg=legsOf(after,A), E=R, yds=null;
  if(td)E=lg.length||R>0?0:R;
  else if(lg.length){var l=lg[lg.length-1];yds=lg.reduce(function(a,x){return a+x.yds},0);E=l.at!=null?l.at:R-yds}
  if(td&&lg.length)yds=lg.reduce(function(a,x){return a+x.yds},0);
  var r1={s:s,e:F,kind:"play",fumble:true,ring:true,text:t,poss:"FUMBLE"}, rows=[r1];
  if(Math.abs(E-R)>=1){delete r1.poss;rows.push({s:R,e:E,kind:"ret",byOff:false,text:t,retYds:yds,poss:"FUMBLE",fumRet:true})}
  else if(td)r1.defTDHere=true;
  return rows;
}
function scoreLabel(p){var t=ftext(p.text)+" "+((p.type||{}).text||"");return /touchdown/i.test(t)?"TD":/field goal/i.test(t)?"FG":/safety/i.test(t)?"SAFETY":/extra point|two-point|conversion/i.test(t)?"PAT":"PTS"}

/* The latest drive you're allowed to see, with chart rows and a one-line summary. */
function latestDrive(j,T,V){
  var drives=drivesOf(j), cur=(j.drives||{}).current, last=null, chosen=null, pick=S.chartDrive||null;
  drives.forEach(function(d){
    var all=(d.plays||[]).filter(function(p){return !isOfficialTO(p)}), vis=all.filter(function(p){return V.ids[p.id]});
    if(!vis.length)return;
    var st=driveState(d,vis,all,cur), e={d:d,vis:vis,done:st.ended,label:st.label};
    last=e; if(pick&&d.id===pick)chosen=e;
  });
  var out=chosen||last;
  if(!out)return null;
  var d=out.d, off=String((d.team||{}).id||"");
  var offAb=(d.team&&d.team.abbreviation)||(T.byId[off]||{}).ab||"";
  var defT=(T.home&&T.home.id===off)?T.away:T.home, defAb=defT?defT.ab:"";
  var A={off:offAb,def:defAb}, rows=[];
  out.vis.forEach(function(p){
    if(isNonPlay(p))return;
    var s=toPos(p.start,off,A), e=toPos(p.end,off,A), ft=ftext(p.text);
    function push(list){list.forEach(function(r,i){r.p=p;r.score=p.scoringPlay&&i===list.length-1?scoreLabel(p):"";rows.push(r)})}
    var kr=kickRows(p,off,A,s,e);
    if(kr){push(kr);return}
    /* Defensive 2-pt return: no spot, so no lane; just its chip and box line. */
    if(/defensive 2pt|defensive pat/i.test(((p.type||{}).text||"")+" "+ft)&&!/TOUCHDOWN/.test(ft)){var d2=s!=null?s:e!=null?e:100;rows.push({s:d2,e:d2,kind:"play",none:true,def2:true,score:"",text:ft,p:p});return}
    if(s==null&&e==null)return;
    if(s==null)s=e; if(e==null)e=s;
    if(/field goal is BLOCKED/i.test(ft)&&!isNullified(ft)){push(blockRows(p,A,s,toPos(p.end,off,A),"play"));return}
    var fr=fumbleRows(p,A,s,e); if(fr){push(fr);return}
    /* ESPN's end spot is sometimes wrong (an 18-yard touchdown pass once ended "at the offense's
       own goal line"). For ordinary offensive plays trust the play itself: an offensive touchdown
       ends at the goal line, and otherwise the end is start + yards gained when the two disagree. */
    var pty=((p.type||{}).text||""), ptx=ft, nul=isNullified(ptx);
    /* A kick wiped out by a foul: drawn as the penalty (the kick is its ghost). */
    if(isKick(p)&&nul){rows.push({s:s,e:e,kind:"play",score:"",text:ptx,p:p,kickNull:true});return}
    var offTD=!nul&&(/passing touchdown|rushing touchdown/i.test(pty)||(p.scoringPlay&&/TOUCHDOWN/.test(ptx)&&!/intercept|fumble|kick|punt|return|safety|blocked/i.test(pty)&&!/INTERCEPTED|FUMBLES/.test(ptx)));
    var plainPlay=!/penalty|intercept|fumble|kick|punt|safety|field goal|extra point|two.?point|timeout|end of|end period/i.test(pty)&&!/\bPENALTY\b|\bFUMBLES\b|\bINTERCEPTED\b|\bLaterals?\b/i.test(ptx);
    if(offTD)e=100;
    else if(plainPlay&&typeof p.statYardage==="number"&&Math.abs(e-(s+p.statYardage))>5)e=s+p.statYardage;
    /* A foul added on after a play that counts (e.g. roughing the passer after a completion): the play
       up to the enforcement spot, then the walk-off as its own flag row, so the yards aren't all the play's. */
    if(!nul&&!offTD&&!isOffsetting(ptx)&&!/\bINTERCEPTED\b|\bFUMBLES\b|\bLaterals?\b/.test(ptx)){
      var am=new RegExp("^(.*?)\\.?\\s*PENALTY on [A-Z]{2,4}(?:-[^,]+)?,\\s*[^,]+,\\s*\\d+ yards?, enforced at ("+SPOT_+")").exec(ptx), asp=am?parseSpot(am[2],A):null;
      if(am&&asp!=null&&Math.abs(asp-s)>=0.5&&Math.abs(e-asp)>=0.5&&(am[3]=(/\bfor (-?\d+) yards?/.exec(am[1])||[])[1])!=null&&(asp-s)*(+am[3])>0&&Math.abs(asp-s)<=Math.abs(+am[3])+1){
        rows.push({s:s,e:asp,kind:"play",score:"",text:am[1].replace(/[\s.]*$/,"."),p:p});
        rows.push({s:asp,e:e,kind:"play",forceKind:"pen",addOn:true,score:p.scoringPlay?scoreLabel(p):"",text:ptx,p:p});
        return;
      }
    }
    var row={s:s,e:e,kind:"play",score:p.scoringPlay&&!nul?scoreLabel(p):"",text:ptx,p:p};
    /* Laterals: where each hand-off happened (the end of the leg before it). */
    if(!nul&&/\bLateral to\b/.test(ptx)){var lg=legsOf(bare(ptx).replace(/^\(.*?\)\s*/,""),A),lats=[];lg.forEach(function(x,i){if(x.lat&&i>0&&lg[i-1].at!=null)lats.push(lg[i-1].at)});if(lats.length)row.lats=lats}
    rows.push(row);
  });
  var own=rows.filter(function(r){return r.kind==="play"});
  var nPlays=out.vis.filter(function(p){return !isKick(p)&&!isNonPlay(p)}).length;
  out.real=out.vis.filter(function(p){return !isNonPlay(p)});
  var yds=own.length?Math.round(own[own.length-1].e-own[0].s):0;
  out.j=j; out.off=off; out.offAb=offAb; out.defAb=defAb; out.A=A; out.rows=rows; out.T=T; out.TC=teamColors(j,T);
  out.summary=out.done?offAb+" "+String(out.label||"drive over").toLowerCase()
    :offAb+" drive · "+nPlays+" play"+(nPlays===1?"":"s")+", "+yds+" yds";
  return out;
}

