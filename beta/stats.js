/* Delay Booth · Game info and stats tabs. */
"use strict";
function renderInfo(j){
  var T=teamsOf(j), crew=crewFor(j,T);
  var gi=j.gameInfo||{}, v=gi.venue||{}, ad=v.address||{}, comp=hdrComp(j), rows=[], nets=[];
  function add(x){if(x&&nets.indexOf(x)<0)nets.push(x)}
  (comp.broadcasts||[]).concat(j.broadcasts||[],comp.geoBroadcasts||[]).forEach(function(b){
    if(!b)return;
    if(b.media&&b.media.shortName)add(b.media.shortName);
    else if(b.names)b.names.forEach(add);
    else if(typeof b.shortName==="string")add(b.shortName);
  });
  var place=[ad.city,ad.state,ad.country&&ad.country!=="USA"?ad.country:""].filter(Boolean).join(", ");
  if(v.fullName)rows.push(["Stadium",v.fullName]);
  if(place)rows.push(["Location",place]);
  if(v.grass!=null||v.indoor!=null)rows.push(["Field",[v.indoor?"Indoor":v.indoor===false?"Outdoor":"",v.grass?"grass":v.grass===false?"turf":""].filter(Boolean).join(", ")]);
  var w=gi.weather;
  if(w&&(w.temperature!=null||w.displayValue))rows.push(["Weather",[w.displayValue,w.temperature!=null?w.temperature+"°F ("+Math.round((w.temperature-32)*5/9)+"°C)":""].filter(Boolean).join(", ")]);
  if(crew&&crew.network&&nets.indexOf(crew.network)<0)nets.unshift(crew.network);
  rows.push(["US TV",nets.length?nets.join(", "):"Not in the feed yet"]);
  rows.push(["Commentators",crew&&crew.crew.length?crew.crew.join(", ")+(crew.network?" ("+crew.network+")":""):S.crews?"Not listed yet":"Loading…"]);
  var ref=(gi.officials||[]).filter(function(o){return /referee/i.test(((o.position||{}).displayName)||((o.position||{}).name)||"")})[0];
  if(ref)rows.push(["Referee",ref.displayName||ref.fullName]);
  if(gi.attendance)rows.push(["Attendance",Number(gi.attendance).toLocaleString()]);
  $("infoSum").textContent="Game info · "+([v.fullName,nets.join(", "),crew&&crew.crew.length?crew.crew.join(", "):""].filter(Boolean).join(" · ")||"loading");
  $("infoBody").innerHTML=rows.map(function(r){return '<dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd>'}).join("");
}

function renderStats(j,T,allShown){
  $("segMine").textContent=(T.mine?T.mine.ab:"Your")+" players";
  $("segOpp").textContent=(T.opp?T.opp.ab:"Opponent")+" players";
  [["segMine","mine"],["segOpp","opp"],["segTeam","team"]].forEach(function(x){$(x[0]).setAttribute("aria-selected",S.statTab===x[1])});
  var cut=Date.now()-S.delay*1000, snap=null;
  if(S.state==="post"&&allShown&&j.boxscore)snap={t:"final",box:j.boxscore};
  else for(var i=S.snaps.length-1;i>=0;i--){if(S.snaps[i].t<=cut){snap=S.snaps[i];break}}
  var el=$("statsBody");
  if(!snap){
    var first=S.snaps[0], wait=first?Math.max(0,Math.ceil((first.t+S.delay*1000-Date.now())/1000)):S.delay;
    S.keys.stats=null;
    el.innerHTML='<div class="empty">'+(S.state==="pre"?"Stats appear once the game starts.":"Stats catch up with your stream in about "+wait+"s.")+'</div>';return;
  }
  var key=snap.t+"|"+S.statTab;
  if(S.keys.stats===key)return; S.keys.stats=key;
  var box=snap.box, out=[], TC=teamColors(j,T);
  function sty(t){var c=t&&TC[t.id];return c?' style="--tc:'+c.bg+';--tci:'+c.ink+'"':''}
  if(S.statTab==="team"){
    var teams=box.teams||[], A=null, H=null;
    teams.forEach(function(t){var id=String((t.team||{}).id);if(T.away&&id===T.away.id)A=t;else if(T.home&&id===T.home.id)H=t});
    if(!A||!H){A=teams[0];H=teams[1]}
    if(A&&H){
      var hs={}; (H.statistics||[]).forEach(function(s){hs[s.name||s.label]=s});
      var KEY=["totalYards","netPassingYards","rushingYards","firstDowns","thirdDownEff","redZoneAttempts","turnovers","possessionTime"];
      var LOWER=/turnovers|fumblesLost|interceptions|totalPenaltiesYards|sacksYardsLost/;
      var ca=(TC[T.away&&T.away.id]||{}).bg||"var(--muted)", ch=(TC[T.home&&T.home.id]||{}).bg||"var(--fg)";
      var rows=(A.statistics||[]).map(function(s){
        var nm=s.name||s.label, h=hs[nm]||{}, av=statNum(s.displayValue,nm), hv=statNum(h.displayValue,nm);
        var tot=av+hv, sh=tot>0&&av>=0&&hv>=0?av/tot:0.5, lower=LOWER.test(nm);
        var aw=av!==hv&&(lower?av<hv:av>hv), hw=av!==hv&&!aw;
        return {nm:nm,h:'<div class="crow"><div class="cvals"><b class="'+(aw?"win":"")+'">'+esc(s.displayValue)+'</b><span>'+esc(s.label||nm)+'</span><i class="'+(hw?"win":"")+'">'+esc(h.displayValue)+'</i></div>'+
          '<div class="cbar"><em style="width:'+(sh*100).toFixed(1)+'%;background:'+ca+'"></em><em style="flex:1;background:'+ch+'"></em></div></div>'};
      });
      var key=[], rest=[];
      KEY.forEach(function(k){rows.forEach(function(r){if(r.nm===k)key.push(r.h)})});
      rows.forEach(function(r){if(KEY.indexOf(r.nm)<0)rest.push(r.h)});
      if(!key.length){key=rest;rest=[]}
      out.push('<div class="cmp"><div class="cmphead"><span class="badge"'+sty(T.away)+'>'+esc(T.away?T.away.ab:"")+'</span><span class="lbl">Team stats</span><span class="badge"'+sty(T.home)+'>'+esc(T.home?T.home.ab:"")+'</span></div>'+
        key.join("")+(rest.length?'<details class="more"><summary></summary>'+rest.join("")+'</details>':'')+'</div>');
    }
  }else{
    var want=T[S.statTab], players=box.players||[], tp=null;
    players.forEach(function(x){if(want&&String((x.team||{}).id)===want.id)tp=x});
    if(tp){
      (tp.statistics||[]).forEach(function(s){
        if(!(s.athletes||[]).length)return;
        var lab=s.labels||[], ki=lab.indexOf("YDS");
        var th='<tr><th>Player</th>'+lab.map(function(l){return '<th>'+esc(l)+'</th>'}).join("")+'</tr>';
        var tr=s.athletes.map(function(a){return '<tr><td>'+esc((a.athlete||{}).shortName||(a.athlete||{}).displayName||"")+'</td>'+(a.stats||[]).map(function(v,i){return '<td'+(i===ki?' class="k"':'')+'>'+esc(v)+'</td>'}).join("")+'</tr>'}).join("");
        var title=String(s.text||s.name).replace(/^.*?\b(Passing|Rushing|Receiving|Fumbles|Defensive|Interceptions|Kick Returns|Punt Returns|Kicking|Punting)\b/i,"$1");
        out.push('<div class="card pt"'+sty(want)+'><h3>'+esc(title)+'</h3><div class="scroll"><table class="pl">'+th+tr+'</table></div></div>');
      });
    }
  }
  el.innerHTML=out.join("")||'<div class="empty">No stats in the feed yet.</div>';
  markScrolls();
}
/* Number behind a stat for the comparison bar: 28:30 -> seconds, 4-12 efficiency -> rate, 6-45 -> first number. */
function statNum(v,name){
  v=String(v==null?"":v);
  var m=v.match(/^(\d+):(\d+)$/); if(m)return +m[1]*60+(+m[2]);
  m=v.match(/^(\d+)-(\d+)$/); if(m)return /Eff|redZone/i.test(name)?(+m[2]?m[1]/m[2]:0):+m[1];
  var n=parseFloat(v); return isNaN(n)?0:n;
}
function markScrolls(){
  document.querySelectorAll(".scroll").forEach(function(s){s.classList.toggle("more",s.scrollWidth-s.clientWidth-s.scrollLeft>4)});
}
document.addEventListener("scroll",function(e){var t=e.target;if(t&&t.classList&&t.classList.contains("scroll"))t.classList.toggle("more",t.scrollWidth-t.clientWidth-t.scrollLeft>4)},true);
window.addEventListener("resize",markScrolls);

