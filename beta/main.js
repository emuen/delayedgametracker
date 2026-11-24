/* Delay Booth · Drive replay, tabs, keep-screen-on, startup. */
"use strict";
/* Drive replay (3D or flat chart). */
function stopReplay(){if(S.replay){S.replay.stop();S.replay=null}var img=document.querySelector("#c3d img");if(img)img.hidden=false;var b=$("replayBtn");if(b){b.textContent="▶ Replay drive";b.classList.remove("on")}S.keys.drives=null}
function startReplay(){
  var E=S.engine?chartEngine():null;
  if(!E||!S.spec3d)return;
  if(S.live){endLive();S.keys.drives="hold"}
  var holder=$("c3d"), img=holder&&holder.querySelector("img"), b=$("replayBtn"); if(!holder)return;
  if(img)img.hidden=true; b.textContent="■ Stop"; b.classList.add("on");
  try{S.replay=E.replay(holder,S.spec3d,{linger:S.linger,onDoink:window.dbDoink,onDone:function(){setTimeout(function(){stopReplay();render()},Math.max(600,S.linger*1000))}})}
  catch(err){console.log("Replay failed",err);S.replay=null;stopReplay()}
}
$("drives").addEventListener("click",function(e){
  if(e.target.closest("#replayBtn")){if(S.replay){stopReplay();render()}else startReplay();return}
  if(S.replay&&e.target.closest("summary")){stopReplay()}
  if(S.live&&e.target.closest("summary")){endLive()}
  var b=e.target.closest("[data-sync]");
  if(b){
    var id=b.getAttribute("data-sync"), at=S.shownAt[id];
    if(at){S.synced[id]=1;setDelay(S.delay+Math.floor((Date.now()-at)/1000))}
    return;
  }
  var s=e.target.closest("summary"); if(!s)return;
  var d=s.parentNode; if(d&&d.dataset&&d.dataset.k!=null)S.openState[d.dataset.k]=!d.open;
  if(d&&d.dataset&&d.dataset.k!=null){S.chartDrive=d.dataset.k;save("db_tapped",true);S.keys.drives=null;setTimeout(function(){render();var c=document.querySelector(".chart");if(c)c.scrollIntoView({behavior:"smooth",block:"start"})},0)}
});
function tab(t){S.tab=t;$("drives").hidden=t!=="drives";$("stats").hidden=t!=="stats";
  $("tabDrives").setAttribute("aria-selected",t==="drives");$("tabStats").setAttribute("aria-selected",t==="stats");if(t==="stats")markScrolls()}
$("tabDrives").onclick=function(){tab("drives")};
$("tabStats").onclick=function(){tab("stats")};
function stab(t){S.statTab=t;save("db_statTab",t);S.keys.stats=null;render()}
$("segMine").onclick=function(){stab("mine")};
$("segOpp").onclick=function(){stab("opp")};
$("segTeam").onclick=function(){stab("team")};

/* Keep the screen on. Uses the browser's screen lock where it works, plus a tiny
   silent looping video, which is what keeps iPhones (and home-screen apps) awake. */
var lock=null, video=null, wakeBtn=$("wake");
var VID="data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMvbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAll0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHRbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATxzdGJsAAAAvHN0c2QAAAAAAAAAAQAAAKxhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAMmF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAAg8SJZYAQAEaO+Py/34+AAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAALQAAAC0AAAAAYc3R0cwAAAAAAAAABAAAAAgAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAAsQAAAAMAAAAFHN0Y28AAAAAAAAAAQAAA18AAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYwLjE2LjEwMAAAAAhmcmVlAAAC2G1kYXQAAAKqBgX//6bcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MSBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MyBtZT1oZXggc3VibWU9MiBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MCA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0wIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MSBrZXlpbnQ9MjUwIGtleWludF9taW49MSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTEwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAABJliIQAFv/sf8JVf9ECkR5tf/EAAAAIQZohGIK//vA=";
function startVideo(){
  if(!video){video=document.createElement("video");video.setAttribute("playsinline","");video.setAttribute("muted","");video.muted=true;video.loop=true;video.src=VID;
    video.style.cssText="position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none";document.body.appendChild(video)}
  var p=video.play(); if(p&&p.catch)p.catch(function(){});
}
function getLock(){
  if(!("wakeLock" in navigator)||lock)return;
  navigator.wakeLock.request("screen").then(function(l){lock=l;l.addEventListener("release",function(){if(lock===l)lock=null})}).catch(function(){});
}
function wakeUI(){wakeBtn.setAttribute("aria-checked",S.wantWake?"true":"false");chips();render()}
function wakeOn(){startVideo();getLock()}
function wakeOff(){if(video)video.pause();if(lock){var l=lock;lock=null;l.release()}}
wakeBtn.onclick=function(){
  S.wantWake=!S.wantWake; save("db_wake",S.wantWake);
  if(S.wantWake)wakeOn(); else wakeOff();
  wakeUI();
};
document.addEventListener("visibilitychange",function(){if(!document.hidden){if(S.view==="game")poll();else loadWeek();if(S.wantWake)wakeOn()}});
/* Phones only allow this after a tap, so on reopening, the first tap anywhere turns it back on. */
document.addEventListener("pointerdown",function(){if(S.wantWake&&(!video||video.paused))wakeOn()},true);
if(S.wantWake)wakeOn();
wakeBtn.setAttribute("aria-checked",S.wantWake?"true":"false");

setInterval(render,1000);
if(window.Chart2D)window.Chart2D.onReady=function(){S.keys.drives=null;render()};
if(TEST3D){
  var ld=function(src,cb){var sc=document.createElement("script");sc.src=src;sc.onload=cb;sc.onerror=function(){console.log("3D load failed: "+src)};document.head.appendChild(sc)};
  ld("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",function(){ld("chart3d.js?v=34",function(){
    window.Chart3D.onReady=function(){S.keys.drives=null;render()};S.keys.drives=null;render()})});

}
loadCrews(); setInterval(loadCrews,30*60000);
tab("drives"); chips(); route();
window.addEventListener("hashchange",route);
