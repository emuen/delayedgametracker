/* Delay Booth · Other games: the dock (ticker), holding alerts, score cards, scoring-drive overlay, sounds (dong, doink, sack shout). */
"use strict";
/* ---------- Other games: the dock (ticker) and score alerts ("dong") ----------
   One clock: everything about other games is shown at your delay.
   Live: the week's scoreboard is read every 15 s and each response is kept with the time it arrived.
   The dock shows the newest one that is at least your delay old (it never goes backwards), and a
   score alert becomes due when the scoreboard that first showed it is that old. So changing the delay
   re-times both. Simulation: the other games in the same window are replayed alongside the simulated
   one, by game clock.
   Alerts only come for followed games (Settings › Teams). They wait while your game has a big moment
   coming up or playing: a 3rd or 4th down, a turnover, a gain of 20+ yards or a touchdown. Those plays
   are already in the page (held back for the delay), so the page knows they're coming. Waiting alerts
   come out together at the next quiet moment, as one card with one chime.
   Tapping an alert replays the scoring drive (for a defensive score, the drive of the team that
   had the ball, which is where ESPN files that play). */
var DG={scores:null,seen:{},queue:[],pending:[],heldSince:0,hot:0,snaps:[],seq:0,dispSeq:-1,simCur:0,sums:{},first:{},flash:{},card:null,cardItems:[],audio:null,sim:null,view:null,log:[]};
var MAXHOLD=150000;   /* an alert never waits more than 2.5 min (but never pops up during a big play) */
var DIVS=[["AFC East",["BUF","MIA","NE","NYJ"]],["AFC North",["BAL","CIN","CLE","PIT"]],["AFC South",["HOU","IND","JAX","TEN"]],["AFC West",["DEN","KC","LV","LAC"]],
  ["NFC East",["DAL","NYG","PHI","WSH"]],["NFC North",["CHI","DET","GB","MIN"]],["NFC South",["ATL","CAR","NO","TB"]],["NFC West",["ARI","LAR","SF","SEA"]]];
/* Teams: "f" follow (default), "n" not interested (ticker, no alerts), "x" no spoilers (hidden). */
function teamPref(ab){return S.teams[ab2(ab)]||"f"}
function gamePref(a,b){var x=teamPref(a),y=teamPref(b);return x==="x"||y==="x"?"x":x==="f"||y==="f"?"f":"n"}
function gamePrefOf(j){var T=teamsOf(j);return gamePref(T.away?T.away.ab:"",T.home?T.home.ab:"")}
function isScore(p){var ty=((p.type||{}).text||"");return !!p.scoringPlay&&!/extra point|two.?point|2pt|conversion/i.test(ty)}
/* Who scored: the team whose score went up on this play (works for pick-sixes, kick returns,
   own-fumble recoveries in the end zone and safeties alike). */
function scorerOf(j,p){
  var T=teamsOf(j), plays=allPlays(j), k=plays.indexOf(p), h=+p.homeScore||0, a=+p.awayScore||0, ph=0, pa=0;
  for(var i=k-1;i>=0;i--){if(plays[i].homeScore!=null){ph=+plays[i].homeScore||0;pa=+plays[i].awayScore||0;break}}
  return h-ph>a-pa?T.home:a-pa>h-ph?T.away:null;
}
function scoreKind(p,scorer){var ty=((p.type||{}).text||""), off=teamIdOf(p.start);
  if(/safety/i.test(ty))return "SAFETY"; if(/field goal/i.test(ty))return "FG";
  return scorer&&off&&scorer.id!==off&&/interception|fumble|blocked/i.test(ty)?"DEF TD":"TD"}
function gameSecs(p){var per=((p.period||{}).number)||0,m=String(((p.clock||{}).displayValue)||"").match(/^(\d+):(\d+)$/);return per?(per-1)*900+(m?900-(+m[1]*60+(+m[2])):0):0}
function scoreTotal(p){return (+p.homeScore||0)+(+p.awayScore||0)}
function dongEnqueue(j,p,o){
  if(DG.seen[p.id])return; DG.seen[p.id]=1;
  DG.queue.push({j:j,p:p,gid:o.gid,seenAt:o.seenAt,gs:o.gs});
}
/* Due when your stream reaches it: live, your delay after the page first saw the score (so a changed
   delay moves it); simulated, when your game's clock reaches the scoring play. */
function isDue(it,now){return it.gs!=null?it.gs<=DG.simCur:it.seenAt+S.delay*1000<=now}
/* The NFL's day (US Eastern), so a Sunday's early, late and night games are one slate. */
function etDay(d){var x=new Date(d);if(isNaN(x))return "";try{return x.toLocaleDateString("en-CA",{timeZone:"America/New_York"})}catch(e){return x.toDateString()}}

/* One game from a scoreboard event. competitions[0].situation (possession, isRedZone, down and
   distance, lastPlay) is read where it's there; nothing breaks if it isn't. */
function sbGame(e){
  var c=evComp(e), cs=c.competitors||[], st=c.status||e.status||{}, ty=st.type||{};
  var h=cs.filter(function(x){return x.homeAway==="home"})[0]||cs[0], a=cs.filter(function(x){return x.homeAway==="away"})[0]||cs[1];
  function tm(x){var t=(x&&x.team)||{}, sc=x&&x.score!=null&&x.score!==""?(typeof x.score==="object"?x.score.value:x.score):null;
    return {id:String(t.id||(x&&x.id)||""),ab:ab2(t.abbreviation||"?"),nm:t.shortDisplayName||t.name||t.abbreviation||"",score:sc==null?null:(+sc||0),team:t}}
  var G={id:String(e.id),date:e.date||c.date,state:ty.state||"pre",period:+st.period||0,clock:st.displayClock||"",detail:ty.shortDetail||ty.detail||"",name:ty.name||"",a:tm(a),h:tm(h)};
  var sit=c.situation;
  if(sit&&G.state==="in"){
    var lp=sit.lastPlay||{}, lty=((lp.type||{}).text||"");
    G.pos=sit.possession!=null?String(typeof sit.possession==="object"?sit.possession.id:sit.possession):null;
    G.rz=!!sit.isRedZone; G.dd=sit.shortDownDistanceText||sit.downDistanceText||"";
    G.to=/interception/i.test(lty)?"INT":/fumble recovery \(opponent\)|opp fumble|fumble return/i.test(lty)?"FUM":"";
  }
  return G;
}
/* Simulation: the scoreboard's other games that day; those in the same window are replayed from
   their summaries by game clock, earlier ones are final, later ones still to come. */
function dongSimSetup(j){
  if(DG.sim)return; DG.sim={games:[],events:[],by:{},ready:false};
  var h=j.header||{}, wk=h.week, yr=(h.season||{}).year, ty=(h.season||{}).type, kick=Date.parse(hdrComp(j).date||""), day=etDay(hdrComp(j).date), ids=[];
  if(!wk||!yr)return;
  getJSON(API+"/scoreboard?dates="+yr+"&seasontype="+(ty||2)+"&week="+wk).then(function(sb){
    var evs=(sb.events||[]).filter(function(e){return String(e.id)!==String(S.pick)&&etDay(e.date)===day});
    DG.sim.events=evs;
    ids=evs.filter(function(e){return Math.abs(Date.parse(e.date)-kick)<=75*60000}).map(function(e){return String(e.id)});
    return Promise.all(ids.map(function(id){return getJSON(API+"/summary?event="+id).then(function(g){return g},function(){return null})}));
  }).then(function(gs){
    if(!DG.sim)return;
    (gs||[]).forEach(function(g,i){if(!g)return;var ps=allPlays(g);ps.forEach(function(p){p._gs=gameSecs(p)});DG.sim.by[ids[i]]={id:ids[i],g:g,plays:ps};DG.sim.games.push(g)});
    var cur=dongSimNow();
    Object.keys(DG.sim.by).forEach(function(id){DG.sim.by[id].plays.forEach(function(p){if(isScore(p)&&p._gs<=cur)DG.seen[p.id]=1})});
    DG.sim.ready=true;
  }).catch(function(){});
}
function dongSimNow(){if(!S.sum)return 0;var V=visibleIds(S.sum),p=V.plays[V.last];return p?gameSecs(p):0}
function simGame(e,ent,cur){
  var G=sbGame(e), ps=ent.plays, k=-1;
  for(var i=0;i<ps.length;i++){if(ps[i]._gs<=cur)k=i;else break}
  if(k<0){G.state="pre";G.a.score=G.h.score=null;return G}
  var p=ps[k], done=k===ps.length-1&&(((hdrComp(ent.g).status||{}).type||{}).state==="post"), ty=((p.type||{}).text||"");
  G.state=done?"post":"in"; G.a.score=+p.awayScore||0; G.h.score=+p.homeScore||0;
  G.period=((p.period||{}).number)||0; G.clock=((p.clock||{}).displayValue)||""; G.name=""; G.detail=done?(G.period>4?"Final/OT":"Final"):"";
  if(!done&&/end of half|halftime/i.test(ty))G.name="STATUS_HALFTIME"; else if(!done&&/end period|end of quarter/i.test(ty))G.name="STATUS_END_PERIOD";
  var rp=null; for(var q=k;q>=0;q--){if(!isNonPlay(ps[q])){rp=ps[q];break}}
  if(rp&&!done){
    var en=rp.end||{};
    G.pos=teamIdOf(en)||teamIdOf(rp.start);
    G.rz=!rp.scoringPlay&&en.down>0&&en.yardsToEndzone!=null&&en.yardsToEndzone<=20;
    G.dd=en.shortDownDistanceText||en.downDistanceText||"";
    if(rp.isTurnover)G.to=/intercept/i.test(((rp.type||{}).text||"")+" "+(rp.text||""))?"INT":"FUM";
  }
  return G;
}
function simGames(cur){
  var kick=Date.parse(hdrComp(S.sum||{}).date||"");
  return DG.sim.events.map(function(e){
    var ent=DG.sim.by[String(e.id)]; if(ent)return simGame(e,ent,cur);
    var G=sbGame(e);
    if(Date.parse(e.date)<kick){G.state="post";G.detail=G.detail&&/final/i.test(G.detail)?G.detail:"Final"}else{G.state="pre";G.a.score=G.h.score=null}
    return G;
  });
}
function dongSimTick(){
  if(!SIM||!DG.sim||!DG.sim.ready||S.view!=="game")return;
  var cur=DG.simCur;
  Object.keys(DG.sim.by).forEach(function(id){var ent=DG.sim.by[id];ent.plays.forEach(function(p){if(isScore(p)&&p._gs<=cur)dongEnqueue(ent.g,p,{gs:p._gs,gid:id})})});
}
/* Live: keep every scoreboard with the time it arrived. When a game's score goes up, look up the
   scoring play right away; its alert is due your delay after that moment. */
function dongPollLive(){
  if(S.view!=="game"||SIM||S.dongMode==="off")return;
  getJSON(API+"/scoreboard").then(function(sb){
    if(S.view!=="game")return;
    var now=Date.now(), games=(sb.events||[]).map(sbGame);
    DG.snaps.push({t:now,seq:++DG.seq,games:games});
    var cut=now-900000-120000, i=0; while(i<DG.snaps.length-1&&DG.snaps[i+1].t<cut&&DG.snaps[i+1].seq<=DG.dispSeq)i++;
    if(i>0)DG.snaps=DG.snaps.slice(i);
    var first=!DG.scores; DG.scores=DG.scores||{};
    games.forEach(function(G){
      var tot=(G.a.score||0)+(G.h.score||0), prev=DG.scores[G.id];
      if(first||prev==null||G.id===String(S.pick)||tot<prev){DG.scores[G.id]=tot;DG.first[G.id]=0;return}
      if(tot===prev)return;
      if(!DG.first[G.id])DG.first[G.id]=now;
      var seenAt=DG.first[G.id];
      getJSON(API+"/summary?event="+G.id).then(function(j){
        DG.sums[G.id]=j; var found=false;
        allPlays(j).forEach(function(p){var t=scoreTotal(p);if(isScore(p)&&t>prev&&t<=tot){found=true;dongEnqueue(j,p,{seenAt:seenAt,gid:G.id})}});
        /* ESPN's play list can lag the scoreboard a little: try again on the next check, for up to a minute. */
        if((found||Date.now()-seenAt>60000)&&DG.scores[G.id]===prev){DG.scores[G.id]=tot;DG.first[G.id]=0}
      }).catch(function(){});
    });
  }).catch(function(){});
}
/* The other games as your stream would show them now. */
function dispGames(now){
  if(SIM){if(!DG.sim||!DG.sim.ready||!S.sum)return null;return {games:simGames(DG.simCur)}}
  if(!DG.snaps.length)return null;
  var cut=now-S.delay*1000, cur=null;
  for(var i=DG.snaps.length-1;i>=0;i--){if(DG.snaps[i].t<=cut){if(DG.snaps[i].seq>DG.dispSeq)DG.dispSeq=DG.snaps[i].seq;break}}
  DG.snaps.forEach(function(sn){if(sn.seq===DG.dispSeq)cur=sn});
  if(cur)return {games:cur.games};
  return {games:DG.snaps[DG.snaps.length-1].games,sync:true};   /* just opened: nothing is old enough yet */
}

/* ---------- holding alerts during big moments in your game ----------
   A big moment is a 3rd or 4th down (not a routine punt), a turnover, a gain of 20+ yards or a touchdown. Such a play is
   "hot" from its heads-up (when the box switches to its down and distance) until its result has been
   up for the hold, plus a short margin. Level 2 is the play itself: nothing is ever released then.
   Level 1 is the margin around it, or any other play animating: alerts wait, unless they've waited
   the maximum. In simulation the margins after the play shrink with the speed. */
function isBig(P){
  if(!P||isNonPlay(P))return false;
  var st=P.start||{}, ty=((P.type||{}).text||""), t=ftext(P.text||"");
  var punt=/punt/i.test(ty)||/\bpunts\b/.test(t), lost=/blocked punt|muffed punt recovery \(opponent\)/i.test(ty)||/punts? is BLOCKED|MUFFS[^.]*recovered by/i.test(t);
  if((st.down===3||st.down===4)&&!punt)return true;   /* a routine punt is not a hot play; a blocked or muffed one is */
  if(lost)return true;
  if(P.isTurnover||/interception|fumble recovery \(opponent\)|fumble return|opp fumble/i.test(ty)||/\bINTERCEPTED\b/.test(t))return true;
  if(/touchdown/i.test(ty)||(P.scoringPlay&&/TOUCHDOWN/.test(t)))return true;
  return !isKick(P)&&typeof P.statYardage==="number"&&P.statYardage>=20;
}
function mainHot(now){
  var V=S.V; if(S.view!=="game"||!S.sum||!V||S.state!=="in")return 0;
  var sp=SIM?SIM.speed:1, d=S.delay*1000, lvl=0, Lv=S.live;
  for(var k=Math.max(0,V.last-3);k<V.plays.length;k++){
    var P=V.plays[k]; if(!isBig(P))continue;
    var tR=playTime(P)+d, tPre, tEnd;
    if(Lv&&Lv.id===P.id){tPre=Lv.tPre;tEnd=Lv.settleAt}
    else{tPre=tR-(S.lead*1000+6000)/sp;tEnd=tR+1800/sp}
    if(now>=tPre&&now<=tEnd)return 2;
    if(now>=tPre-1500&&now<=tEnd+3000/sp)lvl=1;   /* 1.5 s lead-in (alerts are checked once a second) */
  }
  if(Lv&&Lv.attached&&now>=Lv.tSnap-500&&now<=Lv.settleAt)lvl=Math.max(lvl,1);
  return lvl;
}
function dongReset(){DG.queue=[];DG.pending=[];DG.heldSince=0;DG.scores=null;DG.first={};DG.snaps=[];DG.dispSeq=-1;DG.simCur=0;DG.sim=null;DG.log=[];DG.flash={};DG.dockHtml="";cardHide()}
function dongRelease(){var items=DG.pending;DG.pending=[];DG.heldSince=0;if(items.length)cardShow(items)}
function dongTick(){
  if(S.view!=="game"){return}
  var now=Date.now();
  if(SIM&&DG.sim&&DG.sim.ready&&S.sum)DG.simCur=Math.max(DG.simCur||0,dongSimNow());
  dongSimTick();
  DG.hot=mainHot(now);
  if(S.dongMode==="off"||S.dongMode==="ticker"){DG.queue=[];DG.pending=[];DG.heldSince=0}
  else{
    DG.queue=DG.queue.filter(function(it){if(isDue(it,now)){DG.pending.push(it);return false}return true});
    DG.pending=DG.pending.filter(function(it){return gamePrefOf(it.j)==="f"});
    if(!DG.pending.length)DG.heldSince=0;
    else{
      if(!DG.heldSince)DG.heldSince=now;
      var busy=!$("dongView").hidden||!$("sheet").hidden||!$("teamSheet").hidden||document.hidden;
      if(!busy&&(DG.hot===0||(DG.hot<2&&now-DG.heldSince>=MAXHOLD/(SIM?SIM.speed:1))))dongRelease();
    }
  }
  dockRender();
}

/* ---------- the dock ---------- */
var CHIPCOL={};
function chipCol(t){
  var k=t.ab+"|"+(t.team&&t.team.color||"");
  if(!(k in CHIPCOL)){var r=teamStyle({team:{abbreviation:t.ab,color:t.team&&t.team.color,alternateColor:t.team&&t.team.alternateColor}});CHIPCOL[k]=r.rgb?"rgb("+r.rgb.join(",")+")":"var(--line)"}
  return CHIPCOL[k];
}
function kickText(d){var x=new Date(d);return isNaN(x)?"Later":x.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
function statusText(G){
  if(/HALFTIME/.test(G.name)||/^halftime$/i.test(G.detail))return "Half-time";
  var q=G.period>4?"OT":G.period?"Q"+G.period:"";
  if(/END_PERIOD/.test(G.name))return "End of "+q;
  return q?(q+" "+G.clock).trim():G.detail||"Live";
}
function dockGames(D){
  var day=etDay(hdrComp(S.sum||{}).date||Date.now()), main=String(S.pick), rank={"in":0,pre:1,post:2};
  function r(G){return rank[G.state]!=null?rank[G.state]:1}
  return D.games.filter(function(G){return G.id!==main&&gamePref(G.a.ab,G.h.ab)!=="x"&&etDay(G.date)===day})
    .sort(function(x,y){return (r(x)-r(y))||((Date.parse(x.date)||0)-(Date.parse(y.date)||0))||(x.id<y.id?-1:1)});
}
function chipHTML(G,D,now){
  var sync=D.sync&&G.state!=="pre", fl=DG.flash[G.id]&&DG.flash[G.id].until>now?DG.flash[G.id]:null;
  var a=G.a, h=G.h, show=G.state!=="pre"&&!sync&&a.score!=null&&h.score!=null;
  function side(t,sc,other,s){
    var po=G.state==="in"&&!sync&&G.pos&&G.pos===t.id;
    return '<i style="--tc:'+chipCol(t)+'"></i><em'+(po?' class="po"':'')+'>'+esc(t.ab)+'</em>'+
      (show?'<b class="'+(sc>=other?"up":"")+(fl&&fl.side===s?" sc":"")+'">'+sc+'</b>':sync?'<b>–</b>':'');
  }
  var l2, lbl;
  if(sync)l2="Syncing…";
  else if(fl)l2=esc(fl.kind);
  else if(G.state==="pre")l2=esc(kickText(G.date));
  else if(G.state==="post")l2=G.period>4||/OT/.test(G.detail)?"Final/OT":"Final";
  else l2=esc(statusText(G))+(G.rz&&G.pos?'<span class="rz">RZ</span>':'')+(G.to?" · "+G.to:"");
  lbl=(a.nm||a.ab)+(show?" "+a.score:"")+", "+(h.nm||h.ab)+(show?" "+h.score:"")+", "+String(l2).replace(/<[^>]+>/g," ");
  return '<button class="tk'+(G.state==="post"?" done":"")+(fl?" flash":"")+'" data-g="'+esc(G.id)+'" aria-label="'+esc(lbl)+'"><span class="ln">'+side(a,a.score,h.score,"a")+side(h,h.score,a.score,"h")+'</span><small>'+l2+'</small></button>';
}
/* Shown in the game view while other games are live or still to come today (or an alert is up). */
function dockRender(){
  var dock=$("dock"), now=Date.now(), on=S.view==="game"&&S.dongMode!=="off"&&!!S.sum;
  var D=on?dispGames(now):null, list=D?dockGames(D):[];
  var vis=on&&(list.some(function(G){return G.state==="in"||G.state==="pre"})||!!DG.card);
  if(!vis){if(!dock.hidden){dock.hidden=true;document.body.classList.remove("hasdock");cardHide()}return}
  if(dock.hidden){dock.hidden=false;document.body.classList.add("hasdock")}
  dock.classList.toggle("recede",DG.hot>0);
  var html=(DG.pending.length?'<button class="tk wait" data-act="wait" aria-label="'+DG.pending.length+' scores waiting. Show now."><span class="ln">'+DG.pending.length+' waiting</span><small>for a break</small></button>':'')+
    list.map(function(G){return chipHTML(G,D,now)}).join("");
  if(html!==DG.dockHtml){DG.dockHtml=html;$("tkrow").innerHTML=html}
}
$("tkrow").addEventListener("click",function(e){
  var b=e.target.closest(".tk"); if(!b)return;
  var act=b.getAttribute("data-act");
  if(act==="wait"){dongRelease();dockRender();return}
  var gid=b.getAttribute("data-g"); if(gid)dockOpen(gid);
});
/* Tap a chip: that game's latest scoring drive, as far as your stream has got. */
function dockOpen(gid){
  var D=dispGames(Date.now()), G=null; if(D)D.games.forEach(function(x){if(x.id===gid)G=x});
  if(!G)return;
  var title=(G.a.nm||G.a.ab)+" at "+(G.h.nm||G.h.ab), tot=(G.a.score||0)+(G.h.score||0);
  if(G.state==="pre"){dongMsg(title,"Kickoff "+kickText(G.date)+".");return}
  if(D.sync){dongMsg(title,"Lining up with your delay. Try again in a moment.");return}
  if(!tot){dongMsg(title,"No scores yet.");return}
  function open(j,plays){
    var best=null; plays.forEach(function(p){if(isScore(p)&&scoreTotal(p)<=tot&&(!SIM||p._gs<=DG.simCur))best=p});
    if(best)dongOpen({j:j,p:best,gid:gid});else dongMsg(title,"No scores yet.");
  }
  if(SIM){var ent=DG.sim&&DG.sim.by[gid];if(ent)open(ent.g,ent.plays);else dongMsg(title,"No scoring plays to show.");return}
  var j=DG.sums[gid];
  if(j&&allPlays(j).some(function(p){return isScore(p)&&scoreTotal(p)===tot})){open(j,allPlays(j));return}
  dongMsg(title,"Loading…",gid);
  getJSON(API+"/summary?event="+gid).then(function(x){DG.sums[gid]=x;if(!$("dongView").hidden&&DG.msgFor===gid)open(x,allPlays(x))})
    .catch(function(){if(DG.msgFor===gid)dongMsg(title,"Couldn't load this game. Try again.")});
}
/* The "dong": a two-tone chime made by the page itself. */
function dongChime(){
  if(S.dongMode!=="sound")return;
  try{
    var A=DG.audio; if(!A||A.state==="closed")return;
    if(A.resume)A.resume();
    var t=A.currentTime+0.02;
    [[659.25,0],[523.25,0.42]].forEach(function(n){
      var o=A.createOscillator(),g=A.createGain(),o2=A.createOscillator(),g2=A.createGain();
      o.type="sine";o.frequency.value=n[0];o2.type="sine";o2.frequency.value=n[0]*2.01;
      g.gain.setValueAtTime(0.0001,t+n[1]);g.gain.exponentialRampToValueAtTime(0.32,t+n[1]+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t+n[1]+1.3);
      g2.gain.setValueAtTime(0.0001,t+n[1]);g2.gain.exponentialRampToValueAtTime(0.07,t+n[1]+0.01);g2.gain.exponentialRampToValueAtTime(0.0001,t+n[1]+0.6);
      o.connect(g);g.connect(A.destination);o2.connect(g2);g2.connect(A.destination);
      o.start(t+n[1]);o2.start(t+n[1]);o.stop(t+n[1]+1.4);o2.stop(t+n[1]+0.7);
    });
  }catch(e){}
}
/* The "doink": a short metallic clang when a field goal hits an upright in a replay or the live
   animation (the charts call it at the moment of contact). Uses the Sounds switch (not the alert
   setting) and the same tap-unlocked audio as the chime: a few inharmonic partials of a struck metal tube with a fast
   decay, a slight pitch drop, and a click for the hit. */
function doinkSound(){
  if(!S.sounds)return;
  try{
    var A=DG.audio; if(!A||A.state==="closed")return;
    if(A.state==="suspended"&&A.resume){var pr=A.resume();if(pr&&pr.catch)pr.catch(function(){})}
    /* Hollow pipe: low knock, then a struck-tube ring through a comb tuned to the pipe, with a small "do-oink" pitch scoop. */
    var t=A.currentTime+0.01, f0=190, out=A.createGain(); out.gain.value=0.7; out.connect(A.destination);
    var cin=A.createGain(), dl=A.createDelay(0.05), fb=A.createGain(), lp=A.createBiquadFilter();
    dl.delayTime.value=1/f0; fb.gain.value=0.55; lp.type="lowpass"; lp.frequency.value=f0*9;
    cin.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(out); cin.connect(out);
    [[1,0.32,0.9],[2.02,0.14,0.55],[2.76,0.10,0.45],[5.4,0.03,0.2]].forEach(function(q){
      var o=A.createOscillator(), g=A.createGain(), f=f0*q[0];
      o.type="sine";
      o.frequency.setValueAtTime(f*0.92,t); o.frequency.exponentialRampToValueAtTime(f*1.032,t+0.06); o.frequency.exponentialRampToValueAtTime(f,t+0.35);
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(q[1],t+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t+q[2]);
      o.connect(g); g.connect(cin); o.start(t); o.stop(t+q[2]+0.1);
    });
    var n=Math.floor(A.sampleRate*0.06), buf=A.createBuffer(1,n,A.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,4);
    var src=A.createBufferSource(), bp=A.createBiquadFilter(), ng=A.createGain();
    src.buffer=buf; bp.type="bandpass"; bp.frequency.value=f0*2.2; bp.Q.value=4; ng.gain.value=0.9;
    src.connect(bp); bp.connect(ng); ng.connect(cin); src.start(t);
    var s2=A.createBufferSource(), hp=A.createBiquadFilter(), g2=A.createGain();
    s2.buffer=buf; hp.type="highpass"; hp.frequency.value=3000; g2.gain.value=0.05; s2.connect(hp); hp.connect(g2); g2.connect(out); s2.start(t);
  }catch(e){}
}
window.dbDoink=doinkSound;
/* Easter egg: a Colts QB sacked out of the shotgun, live only. The shout is our own recording (gdd.mp3). */
DG.gddBuf=null;
function gddLoad(){
  if(DG.gddBuf||DG.gddLoading||!DG.audio)return; DG.gddLoading=true;
  fetch("../gdd.mp3").then(function(r){return r.arrayBuffer()}).then(function(b){
    return new Promise(function(res,rej){DG.audio.decodeAudioData(b,res,rej)});
  }).then(function(buf){DG.gddBuf=buf}).catch(function(){DG.gddLoading=false});
}
function gddSound(){
  if(!S.sounds)return;
  try{
    var A=DG.audio; if(!A||!DG.gddBuf)return;
    if(A.state==="suspended"&&A.resume){var pr=A.resume();if(pr&&pr.catch)pr.catch(function(){})}
    var s=A.createBufferSource(), g=A.createGain(); s.buffer=DG.gddBuf; g.gain.value=1; s.connect(g); g.connect(A.destination); s.start();
  }catch(e){}
}
/* Phones only allow sound after a tap: the first tap anywhere unlocks the chime. */
document.addEventListener("pointerdown",function(){
  if(DG.audio)return;
  try{var AC=window.AudioContext||window.webkitAudioContext;if(AC){DG.audio=new AC();if(DG.audio.resume)DG.audio.resume();gddLoad()}}catch(e){}
},true);
/* ---------- alert card (grows up out of the dock) ----------
   One line per score: kind and score line; tap a line to watch, ✕ to close. One chime per card. It quietly
   goes after 15 s (20 s for several), paused while you touch it; there's no visible countdown. */
var KINDWORD={TD:"touchdown",FG:"field goal",SAFETY:"safety","DEF TD":"defensive touchdown"};
/* A short detail line: "Z.Gonzalez, 53 yds", "D.Jones to L.Treadwell, 7 yds". */
function scoreDetail(p){
  var t=cleanText(ftext(p.text||"")).replace(/^\s*\((?:No Huddle,?\s*)?(?:Shotgun|No Huddle)\)\s*/i,""), m;
  var NM="([A-Z][a-z]{0,2}\\.\\s?[A-Z][A-Za-z'\\-]+)";
  if((m=t.match(new RegExp(NM+" (\\d+) yard field goal","i"))))return m[1]+", "+ydStr(+m[2]);
  if((m=t.match(new RegExp("INTERCEPTED by "+NM+"(?:.*? for (-?\\d+) yards?)?"))))return "Intercepted by "+m[1]+(m[2]?", "+ydStr(+m[2],"return"):"");
  if((m=t.match(new RegExp("RECOVERED by [A-Z]{2,3}-"+NM))))return "Fumble recovered by "+m[1];
  if((m=t.match(new RegExp(NM+" pass .*?(?:to|intended for) "+NM+" for (-?\\d+) yards?"))))return m[1]+" to "+m[2]+", "+ydStr(+m[3]);
  if((m=t.match(new RegExp("^"+NM+" .*?for (-?\\d+) yards?, TOUCHDOWN"))))return m[1]+", "+ydStr(+m[2]);
  var f=t.split(/\.\s/)[0].replace(/\bfor (-?\d+) yards?\b/g,function(_,n){return "for "+ydStr(+n)}).replace(/\b(\d+) yards?\b/g,function(_,n){return ydStr(+n)});
  return f.length>90?f.slice(0,88).replace(/\s+\S*$/,"")+"…":f;
}
function itemInfo(it){
  var j=it.j,p=it.p,T=teamsOf(j),TC=teamColors(j,T),sc=scorerOf(j,p),kind=scoreKind(p,sc),c=clockText(p);
  return {kind:kind,col:sc&&TC[sc.id],side:sc&&T.home&&sc.id===T.home.id?"h":"a",
    line:(T.away?T.away.ab:"")+" "+(+p.awayScore||0)+"–"+(+p.homeScore||0)+" "+(T.home?T.home.ab:""),
    when:(c.q+" "+c.clk).trim(),who:sc?(sc.nm||sc.ab):"",what:KINDWORD[kind]||"score",detail:scoreDetail(p)};
}
/* ---------- what happened on a scoring drive, in words ----------
   outcome: "Touchdown · 8 plays, 75 yds, 4:12". stars: the drive's biggest contributors with their numbers
   on the drive ("D.Achane · 4 carries, 38 yds, TD"); for a defensive score just the scorer. */
function scoreStory(it){
  var j=it.j, p=it.p, T=teamsOf(j), sc=scorerOf(j,p), kind=scoreKind(p,sc), d=null;
  drivesOf(j).forEach(function(x){if((x.plays||[]).some(function(q){return q.id===p.id}))d=x});
  var plays=d?(d.plays||[]).slice(0,(d.plays||[]).findIndex(function(q){return q.id===p.id})+1):[p];
  var real=plays.filter(function(q){return !isNonPlay(q)&&!isOfficialTO(q)}), NM="([A-Z][a-z]{0,2}\\.\\s?[A-Z][A-Za-z'\\-]+(?: (?:Jr|Sr|II|III)\\.?)?)";
  var off=d&&d.team?(T.byId[String(d.team.id)]||{}):{}, offNm=off.nm||off.ab||"";
  var yds=0; real.forEach(function(q){if(typeof q.statYardage==="number"&&!/kick|punt|field goal|extra point|penalty|timeout/i.test((q.type||{}).text||""))yds+=q.statYardage});
  var st=(d&&d.start)||{}, dt=d&&d.timeElapsed&&d.timeElapsed.displayValue;
  var n=real.filter(function(q){return !/extra point|two.?point|kickoff/i.test((q.type||{}).text||"")}).length;
  var what=kind==="FG"?"Field goal":kind==="SAFETY"?"Safety":kind==="DEF TD"?(/INTERCEPTED/i.test(p.text||"")?"Pick-six":"Fumble return TD"):"Touchdown";
  var outcome=kind==="DEF TD"||kind==="SAFETY"?[what,offNm?"on the "+offNm+" drive":""].filter(Boolean).join(" "):[what,n+" play"+(n===1?"":"s")+", "+ydStr(yds)+(dt?", "+dt:""),st.text?"from "+st.text:""].filter(Boolean).join(" · ");
  var t0=cleanText(ftext(p.text||"")), m, stars=[];
  var tdY=(t0.match(/for (\d+) yards?, TOUCHDOWN/)||[])[1];
  if(kind==="DEF TD"){
    if((m=t0.match(new RegExp("INTERCEPTED by "+NM))))stars.push({n:m[1],s:"INT"+(tdY?", "+ydStr(+tdY,"return"):"")+", TD"});
    else if((m=t0.match(new RegExp("RECOVERED by [A-Z]{2,4}-"+NM))))stars.push({n:m[1],s:"Fumble recovery"+(tdY?", "+ydStr(+tdY,"return"):"")+", TD"});
    return {kind:kind,outcome:outcome,stars:stars};
  }
  /* Kick and punt return touchdowns: the returner is the story, not the drive. */
  if(/kickoff return|punt return/i.test((p.type||{}).text||"")){
    var ret=/punt/i.test((p.type||{}).text||"")?"Punt return TD":"Kickoff return TD";
    var rm=t0.match(new RegExp("\\.\\s*"+NM+"(?: [^.]*?)? for (\\d+) yards?, TOUCHDOWN"))||t0.match(new RegExp(NM+"[^.]*? for (\\d+) yards?, TOUCHDOWN"));
    if(rm)stars.push({n:rm[1],s:ydStr(+rm[2],"return")+", TD"});
    return {kind:kind,outcome:ret,stars:stars};
  }
  if(kind==="SAFETY"){if((m=t0.match(new RegExp("\\(("+NM.slice(1,-1)+")\\)"))))stars.push({n:m[1],s:"Safety"});return {kind:kind,outcome:outcome,stars:stars}}
  var P={};
  function pl(nm){return P[nm]=P[nm]||{n:nm,att:0,cmp:0,py:0,car:0,ry:0,rec:0,cy:0,td:0,fg:0}}
  real.forEach(function(q){
    var t=cleanText(ftext(q.text||"")).replace(/^\s*\([^)]*\)\s*/,""), ty=(q.type||{}).text||"", mm;
    if(/No Play|NULLIFIED/i.test(t)||/kickoff|punt|extra point|two.?point|timeout/i.test(ty))return;
    t=t.split(/\.\s+PENALTY/i)[0];
    var td=/TOUCHDOWN/.test(t);
    if((mm=t.match(new RegExp("^"+NM+" (\\d+) yard field goal is GOOD"))))return void(pl(mm[1]).fg=+mm[2]);
    if((mm=t.match(new RegExp("^"+NM+" pass incomplete"))))return void pl(mm[1]).att++;
    if((mm=t.match(new RegExp("^"+NM+" pass [^.]*?to "+NM+"[^.]*? for (-?\\d+) yards?")))||(mm=t.match(new RegExp("^"+NM+" pass [^.]*?to "+NM+"[^.]*? for (no gain)")))){
      var g=mm[3]==="no gain"?0:+mm[3], a=pl(mm[1]), r=pl(mm[2]); a.att++;a.cmp++;a.py+=g;r.rec++;r.cy+=g;if(td)r.td++;return}
    if(/sacked/i.test(t))return;
    if((mm=t.match(new RegExp("^"+NM+" (?:[a-z][^.]*? )?for (-?\\d+) yards?")))||(mm=t.match(new RegExp("^"+NM+" (?:[a-z][^.]*? )?for (no gain)")))){
      var c=pl(mm[1]); c.car++; c.ry+=mm[2]==="no gain"?0:+mm[2]; if(td)c.td++;}
  });
  var list=Object.keys(P).map(function(k){var x=P[k];x.score=Math.abs(x.py)*0.6+Math.abs(x.ry)+Math.abs(x.cy)+x.td*15+(x.fg?30:0);return x})
    .filter(function(x){return x.score>0}).sort(function(a,b){return b.score-a.score});
  list.slice(0,3).forEach(function(x){
    var bits=[];
    if(x.att)bits.push(x.cmp+"/"+x.att+", "+ydStr(x.py));
    if(x.car)bits.push(x.car+(x.car===1?" carry, ":" carries, ")+ydStr(x.ry));
    if(x.rec)bits.push(x.rec+(x.rec===1?" catch, ":" catches, ")+ydStr(x.cy));
    if(x.td)bits.push("TD");
    if(x.fg)bits.push(x.fg+" yd FG");
    stars.push({n:x.n,s:bits.join(", ")});
  });
  return {kind:kind,outcome:outcome,stars:stars};
}
function cardShow(items){
  var now=Date.now();
  items.forEach(function(it){
    var b=itemInfo(it); if(it.gid)DG.flash[it.gid]={until:now+10000,kind:b.kind,side:b.side};
  });
  var merge=!!DG.card; DG.card={items:(merge?DG.card.items:[]).concat(items),t0:merge?DG.card.t0:now,open:merge?DG.card.open:null,stage:merge?DG.card.stage:0};
  cardDraw(); if(!merge)dongChime();
}
function cardDraw(){
  var el=$("dcard"), C=DG.card; if(!C)return;
  var its=C.items.filter(function(it){return gamePrefOf(it.j)!=="x"}), html, dur;
  if(!its.length){cardHide();return}
  function kst(b){return b.col?' style="--tc:'+b.col.bg+';--tci:'+b.col.ink+'"':''}
  /* Calm by design: one line per score (kind, score line), tap a line to watch, one ✕. No drive details,
     no visible countdown; the card quietly goes after a while. */
  el.style.cssText="";
  var rows=its.map(function(it,k){return {it:it,k:k}}).reverse();
  html=(its.length>1?'<div class="top"><span class="hd">'+its.length+' scores</span><button class="x" data-act="later" aria-label="Close">✕</button></div>':'')+
    '<div class="rows">'+rows.map(function(r,i){var b=itemInfo(r.it);
      var lineH=esc(b.line).replace(new RegExp("^(\\S+ \\d+)"),b.side==="a"?"<b>$1</b>":"$1").replace(new RegExp("(\\d+ \\S+)$"),b.side==="h"?"<b>$1</b>":"$1");
      var open=C.open===r.it;
      return '<button class="row'+(open?' open':'')+'" data-w="'+r.k+'"><span class="kind"'+kst(b)+'>'+esc(b.kind)+'</span><span class="t"><span class="who">'+esc(b.who)+'</span> · <span class="sl">'+lineH+'</span></span><span class="chev">'+(open?'⌄':'›')+'</span></button>'+
        (open?'<div class="story" data-st="'+(C.stage||0)+'">'+storyHTML(r.it,C.stage||0)+'</div>':'')+
        (its.length===1?'<button class="x" data-act="later" aria-label="Close">✕</button>':'')}).join("")+'</div>';
  dur=its.length===1?15:20;
  if(C.open)el.classList.add("hold");
  /* Added to a card that's already up: the countdown carries on (with at least 6 s left), so a busy
     slate can't keep the card up for ever. */
  el.style.setProperty("--dur",dur+"s"); el.style.setProperty("--dl",-Math.max(0,Math.min((Date.now()-C.t0)/1000,dur-6))+"s");
  el.innerHTML=html+'<div class="timer"></div>';
  el.classList.remove("hold"); el.classList.toggle("one",its.length===1); el.hidden=false; DG.cardItems=its; cardFit();
}
/* The card never reaches up over the score bar: if there isn't room, its rows scroll inside it. */
function storyHTML(it,stage){
  var S2=it._story||(it._story=scoreStory(it));
  if(!stage)return '<p class="oc">'+esc(S2.outcome)+'</p>';
  if(!S2.stars.length)return '<p class="oc">'+esc(S2.outcome)+'</p>';
  return '<ul class="stars">'+S2.stars.map(function(x){return '<li><b>'+esc(x.n)+'</b> · '+esc(x.s)+'</li>'}).join("")+'</ul>';
}
function cardFit(){
  var el=$("dcard"), rows=el.querySelector(".rows"); if(el.hidden||!rows)return;
  rows.style.maxHeight=""; rows.style.overflowY="";
  var bar=document.querySelector("#gameView .bar"), lim=window.innerHeight-(bar?bar.offsetHeight:0)-$("tkrow").offsetHeight-24, over=el.offsetHeight-lim;
  if(over>0){rows.style.maxHeight=Math.max(48,rows.offsetHeight-over)+"px";rows.style.overflowY="auto"}
}
window.addEventListener("resize",cardFit);
function cardHide(){DG.card=null;DG.cardItems=[];var el=$("dcard");el.hidden=true;el.innerHTML="";el.classList.remove("hold")}
(function(){
  var el=$("dcard");
  el.addEventListener("animationend",function(e){if(e.animationName==="dctime")cardHide()});
  el.addEventListener("pointerdown",function(){el.classList.add("hold")});
  ["pointerup","pointercancel","pointerleave"].forEach(function(n){el.addEventListener(n,function(){if(!(DG.card&&DG.card.open))el.classList.remove("hold")})});
  el.addEventListener("click",function(e){
    var b=e.target.closest("button"); if(!b)return;
    var its=DG.cardItems||[], w=b.getAttribute("data-w"), act=b.getAttribute("data-act");
    if(act==="later"){clearTimeout(DG.storyT);cardHide();return}
    if(w!=null){
      /* Tap a score: it opens in place. First the drive's outcome for 3 s, then its biggest contributors.
         Tap it again to fold it. The other scores stay; the card waits while one is open. */
      var it=its[+w], C=DG.card; if(!it||!C)return;
      clearTimeout(DG.storyT); it.watched=true;
      if(C.open===it){C.open=null;C.stage=0;el.classList.remove("hold");cardDraw();return}
      C.open=it; C.stage=0; cardDraw();
      DG.storyT=setTimeout(function(){if(DG.card&&DG.card.open===it){DG.card.stage=1;var sx=el.querySelector('.story');if(sx){sx.classList.add('fade');setTimeout(function(){if(DG.card&&DG.card.open===it)cardDraw()},220)}else cardDraw()}},3000);
    }
  });
})();
/* Your game, pinned at the top of the replay and list overlay. */
function bugUpdate(){
  var B=S.bug, el=$("dvBug"); if($("dongView").hidden)return;
  if(!B){el.hidden=true;return}
  var a=+B.ap||0, h=+B.hp||0, known=B.ap!==""&&B.ap!=="–";
  function ab(x,po){return po?'<span class="po">'+esc(x)+'</span>':esc(x)}
  var html='<b><em'+(!known||a>=h?' class="up"':'')+'>'+ab(B.a,B.pos==="a")+' '+esc(B.ap)+'</em>–<em'+(!known||h>=a?' class="up"':'')+'>'+esc(B.hp)+' '+ab(B.h,B.pos==="h")+'</em></b><span>'+esc([B.clk,B.sit].filter(Boolean).join(" · "))+'</span>';
  if(el.innerHTML!==html)el.innerHTML=html; el.hidden=false;
}
function dongMsg(title,msg,gid){
  if(DG.view){try{DG.view.stop()}catch(e){}DG.view=null}
  DG.cur=null; DG.fromList=false; DG.msgFor=gid||null;
  $("dvChart").innerHTML=""; $("dvHint").hidden=true;
  $("dvList").innerHTML='<li class="msg">'+esc(msg)+'</li>'; $("dvList").hidden=false;
  $("dvTitle").textContent=title; $("dvSub").textContent="At your delay"; $("dvClose").textContent="Close";
  $("dongView").hidden=false; cardHide(); bugUpdate();
}
function dongOpen(item,fromList){
  item.watched=true; DG.fromList=!!fromList; $("dvList").hidden=true; $("dvClose").textContent="Close";
  var j=item.j,p=item.p,T=teamsOf(j),plays=allPlays(j),k=plays.indexOf(p);if(k<0)return;
  var ids={};for(var q=0;q<=k;q++)ids[plays[q].id]=1;
  var keep=S.chartDrive;S.chartDrive=null;
  var L=latestDrive(j,T,{ids:ids,plays:plays,last:k});S.chartDrive=keep;
  if(!L)return;
  var E=(S.engine==="3d"&&window.Chart3D&&window.THREE)?window.Chart3D:window.Chart2D;if(!E||!window.DriveCore)return;
  var spec=fieldChart3D(L,true),kind=scoreKind(p,scorerOf(j,p));
  $("dvTitle").textContent=L.offAb+" drive · "+(kind==="FG"?"field goal":kind==="SAFETY"?"safety":kind==="DEF TD"?"defensive touchdown":"touchdown");
  /* Recap as on your own drives: "5 plays, 13 yards, 2:40 · From ARI 35 · Q4 12:15". */
  var d=null; drivesOf(j).forEach(function(x){if((x.plays||[]).some(function(q){return q.id===p.id}))d=x});
  var recap="";
  if(d){
    var n=(d.plays||[]).filter(function(q){return !isNonPlay(q)&&!isOfficialTO(q)}).length, st=d.start||{}, sc=clockText(st);
    var desc=String(d.description||(n+" play"+(n===1?"":"s"))).replace(/(-?\d+) yards?\b/g,function(_,y){return ydStr(+y)});   /* "−10 yds", as everywhere else */
    recap=[desc, st.text?"From "+st.text:"", sc.q?sc.q+" "+sc.clk:""].filter(Boolean).join(" · ");
  }
  var score=(T.away?T.away.ab:"")+" "+(+p.awayScore||0)+"–"+(+p.homeScore||0)+" "+(T.home?T.home.ab:"");
  $("dvSub").innerHTML=(recap?esc(recap)+"<br>":"")+esc(score);
  var holder=$("dvChart");holder.innerHTML="";DG.msgFor=null;$("dongView").hidden=false;$("dvHint").hidden=false;cardHide();bugUpdate();
  DG.cur={E:E,spec:spec,hits:null,focus:null};
  try{DG.view=E.replay(holder,spec,{linger:S.linger,fromLast:true,onDoink:window.dbDoink})}catch(e){console.log("Scoring drive failed",e);dongClose()}
}
/* Tap a lane in the scoring drive: that play is highlighted (the rest dimmed) with its own info box. */
$("dvChart").addEventListener("click",function(ev){
  var C=DG.cur; if(!C||!C.E.hits)return;
  var r=this.getBoundingClientRect(); if(!r.width)return;
  var W=C.spec.width, H=C.spec.height, x=(ev.clientX-r.left)/r.width*W, y=(ev.clientY-r.top)/r.height*H;
  if(!C.hits){try{C.hits=C.E.hits(C.spec)}catch(e){console.log("lane hits failed",e);return}}
  var best=-1, bd=1e9;
  C.hits.forEach(function(h){
    if(!h)return; var ax=h.a[0],ay=h.a[1],bx=h.b[0],by=h.b[1],dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy;
    var t=L2?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/L2)):0, px=ax+t*dx, py=ay+t*dy, dd=Math.hypot(x-px,(y-py)*1.6);
    if(dd<bd){bd=dd;best=h.k}
  });
  if(best<0||bd>H*0.14)return;
  dongFocus(best);
});
function dongFocus(k){
  var C=DG.cur; if(!C)return;
  if(DG.view){try{DG.view.stop()}catch(e){}DG.view=null}
  var row=C.spec.rows[k]||{}, sp=Object.assign({},C.spec,{focus:k,dimFrom:0,callout:row.callout||C.spec.callout,ltg:row.ltg!=null?row.ltg:C.spec.ltg});
  var url; try{url=C.E.render(sp)}catch(e){console.log("focus render failed",e);return}
  if(!url)return;
  C.focus=k;
  $("dvChart").innerHTML='<img alt="Play '+(k+1)+' of the drive" style="display:block;width:100%;border-radius:6px" src="'+url+'">';
}
function dongClose(){DG.cur=null;DG.msgFor=null;if(DG.view){try{DG.view.stop()}catch(e){}DG.view=null}$("dvChart").innerHTML="";$("dvList").hidden=true;$("dongView").hidden=true;DG.fromList=false}
$("dvClose").onclick=dongClose;
$("dongView").addEventListener("click",function(e){if(e.target===this)dongClose()});
setInterval(dongTick,1000);
setInterval(dongPollLive,15000);

