/* Delay Booth · Rendering the game view: score bar, drive list, chart choice. */
"use strict";
/* ---------- render ---------- */
function render(){
  if(S.view!=="game")return;
  var now=Date.now();
  $("delayVal").textContent=fmtDelay(S.delay);
  chips();
  var st=$("status"), retry=$("retry");
  retry.hidden=!S.err; $("statusrow").classList.toggle("err",!!S.err);
  if(S.err){
    var secs=Math.max(0,Math.ceil((S.nextPollAt-now)/1000));
    st.textContent=(S.err==="Offline"?"Offline":S.err)+" · retrying in "+secs+"s"+(S.sum?" · showing last update":"");
    st.className="status err";
  }
  if(!S.sum){
    $("mid").innerHTML=(S.err?"Offline":"Loading")+"<small>&nbsp;</small>";
    $("drives").innerHTML='<div class="empty">'+(S.err?"Waiting for the feed to come back.":"Loading the game…")+'</div>';
    return;
  }
  var j=S.sum, T=teamsOf(j), V=visibleIds(j), lastP=V.plays[V.last]; S.V=V;
  var allShown=V.plays.length>0&&V.last===V.plays.length-1;
  var L=latestDrive(j,T,V);
  $("awayAb").textContent=T.away?T.away.ab:"AWAY"; $("homeAb").textContent=T.home?T.home.ab:"HOME";
  var TCh=teamColors(j,T,true); ["away","home"].forEach(function(k){var el=$(k+"Ab"),c=T[k]&&TCh[T[k].id],edge=!!(c&&c.edge);if(!c&&T[k]){var cc=(hdrComp(j).competitors||[]).filter(function(x){return x.homeAway===k})[0],col=cc&&cc.team&&cc.team.color;if(col){c={bg:"#"+String(col).replace("#",""),ink:"#fff"};edge=true}}el.style.boxShadow=edge?"inset 0 0 0 1px rgba(255,255,255,.4)":"";if(c){el.style.setProperty("--tc",c.bg);el.style.setProperty("--tci",c.ink)}else{el.style.removeProperty("--tc");el.style.removeProperty("--tci")}});
  var started=V.plays.length||S.state!=="pre";
  $("awayPts").textContent=lastP?(lastP.awayScore||0):(started?0:"–");
  $("homePts").textContent=lastP?(lastP.homeScore||0):(started?0:"–");

  var mid=$("mid"), sit="", posId=null;
  if(S.state==="pre"&&!V.plays.length){
    var d=new Date(hdrComp(j).date||now);
    mid.innerHTML="Kickoff<small>"+esc(d.toLocaleString(undefined,{weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}))+"</small>";
  }else if(S.state==="post"&&allShown){
    mid.innerHTML="Final<small>&nbsp;</small>";
  }else if(lastP){
    var c=clockText(lastP);
    mid.innerHTML=esc(c.q+" "+c.clk);
    var rp=null; for(var k=V.last;k>=0;k--){if(!isNonPlay(V.plays[k])){rp=V.plays[k];break}}
    var e=rp&&rp.end;
    if(e&&e.down>0&&e.downDistanceText&&!rp.scoringPlay){sit=e.downDistanceText;posId=teamIdOf(e)||teamIdOf(rp.start)}
  }else{
    mid.innerHTML="Waiting<small>for the first play</small>";
  }
  var sp=aliasCodes(sit).split(/\s+at\s+/i); $("sit").innerHTML=sit?esc(sp[0])+(sp[1]?"<small>at "+esc(sp[1])+"</small>":""):"";
  S.bug={a:T.away?T.away.ab:"",h:T.home?T.home.ab:"",ap:$("awayPts").textContent,hp:$("homePts").textContent,
    clk:S.state==="post"&&allShown?"Final":lastP?(clockText(lastP).q+" "+clockText(lastP).clk).trim():"",sit:sit,
    pos:posId&&T.away&&T.away.id===posId?"a":posId&&T.home&&T.home.id===posId?"h":null};
  bugUpdate();
  $("scoreRow").classList.toggle("known",!!posId);
  $("awayBox").classList.toggle("pos",!!(posId&&T.away&&T.away.id===posId));
  $("homeBox").classList.toggle("pos",!!(posId&&T.home&&T.home.id===posId));

  if(!S.err){
    st.className="status";
    st.textContent=S.state==="post"&&allShown?"Game over. Everything is shown."
      :S.state==="pre"&&!V.plays.length?"Pre-game · checking every minute"
      :"Live · in sync";
  }
  var dk=S.sumVer+"|"+V.last+"|"+S.state+"|"+Math.floor(now/30000);
  if(S.keys.drives!==dk&&!S.replay&&!(S.live&&S.live.attached)){S.keys.drives=dk;renderDrives(j,T,V,L)}
  liveTick(j,T,V);
  if(S.keys.info!==S.sumVer){S.keys.info=S.sumVer;renderInfo(j)}
  renderStats(j,T,allShown);
}

function renderDrives(j,T,V,L){
  var drives=drivesOf(j), cur=(j.drives||{}).current, html=[], now=Date.now(), TC=teamColors(j,T,true);
  var newest=null, syncId=null;
  for(var k=V.last;k>=0;k--){if(!isNonPlay(V.plays[k])){newest=V.plays[k];break}}
  if(newest&&S.shownAt[newest.id]&&now-S.shownAt[newest.id]<120000&&!S.synced[newest.id]&&S.state!=="post")syncId=newest.id;
  var latestId=null;
  drives.forEach(function(d){if((d.plays||[]).some(function(p){return V.ids[p.id]}))latestId=d.id});
  drives.forEach(function(d){
    var all=(d.plays||[]).filter(function(p){return !isOfficialTO(p)}), vis=all.filter(function(p){return V.ids[p.id]});
    if(!vis.length)return;
    var dst=driveState(d,vis,all,cur), done=dst.ended;
    var tm=(d.team&&d.team.abbreviation)||(T.byId[String((d.team||{}).id)]||{}).ab||"";
    var res=done?dst.label:"In progress";
    var nReal=vis.filter(function(p){return !isNonPlay(p)}).length;
    var allShown=vis.length===all.length&&!(cur&&d.id===cur.id&&S.state!=="post");
    var desc=done?((allShown&&d.description)||nReal+" play"+(nReal===1?"":"s")):nReal+" play"+(nReal===1?"":"s")+" so far";
    var start=d.start||{}, sc=done&&dst.scored, sClock=clockText(start);
    var startTx=(start.text?"From "+start.text:"")+(sClock.q?" · "+sClock.q+" "+sClock.clk:"");
    var userOpen=S.openState[d.id], open=userOpen===undefined?d.id===latestId:userOpen;
    var tc=TC[String((d.team||{}).id)], style=tc?' style="--tc:'+tc.bg+';--tci:'+tc.ink+(tc.edge?';box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)':'')+'"':'';
    var q=((d.start||{}).period||{}).number||((vis[0]||{}).period||{}).number||0;
    var items=vis.slice().reverse().map(function(p){
      var c=clockText(p), dd=((p.start||{}).down>0&&!isNonPlay(p))?((p.start||{}).shortDownDistanceText||""):"", yd="";
      var ty=((p.type||{}).text||"");
      var btn=p.id===syncId?'<button class="tvsync" data-sync="'+esc(p.id)+'">Just happened on TV</button>':'';
      return '<li class="'+(p.scoringPlay?"spt":"")+(isNonPlay(p)?" np":"")+'"><div class="pc"><b>'+esc(c.q+" "+c.clk)+'</b>'+esc(dd)+'</div><div class="tx">'+esc(aliasCodes(cleanText(dropNoise(p.text)))||ty)+'</div>'+yd+btn+'</li>';
    }).join("");
    html.push({q:q,h:'<details class="drive'+(sc?" sc":"")+'" data-k="'+esc(d.id)+'"'+style+(open?" open":"")+'><summary><span class="dt">'+esc(tm)+'</span><span class="dd">'+esc(desc)+(startTx?"<br>"+esc(startTx):"")+'</span><span class="dr'+(done?(sc?" sc":""):" live")+'">'+esc(res)+'</span></summary><ol class="plays">'+items+'</ol></details>'});
  });
  var box=$("drives");
  if(!html.length){box.innerHTML='<div class="empty">'+(S.state==="pre"?"Kickoff soon. Start DAZN at kickoff, then match the first play using the delay buttons above.":"Holding plays back by "+fmtDelay(S.delay)+". The first one shows up when your stream reaches it.")+'</div>';return}
  var list=[], lastQ=null;
  html.reverse().forEach(function(x){if(x.q!==lastQ&&x.q){list.push('<h4 class="qhead">'+esc(qLabel(x.q))+'</h4>');lastQ=x.q}list.push(x.h)});
  box.innerHTML=(L?fieldChart(L):"")+list.join("");
}

/* Drive chart in the style of the newer NFL Game Center: the field seen at an angle,
   away end zone on the left and home on the right in team colours. Passes and kicks
   arc through the air, runs and penalties run along the turf (newest play nearest),
   a football at the ball spot, blue line of scrimmage and yellow line to gain. */
var PK={run:["#ffffff","Run"],pass:["#7fd4ff","Pass"],pen:["#ffd23f","Penalty"],kick:["#cfd6d0","Kick"],ret:["#d9c2ff","Return"],to:["#ff7a6b","Turnover"]};
function playKind(r){
  if(r.forceKind)return r.forceKind;
  if(r.kind==="kick")return "kick"; if(r.kind==="ret")return "ret";
  var ty=((r.p||{}).type||{}).text||"", t=r.text!=null?r.text:ftext((r.p||{}).text), t0=t.split(/TWO-POINT CONVERSION/i)[0];
  /* A foul with no play is a penalty whatever ESPN's type says; offsetting fouls are their own kind. */
  if(isOffsetting(t))return "off";
  if(isNullified(t))return "pen";
  if(r.fumble)return /pass|sack|scramble/i.test(t0)?"pass":"run";
  if(/\bINTERCEPTED\b|^Interception return by\b/i.test(t0)||(/interception/i.test(ty)&&!/\bfumble\b/i.test(t0)))return "to";
  if(/fumble recovery \(opponent\)|fumble return|opp fumble/i.test(ty)&&!/touchdown/i.test(ty))return "to";
  if(/fumble return touchdown|sack opp fumble/i.test(ty))return "to";
  if(/penalty/i.test(ty)&&/PENALTY/i.test(t0))return "pen";
  if(/pass|sack|scramble/i.test(ty.replace(/two.?point.*/i,"")+" "+t0))return "pass";
  return "run";
}
function clockSecs(p){var m=String(((p||{}).clock||{}).displayValue||"").match(/^(\d+):(\d+)$/);return m?+m[1]*60+(+m[2]):null}
function driveTime(L){
  var ps=L.real; if(ps.length<2)return "";
  var a=ps[0], b=ps[ps.length-1], ca=clockSecs(a), cb=clockSecs(b), pa=((a.period||{}).number)||0, pb=((b.period||{}).number)||0;
  if(ca==null||cb==null||!pa||!pb)return "";
  var t=pa===pb?ca-cb:ca+(pb-pa-1)*900+(900-cb);
  return t>0?Math.floor(t/60)+":"+String(t%60).padStart(2,"0"):"";
}
/* The drive chart: 3D when three.js and WebGL work (and ?chart=2d isn't set), otherwise the flat
   chart (chart2d.js) with the same spec, conventions and animation. The old SVG drawing below is
   only a last resort if the chart scripts didn't load. */
function fieldChart(L){return window.DriveCore&&window.Chart2D?fieldChart3D(L):""}
function chartEngine(){return S.engine==="3d"&&window.Chart3D?window.Chart3D:window.Chart2D}
/* Drive chart: turns the drive into a scene description for chart3d.js / chart2d.js. */
