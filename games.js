/* Delay Booth · Game list (landing page), routing, controls, settings, teams sheet. */
"use strict";
/* ---------- game list (landing page) ----------
   Scores stay hidden unless you switch them on, so the list can't spoil a game. */
var LS={cal:null, flat:[], cur:null, sel:null, data:null, timer:null, err:"", scores:load("db_scores",false)};
function wkKey(w){return w?w.year+"-"+w.type+"-"+w.week:""}
function buildCal(sb){
  var year=+((sb.season||{}).year)||new Date().getFullYear(), groups=[];
  ((((sb.leagues||[])[0])||{}).calendar||[]).forEach(function(c){
    var type=+c.value; if(!c.entries||type===4)return;
    var es=c.entries.filter(function(e){return !/pro bowl/i.test(e.label||"")}).map(function(e){return {year:year,type:type,week:+e.value,label:e.label,detail:e.detail||"",start:e.startDate,end:e.endDate}});
    if(es.length)groups.push({label:c.label,entries:es});
  });
  LS.cal=groups; LS.flat=[]; groups.forEach(function(g){LS.flat=LS.flat.concat(g.entries)});
}
function calEntry(w){return LS.flat.filter(function(e){return wkKey(e)===wkKey(w)})[0]||null}
function loadWeek(){
  clearTimeout(LS.timer);
  if(S.view!=="list")return;
  var w=LS.sel, url=API+"/scoreboard"+(w?"?dates="+w.year+"&seasontype="+w.type+"&week="+w.week:"");
  var asked=wkKey(w);
  getJSON(url).then(function(sb){
    if(wkKey(LS.sel)!==asked)return;
    if(!LS.cal)buildCal(sb);
    if(!w)LS.cur={year:+sb.season.year,type:+sb.season.type,week:+sb.week.number};
    LS.data=sb; LS.err=""; lsKeep(sb);
  }).catch(function(e){LS.err=/fetch|network|load/i.test(e.message||"")?"Offline · retrying":"Couldn't load games ("+e.message+")"})
  .then(function(){
    if(S.view!=="list")return;
    renderList();
    var live=LS.data&&(LS.data.events||[]).some(function(e){return evState(e)==="in"});
    LS.timer=setTimeout(loadWeek,LS.err?15000:live?30000:120000);
  });
}
function evComp(e){return (e.competitions||[])[0]||{}}
function evState(e){return (((evComp(e).status||e.status||{}).type)||{}).state||"pre"}
function evTeam(e,ha){return (evComp(e).competitors||[]).filter(function(c){return c.homeAway===ha})[0]||null}
function evNets(e){
  var c=evComp(e), out=[];
  (c.broadcasts||[]).forEach(function(b){(b.names||[]).forEach(function(n){if(out.indexOf(n)<0)out.push(n)})});
  (c.geoBroadcasts||[]).forEach(function(b){var n=(b.media||{}).shortName;if(n&&out.indexOf(n)<0)out.push(n)});
  return out;
}
function teamStyle(t,avoid){
  if(!t||!t.team)return {css:"",rgb:null};
  var dark=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches, surf=dark?[24,32,28]:[255,255,255];
  var fb=COLORS[t.team.abbreviation]||[], opts=[hexRgb(t.team.color)||hexRgb(fb[0]),hexRgb(t.team.alternateColor)||hexRgb(fb[1])].filter(Boolean), c=null;
  opts.forEach(function(o){if(c||contrast(o,surf)<1.8)return;if(avoid&&Math.abs(o[0]-avoid[0])+Math.abs(o[1]-avoid[1])+Math.abs(o[2]-avoid[2])<120)return;c=o});
  c=c||opts.filter(function(o){return contrast(o,surf)>=1.8})[0];
  return c?{css:' style="--tc:rgb('+c.join(",")+');--tci:'+(lum(c)>0.35?"#111":"#fff")+'"',rgb:c}:{css:"",rgb:null};
}
/* Win-loss record. With scores hidden, a finished game shows the records from
   before kickoff, so the updated record can't give the result away. */
function recordOf(t,opp,st,hide){
  var r=((t&&t.records)||[]).filter(function(x){return x.type==="total"||x.name==="overall"||x.name==="Overall"})[0]||((t&&t.records)||[])[0];
  if(!r||!r.summary)return "";
  var n=String(r.summary).split("-").map(Number);
  if(n.some(isNaN))return r.summary;
  if(st==="post"&&(hide||!LS.scores)&&opp&&t.score!=null&&opp.score!=null){
    var a=+t.score,b=+opp.score,i=a>b?0:a<b?1:2;
    if(n[i]>0)n[i]--;
  }
  if(n.length>2&&!n[2])n=n.slice(0,2);
  return n.join("-");
}
var NAMES={ARI:"Arizona Cardinals",ATL:"Atlanta Falcons",BAL:"Baltimore Ravens",BUF:"Buffalo Bills",CAR:"Carolina Panthers",CHI:"Chicago Bears",CIN:"Cincinnati Bengals",CLE:"Cleveland Browns",DAL:"Dallas Cowboys",DEN:"Denver Broncos",DET:"Detroit Lions",GB:"Green Bay Packers",HOU:"Houston Texans",IND:"Indianapolis Colts",JAX:"Jacksonville Jaguars",KC:"Kansas City Chiefs",LV:"Las Vegas Raiders",LAC:"Los Angeles Chargers",LAR:"Los Angeles Rams",MIA:"Miami Dolphins",MIN:"Minnesota Vikings",NE:"New England Patriots",NO:"New Orleans Saints",NYG:"New York Giants",NYJ:"New York Jets",PHI:"Philadelphia Eagles",PIT:"Pittsburgh Steelers",SF:"San Francisco 49ers",SEA:"Seattle Seahawks",TB:"Tampa Bay Buccaneers",TEN:"Tennessee Titans",WSH:"Washington Commanders"};
(function(){var f=$("fav");f.innerHTML='<option value="">None</option>'+Object.keys(NAMES).sort(function(a,b){return NAMES[a].localeCompare(NAMES[b])}).map(function(k){return '<option value="'+k+'">'+NAMES[k]+'</option>'}).join("");f.value=S.fav;
  f.onchange=function(){S.fav=f.value;save("db_fav",S.fav);favChip();if(S.view==="list")renderList()}})();
(function(){var l=$("linger");l.value=String(S.linger);if(!l.value){l.value="1"}l.onchange=function(){S.linger=+l.value||1;save("db_linger",S.linger)}})();
(function(){var l=$("lead");l.value=String(S.lead);if(!l.value){l.value="5"}l.onchange=function(){S.lead=+l.value||5;save("db_lead",S.lead)}})();
(function(){var d=$("dongMode");d.value=S.dongMode;if(!d.value)d.value="sound";d.onchange=function(){S.dongMode=d.value;save("db_dong",S.dongMode);if(S.dongMode==="off"||S.dongMode==="ticker"){DG.queue=[];DG.pending=[];cardHide()}dockRender(true)}})();
(function(){var b=$("sounds");b.setAttribute("aria-checked",S.sounds?"true":"false");b.onclick=function(){S.sounds=!S.sounds;save("db_sounds",S.sounds);b.setAttribute("aria-checked",S.sounds?"true":"false")}})();
function favChip(){$("favChip").textContent=S.fav?"★ "+(NAMES[S.fav]||S.fav).split(" ").pop():"★ Pick favourite"}
favChip();
$("favChip").onclick=function(){sheet(true);setTimeout(function(){$("fav").focus()},50)};
/* With "Show scores" on, live scores are shown at your delay: each scoreboard load is kept with the
   time it arrived, and the list shows the newest one that is at least your delay old. Until one is
   that old, live scores stay hidden. Games with a "No spoilers" team never show a score here. */
function lsKeep(sb){
  var key=wkKey(LS.sel)||"cur", now=Date.now(), m={};
  if(LS.histKey!==key){LS.hist=[];LS.histKey=key}
  (sb.events||[]).forEach(function(e){m[e.id]={st:evState(e),a:+((evTeam(e,"away")||{}).score)||0,h:+((evTeam(e,"home")||{}).score)||0}});
  LS.hist.push({t:now,m:m});
  var cut=now-S.delay*1000, i=0; while(i<LS.hist.length-1&&LS.hist[i+1].t<=cut-120000)i++;
  if(i>0)LS.hist=LS.hist.slice(i);
}
function lsView(e){
  var live={st:evState(e),a:+((evTeam(e,"away")||{}).score)||0,h:+((evTeam(e,"home")||{}).score)||0}, H=LS.hist||[];
  if(!H.length){live.sync=live.st==="in";return live}
  var cut=Date.now()-S.delay*1000, pick=null;
  for(var i=H.length-1;i>=0;i--){if(H[i].t<=cut){pick=H[i];break}}
  var v=(pick||H[0]).m[e.id];
  if(!v){live.sync=live.st!=="pre";return live}
  return {st:v.st,a:v.a,h:v.h,sync:!pick&&v.st==="in"};
}
function gameRow(e){
  var dl=lsView(e), st=dl.st, c=evComp(e), a=evTeam(e,"away"), h=evTeam(e,"home");
  function isFav(t){return !!(S.fav&&t&&t.team&&t.team.abbreviation===S.fav)}
  var fav=isFav(a)||isFav(h), nos=a&&h&&a.team&&h.team&&gamePref(a.team.abbreviation,h.team.abbreviation)==="x";
  var hs=teamStyle(h), as=teamStyle(a,hs.rgb), show=LS.scores&&st!=="pre"&&!dl.sync&&!nos;
  var aw=show&&dl.a>dl.h, hw=show&&dl.h>dl.a;
  function tr(t,sty,win,opp,pts){
    var tm=(t&&t.team)||{}, ab=tm.abbreviation||"TBD", nm=tm.shortDisplayName||tm.displayName||tm.name||"To be decided", rec=recordOf(t,opp,evState(e),!show||st!=="post");
    return '<div class="tr'+(win?" win":"")+'"><span class="badge"'+sty+'>'+esc(ab)+'</span><span class="nm">'+esc(nm)+(isFav(t)?'<span class="star" aria-label="Favourite">★</span>':'')+(rec?'<small>'+esc(rec)+'</small>':'')+'</span><span class="sc">'+(show&&t?esc(pts):"")+'</span></div>';
  }
  var nets=evNets(e).slice(0,2).join(", "), meta;
  var tbd=c.timeValid===false||/tbd/i.test((((c.status||{}).type)||{}).detail||"");
  if(st==="in")meta='<span class="livechip">LIVE</span><small>'+esc(nets)+'</small>';
  else if(st==="post")meta='<b>Final</b><small>'+esc(nets)+'</small>';
  else{
    var d=new Date(e.date), det=((((c.status||{}).type)||{}).shortDetail)||"";
    var special=/postponed|canceled|cancelled|delayed|suspended/i.test(det);
    meta='<b>'+(special?esc(det):tbd?"TBD":esc(d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})))+'</b><small>'+esc(nets||"")+'</small>';
  }
  var playable=a&&h&&a.team&&h.team&&a.team.abbreviation&&h.team.abbreviation&&!/tbd/i.test(a.team.abbreviation+h.team.abbreviation);
  var inner='<div class="teams">'+tr(a,as.css,aw,h,dl.a)+tr(h,hs.css,hw,a,dl.h)+'</div><div class="gmeta">'+meta+'</div>';
  return playable?'<a class="game'+(st==="post"?" done":"")+(fav?" fav":"")+'" href="#g-'+esc(e.id)+'">'+inner+'</a>':'<div class="game">'+inner+'</div>';
}
function renderList(){
  var w=LS.sel||LS.cur, sel=$("wkSel");
  if(LS.cal&&!sel.options.length){
    sel.innerHTML=LS.cal.map(function(g){return '<optgroup label="'+esc(g.label)+'">'+g.entries.map(function(e){return '<option value="'+wkKey(e)+'">'+esc(e.label)+(LS.cur&&wkKey(e)===wkKey(LS.cur)?" (this week)":"")+'</option>'}).join("")+'</optgroup>'}).join("");
  }
  if(w)sel.value=wkKey(w);
  var i=LS.flat.map(wkKey).indexOf(wkKey(w));
  $("wkPrev").disabled=i<=0; $("wkNext").disabled=i<0||i>=LS.flat.length-1;
  $("showScores").setAttribute("aria-checked",LS.scores?"true":"false");
  var box=$("games");
  if(LS.err&&!LS.data){$("lstatus").textContent=LS.err;LS.html="";box.innerHTML='<div class="empty">'+esc(LS.err)+'</div>';return}
  var sb=LS.data||{}, ev=(sb.events||[]).slice().sort(function(x,y){return Date.parse(x.date)-Date.parse(y.date)});
  var ce=calEntry(w);
  $("lstatus").textContent=LS.err||(ce&&ce.detail?ce.detail:"")||"";
  if(!ev.length){
    LS.html="";
    box.innerHTML='<div class="empty">'+(ce&&ce.type===3?"Matchups and kickoff times for "+esc(ce.label)+" aren't set yet."+(ce.detail?"<br>"+esc(ce.detail):""):"No games this week.")+'</div>';
    return;
  }
  var live=[], done=[], days=[], byDay={};
  ev.forEach(function(e){
    var st=lsView(e).st;
    if(st==="in")return live.push(e);
    if(st==="post")return done.push(e);
    var tbd=evComp(e).timeValid===false, k=tbd?"zz":new Date(e.date).toDateString();
    if(!byDay[k]){byDay[k]=[];days.push(k)}
    byDay[k].push(e);
  });
  var html=[];
  if(live.length)html.push('<h2 class="day live">Live now</h2>'+live.map(gameRow).join(""));
  days.forEach(function(k){
    var label=k==="zz"?"Date to be decided":new Date(byDay[k][0].date).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"short"});
    html.push('<h2 class="day">'+esc(label)+'</h2>'+byDay[k].map(gameRow).join(""));
  });
  if(done.length)html.push('<h2 class="day">Finished</h2>'+done.map(gameRow).join(""));
  var out=html.join(""); if(out!==LS.html||!box.firstChild){LS.html=out;box.innerHTML=out}
}
/* Delayed scores mature over time: refresh the list quietly while it shows scores. */
setInterval(function(){if(S.view==="list"&&LS.scores&&LS.data)renderList()},5000);
$("wkSel").onchange=function(){var e=LS.flat.filter(function(x){return wkKey(x)===$("wkSel").value})[0];if(e)goWeek(e)};
$("wkPrev").onclick=function(){var i=LS.flat.map(wkKey).indexOf(wkKey(LS.sel||LS.cur));if(i>0)goWeek(LS.flat[i-1])};
$("wkNext").onclick=function(){var i=LS.flat.map(wkKey).indexOf(wkKey(LS.sel||LS.cur));if(i>=0&&i<LS.flat.length-1)goWeek(LS.flat[i+1])};
function goWeek(e){location.hash=LS.cur&&wkKey(e)===wkKey(LS.cur)?"":"w-"+wkKey(e)}
$("showScores").onclick=function(){LS.scores=!LS.scores;save("db_scores",LS.scores);renderList()};

/* ---------- routing: #g-<game> opens the tracker, #w-<year>-<type>-<week> a week, nothing = this week ---------- */
var listHash="";
function route(){
  var h=location.hash.replace(/^#/,""), m;
  if((m=h.match(/^g-(\d+)$/))){
    S.view="game"; clearTimeout(LS.timer);
    $("listView").hidden=true; $("gameView").hidden=false;
    $("back").setAttribute("href","#"+listHash);
    var ce=calEntry(LS.sel||LS.cur); $("navWeek").textContent=ce?ce.label:"";
    if(S.pick!==m[1]){S.pick=m[1];S.sum=null;S.keys={};tab("drives");dongReset()}
    if(SIM){
      var base=location.pathname+"?sim=1"+(/[?&]chart=2d\b/.test(location.search)?"&chart=2d":""), sb=$("simbar");
      function lk(sp,fr,txt,on){return '<a href="'+base+"&speed="+sp+"&from="+fr+location.hash+'"'+(on?' class="on"':'')+'>'+txt+'</a>'}
      sb.innerHTML='<b>Simulated live</b><span>Speed '+[1,2,4,16].map(function(v){return lk(v,SIM.from,v+"×",v===SIM.speed)}).join(" ")+'</span><span>Start '+[1,2,3,4].map(function(v){return lk(SIM.speed,v,"Q"+v,v===SIM.from)}).join(" ")+'</span>';
      sb.hidden=false;
      sb.onclick=function(e){var a=e.target.closest("a");if(a){e.preventDefault();location.href=a.getAttribute("href")}};
    }
    window.scrollTo(0,0); render(); poll(); dongPollLive();
    return;
  }
  S.view="list"; clearTimeout(timer); if(S.replay)stopReplay(); if(S.live)endLive(); dongReset(); dongClose(); dockRender();
  $("gameView").hidden=true; $("listView").hidden=false;
  listHash=h;
  var wm=h.match(/^w-(\d{4})-(\d)-(\d{1,2})$/);
  var nsel=wm?{year:+wm[1],type:+wm[2],week:+wm[3]}:null;
  if(wkKey(nsel)!==wkKey(LS.sel)){LS.sel=nsel;LS.data=null;$("games").innerHTML='<div class="empty">Loading games…</div>';LS.html=""}
  renderList(); loadWeek();
}

/* ---------- controls ---------- */
function chips(){var t="Delay "+fmtDelay(S.delay)+(S.wantWake?" · Screen on":"")+" · Settings";$("openSettings").textContent=t;$("openSettings2").textContent=t;$("delayVal").textContent=fmtDelay(S.delay)}
function setDelay(v){S.delay=Math.max(0,Math.min(900,Math.round(v)));save("db_delay",S.delay);S.keys={};chips();render()}
$("m30").onclick=function(){setDelay(S.delay-30)};
$("m5").onclick=function(){setDelay(S.delay-5)};
$("p5").onclick=function(){setDelay(S.delay+5)};
$("p30").onclick=function(){setDelay(S.delay+30)};
function sheet(open){$("sheet").hidden=!open;$("scrim").hidden=!open;if(!open)$("teamSheet").hidden=true;if(open){teamSum();$("sheetDone").focus()}else if(S.view==="list")renderList()}
$("openSettings").onclick=function(){sheet(true)};
$("openSettings2").onclick=function(){sheet(true)};
$("sheetDone").onclick=function(){sheet(false)};
$("scrim").onclick=function(){if(!$("teamSheet").hidden)teamsOpen(false);else sheet(false)};
document.addEventListener("keydown",function(e){if(e.key!=="Escape")return;if(!$("teamSheet").hidden)teamsOpen(false);else if(!$("sheet").hidden)sheet(false)});
/* Teams: tap a team to go Follow → Not interested → No spoilers → Follow. Stored on this phone. */
var TPLABEL={f:"Follow",n:"Not interested",x:"No spoilers"};
function teamSum(){
  var n=0,x=0; Object.keys(NAMES).forEach(function(k){var v=teamPref(k);if(v==="n")n++;else if(v==="x")x++});
  $("teamSum").textContent=!n&&!x?"All teams followed":!n?"All teams followed · "+x+" no spoilers":(32-n-x)+" followed · "+n+" not interested"+(x?" · "+x+" no spoilers":"");
  $("teamReset").hidden=!n&&!x;
}
function teamsDraw(){
  $("teamList").innerHTML=DIVS.map(function(d){
    return '<div class="sect tdiv"><h3>'+esc(d[0])+'</h3><div class="tgrid">'+d[1].map(function(ab){
      var v=teamPref(ab), c=teamStyle({team:{abbreviation:ab}}).rgb;
      return '<button class="tchip '+v+'" data-t="'+ab+'" aria-label="'+esc(NAMES[ab]+": "+TPLABEL[v]+". Tap to change.")+'"><span class="ln"><i style="--tc:'+(c?"rgb("+c.join(",")+")":"var(--line)")+'"></i>'+ab+'</span><small>'+TPLABEL[v]+'</small></button>';
    }).join("")+'</div></div>';
  }).join("");
  teamSum();
}
function teamsSet(ab,v){
  if(v==="f")delete S.teams[ab];else S.teams[ab]=v;
  save("db_teams",S.teams); teamsDraw();
  if(DG.card)cardDraw(); DG.dockHtml=""; dockRender();
}
function teamsOpen(open){$("teamSheet").hidden=!open;if(open){teamsDraw();$("teamDone").focus()}else{teamSum();$("openTeams").focus()}}
$("openTeams").onclick=function(){teamsOpen(true)};
$("teamDone").onclick=function(){teamsOpen(false)};
$("teamList").addEventListener("click",function(e){var b=e.target.closest(".tchip");if(!b)return;var ab=b.getAttribute("data-t"),v=teamPref(ab);teamsSet(ab,v==="f"?"n":v==="n"?"x":"f");var nb=document.querySelector('.tchip[data-t="'+ab+'"]');if(nb)nb.focus()});
$("teamReset").onclick=function(){S.teams={};save("db_teams",S.teams);teamsDraw();if(DG.card)cardDraw();DG.dockHtml="";dockRender()};
$("retry").onclick=function(){$("status").textContent="Retrying…";poll()};
