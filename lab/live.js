/* Delay Booth · Live animation of each new play. */
"use strict";
/* Live animation (3D or flat chart). Each new play is animated as it comes in:
   - the previous result stays up until a few seconds (the heads-up setting) before the next snap,
   - then the box switches to the next down and distance (previous result in grey),
   - the snap text, ball and arrow run so the result lands exactly when the play is due on screen,
   - then the chart settles back to the still picture.
   The next play is already in the page (held back by the delay), so its timing is known. */
function liveTick(j,T,V){
  var E=S.engine?chartEngine():null;
  if(!E||S.replay||S.view!=="game"||S.live||S.chartDrive)return;
  var kP=-1,P=null;
  for(var k=V.last+1;k<V.plays.length;k++){if(!isNonPlay(V.plays[k])){kP=k;P=V.plays[k];break}}
  if(!P||S.liveDone[P.id])return;
  var now=Date.now(), tReveal=playTime(P)+S.delay*1000;
  if(now>=tReveal-400){S.liveDone[P.id]=1;return}          /* too late to animate: just show it */
  if(now<tReveal-S.lead*1000-6000)return;                  /* not yet: prepare a few seconds ahead */
  var ids={};for(var q=0;q<=kP;q++)ids[V.plays[q].id]=1;
  var L2=latestDrive(j,T,{ids:ids,plays:V.plays,last:kP});
  if(!L2||L2.vis.indexOf(P)<0){S.liveDone[P.id]=1;return}
  var spec=fieldChart3D(L2,true), k0=-1, k1=-1;
  spec.easter=true;   /* the "God dammit Donald" easter egg only plays here, in the live broadcast */
  L2.rows.forEach(function(r,i){if(r.p===P){if(k0<0)k0=i;k1=i}});
  if(k0<0){S.liveDone[P.id]=1;return}
  var tmp=document.createElement("div"), ctrl;
  try{ctrl=E.replay(tmp,spec,{clock:true,linger:S.linger,onDoink:window.dbDoink,onGdd:gddSound,onHurt:hurtSound,doinkOnSeek:true})}catch(e){console.log("Live animation failed",e);S.liveDone[P.id]=1;return}
  var g0=ctrl.timeline[k0], g1=ctrl.timeline[k1], F=g1.end-g0.snap;
  var tSnap=tReveal-F, tPre=tSnap-S.lead*1000;
  S.live={ctrl:ctrl,tmp:tmp,attached:false,id:P.id,tPre:tPre,tSnap:tSnap,t0:g0.t0,preEnd:g0.snap-1,snap:g0.snap,
    freeze:g1.hurtEnd?g1.hurtEnd+50:Math.min(g1.holdEnd-30,g1.end+1800),settleAt:tReveal+(g1.hurtEnd?g1.hurtEnd-g1.end+300:1800)};
  requestAnimationFrame(liveFrame);
}
function liveFrame(){
  var Lv=S.live; if(!Lv)return;
  var now=Date.now();
  if(now<Lv.tPre){setTimeout(function(){requestAnimationFrame(liveFrame)},150);return}
  if(!Lv.attached){
    var h=$("c3d"); if(!h||!Lv.tmp.firstChild){endLive();return}
    var img=h.querySelector("img"); if(img)img.hidden=true;
    h.appendChild(Lv.tmp.firstChild); Lv.attached=true;
  }
  var v=now<Lv.tSnap?Math.min(Lv.t0+(now-Lv.tPre),Lv.preEnd):Lv.snap+(now-Lv.tSnap);
  Lv.ctrl.seek(Math.min(v,Lv.freeze));
  if(now>=Lv.settleAt){endLive();render();return}
  requestAnimationFrame(liveFrame);
}
function endLive(){
  var Lv=S.live; if(!Lv)return;
  S.liveDone[Lv.id]=1; S.live=null;
  try{Lv.ctrl.stop()}catch(e){}
  var img=document.querySelector("#c3d img"); if(img)img.hidden=false;
  S.keys.drives=null;
}

