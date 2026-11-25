/* Delay Booth · State, settings, simulation, polling and broadcast crews. */
"use strict";
var API="https://site.api.espn.com/apis/site/v2/sports/football/nfl";
/* Simulation: add ?sim=1 (optionally &speed=1|2|4|16 and &from=1..4) to replay a finished game as if
   it were live. Plays are released one by one, spaced like the real game (breaks capped at 40 s),
   so the delay, heads-up and live animation behave as in a real game. Stats are hidden (final). */
var SIM=/[?&]sim=1\b/.test(location.search)?{speed:+((location.search.match(/[?&]speed=(\d+)/)||[])[1]||2),from:+((location.search.match(/[?&]from=(\d)/)||[])[1]||1)}:null;
function simView(full){
  if(full){
    var plays=[];
    ((full.drives||{}).previous||[]).concat((full.drives||{}).current?[full.drives.current]:[]).forEach(function(d){(d.plays||[]).forEach(function(p){plays.push(p)})});
    plays.sort(function(a,b){return (+a.sequenceNumber||0)-(+b.sequenceNumber||0)});
    var t=0,pw=null,at={};
    plays.forEach(function(p){var w=Date.parse(p.wallclock);if(pw!=null&&!isNaN(w))t+=Math.max(2500,Math.min(40000,w-pw));if(!isNaN(w))pw=w;at[p.id]=t});
    /* Game clock: SIM.at = each play's time in the real game (ms); first[q] = the first play of quarter q. */
    SIM.at=at; SIM.first={};
    [1,2,3,4,5].forEach(function(q){var s0=plays.filter(function(p){return ((p.period||{}).number||0)>=q})[0];if(s0)SIM.first[q]=at[s0.id]});
    SIM.total=plays.length; SIM.src=full;
    if(SIM.base==null)simStartAt(SIM.from);
  }
  var el=simNow(), src=SIM.src, out=[], n=0;
  ((src.drives||{}).previous||[]).concat((src.drives||{}).current?[src.drives.current]:[]).forEach(function(d){
    var ps=(d.plays||[]).filter(function(p){return SIM.at[p.id]<=el});
    if(ps.length){n+=ps.length;out.push(Object.assign({},d,{plays:ps}))}
  });
  var done=n>=SIM.total, j=Object.assign({},src);
  j.drives={previous:done?out:out.slice(0,-1),current:done?null:out[out.length-1]||null};
  j.header=JSON.parse(JSON.stringify(src.header||{}));
  var c=((j.header.competitions||[])[0]||{});c.status=c.status||{};c.status.type=Object.assign({},c.status.type||{},{state:done?"post":"in"});
  j.boxscore=null;
  return j;
}
/* The simulation's clock runs in game time: base (game ms) at anchor (wall time), times the speed.
   Changing the speed keeps the clock where it is; jumping to a quarter restarts the game view there.
   Both update the address (so a reload keeps them) without reloading the page. */
function simNow(){return SIM.base+(Date.now()-SIM.anchor)*SIM.speed}
function simStartAt(q){var f=SIM.first&&(SIM.first[q]!=null?SIM.first[q]:SIM.first[1]);SIM.base=(f||0)-6000*SIM.speed;SIM.anchor=Date.now()}
function simUrl(){try{history.replaceState(null,"",location.pathname+"?sim=1&speed="+SIM.speed+"&from="+SIM.from+(/[?&]chart=2d\b/.test(location.search)?"&chart=2d":"")+location.hash)}catch(e){}}
function simSetSpeed(v){if(!SIM||v===SIM.speed)return;if(SIM.base!=null){SIM.base=simNow();SIM.anchor=Date.now()}SIM.speed=v;simUrl();simBar()}
function simJump(q){
  if(!SIM)return; SIM.from=q; simUrl(); simBar();
  if(!SIM.src){SIM.base=null;return}
  simStartAt(q);
  if(S.live)endLive(); if(S.replay&&typeof stopReplay==="function")stopReplay();
  S.sum=null;S.seen={};S.estimated={};S.shownAt={};S.synced={};S.loaded=false;S.snaps=[];S.openState={};S.keys={};S.liveDone={};S.lastOk=0;
  if(typeof dongSimJump==="function")dongSimJump();
  poll();
}
/* The 3D drive chart is the default; ?chart=2d forces the flat chart. If 3D can't load, the
   flat chart is used automatically. (The name TEST3D is kept from the test-page days.) */
var TEST3D=!/[?&]chart=2d\b/.test(location.search);
/* Long drives: plays past the far lane slide off the field (the mode the owner chose). */
var LANEMODE="off";
function load(k,d){try{var v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
var S={
  delay:load("db_delay",45), dongMode:load("db_dong","sound"), sounds:load("db_sounds",true), teams:load("db_teams",{}), linger:load("db_linger",1), lead:load("db_lead",5), liveDone:{}, live:null, view:"list", fav:load("db_fav",load("db_team","LAR")||""),
  lagSamples:load("db_lag",[]), statTab:"team", wantWake:load("db_wake",false),
  pick:"", eventId:null, sum:null, sumVer:0, state:"pre",
  seen:{}, estimated:{}, shownAt:{}, synced:{}, loaded:false, lastOk:0, nextPollAt:0, snaps:[], err:"", schedule:[],
  tab:"drives", openState:{}, keys:{}, crews:null
};
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function getJSON(url){return fetch(url,{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})}

/* ---------- polling ----------
   Every play is held back for the full delay from the moment this page first
   receives it, so ESPN's quick corrections land before the play is shown. */
var timer=null;
function poll(){
  clearTimeout(timer);
  if(S.view!=="game"||!S.pick)return;
  var id=S.pick;
  Promise.resolve().then(function(){
    if(id!==S.eventId){S.eventId=id;S.sum=null;S.seen={};S.estimated={};S.shownAt={};S.synced={};S.loaded=false;S.snaps=[];S.openState={};S.keys={}}
    if(SIM&&SIM.src&&SIM.id===id){if(!DG.sim)dongSimSetup(SIM.src);return simView()}
    return getJSON(API+"/summary?event="+id).then(function(j){if(!SIM)return j;SIM.src=null;SIM.id=id;SIM.base=null;return simView(j)});
  }).then(function(j){
    if(id!==S.pick)return;
    var now=Date.now();
    var catchUp=!S.loaded||(S.lastOk&&now-S.lastOk>30000);
    allPlays(j).forEach(function(p){
      if(!p.id||S.seen[p.id])return;
      S.seen[p.id]=now;
      if(catchUp){S.estimated[p.id]=1;return}
      var w=Date.parse(p.wallclock);
      if(!isNaN(w)){var lag=(now-w)/1000;if(lag>=0&&lag<180){S.lagSamples.push(Math.round(lag));if(S.lagSamples.length>25)S.lagSamples.shift();save("db_lag",S.lagSamples)}}
    });
    S.loaded=true; S.sum=j; S.sumVer++; S.err=""; S.lastOk=now;
    S.state=(((hdrComp(j).status||{}).type||{}).state)||"pre";
    if(j.boxscore)S.snaps.push({t:now,box:j.boxscore});
    pruneSnaps();
  }).catch(function(e){
    S.err=(e&&/fetch|network|load/i.test(e.message||""))?"Offline":(e.message||"Feed error");
  }).then(function(){
    if(S.view!=="game"||S.pick!==id)return;
    var wait=S.err?15000:S.state==="in"?(SIM?2500:6000):S.state==="post"?(SIM?5000:120000):60000;
    S.nextPollAt=Date.now()+wait;
    timer=setTimeout(poll,wait);
    render();
  });
}
/* Broadcast crews, refreshed every few hours by a GitHub job from 506sports.com. */
function loadCrews(){
  fetch("../crews.json?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null})
    .then(function(c){if(c){S.crews=c;S.keys.info=null;render()}}).catch(function(){});
}
function crewFor(j,T){
  if(!S.crews||!T.away||!T.home)return null;
  var h=j.header||{}, wk=(h.week!=null?+h.week:null), yr=((h.season||{}).year!=null?+h.season.year:null);
  var m=(S.crews.games||[]).filter(function(g){
    var teams=(g.away===T.away.ab&&g.home===T.home.ab)||(g.away===T.home.ab&&g.home===T.away.ab);
    return teams&&(wk==null||!g.week||g.week===wk)&&(yr==null||!g.season||g.season===yr);
  });
  return m[0]||null;
}
function pruneSnaps(){
  var cut=Date.now()-S.delay*1000-60000, s=S.snaps, i=0;
  while(i<s.length-1&&s[i+1].t<cut)i++;
  if(i>0)S.snaps=s.slice(i);
}
function lagEst(){
  var a=S.lagSamples.slice().sort(function(x,y){return x-y});
  return a.length?a[Math.floor(a.length/2)]:20;
}

