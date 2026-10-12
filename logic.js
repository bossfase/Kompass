/* Mein Kompass – Logik ohne Oberfläche.
   Alles hier sind reine Funktionen: Sie bekommen den gespeicherten Zustand und geben Ergebnisse zurück,
   ohne etwas zu speichern. Dadurch lassen sie sich getrennt testen (siehe tests/logic.test.js). */
(function(root){
"use strict";

/* ---------- Datum ---------- */
function pad(n){return String(n).padStart(2,"0")}
function key(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function parse(k){var p=k.split("-");return new Date(+p[0],+p[1]-1,+p[2])}
function addDays(k,n){var d=parse(k);d.setDate(d.getDate()+n);return key(d)}
function diffDays(a,b){return Math.round((parse(b)-parse(a))/86400000)}   // b - a
function dow(k){return (parse(k).getDay()+6)%7}                             // 0 = Montag
function weekStart(k){return addDays(k,-dow(k))}
function rangeKeys(from,to){var out=[],k=from;while(k<=to){out.push(k);k=addDays(k,1)}return out}
function toMin(t){if(!t)return null;var p=String(t).split(":");return (+p[0])*60+(+p[1]||0)}
function fromMin(m){m=Math.max(0,Math.round(m));if(m>=1440)m=1439;return pad(Math.floor(m/60))+":"+pad(m%60)}
function uid(){return Math.random().toString(36).slice(2,10)}

/* ---------- Profil ---------- */
var CATS={
  lernen:{label:"Lernen",emoji:"📚"},uni:{label:"Uni & Abgaben",emoji:"🎓"},haushalt:{label:"Haushalt",emoji:"🏠"},
  privat:{label:"Privat & Termine",emoji:"📋"},selbst:{label:"Zeit für mich",emoji:"🌿"},projekt:{label:"Projekt",emoji:"🎨"},
  arbeit:{label:"Arbeit",emoji:"💼"},pause:{label:"Pause",emoji:"☕"}
};
var PEAK={morgens:[480,720],mittags:[660,840],nachmittags:[840,1080],abends:[1080,1320]};
function defaultProfile(){
  return {setupDone:false,wake:"07:00",sleep:"23:00",busyDays:[],peak:"morgens",commute:0,
    capacity:180,style:"ausgewogen",freeTime:true,maxBig:2,learnPerWeek:300,mePerWeek:180,subjects:[]};
}

/* ---------- Belegte Zeiten eines Tages ---------- */
function blocksFor(state,k){
  var p=state.profile||defaultProfile(),d=dow(k),out=[],c=+p.commute||0;
  (state.fixed||[]).forEach(function(f){
    if((f.days||[]).indexOf(d)<0)return;var s=toMin(f.start),e=toMin(f.end);if(s==null||e==null||e<=s)return;
    out.push({id:f.id,title:f.title,start:s-c,end:e+c,realStart:s,realEnd:e,src:"fixed",cat:f.cat||"privat"});
  });
  (state.appts||[]).forEach(function(a){
    if(a.date!==k||!a.time)return;var s=toMin(a.time),dur=+a.dur||60;
    out.push({id:a.id,title:a.title,start:s,end:s+dur,realStart:s,realEnd:s+dur,src:"appt",cat:"privat"});
  });
  (state.imported||[]).forEach(function(ev){
    if(ev.date!==k||ev.allDay)return;var s=toMin(ev.start),e=toMin(ev.end)||(s+60);
    out.push({id:ev.id,title:ev.title,start:s,end:e,realStart:s,realEnd:e,src:"import",cat:"privat"});
  });
  return out.sort(function(a,b){return a.start-b.start});
}
function dayWindow(state){
  var p=state.profile||defaultProfile(),w=toMin(p.wake)||420,s=toMin(p.sleep)||1380;
  if(s<=w)s+=1440;                                  // Schlafenszeit nach Mitternacht
  return [w+30,Math.min(s-60,1439)];                // 30 Min. Ankommen, 60 Min. Runterkommen
}
function subtract(intervals,s,e){
  var out=[];intervals.forEach(function(iv){
    if(e<=iv[0]||s>=iv[1]){out.push(iv);return}
    if(s>iv[0])out.push([iv[0],s]);if(e<iv[1])out.push([e,iv[1]]);
  });return out;
}
function freeIntervals(state,k,timedTasks){
  var win=dayWindow(state),iv=[win.slice()];
  blocksFor(state,k).forEach(function(b){iv=subtract(iv,b.start,b.end)});
  (timedTasks||[]).forEach(function(t){var s=toMin(t.time);iv=subtract(iv,s,s+(+t.dur||30)+10)});
  return iv.filter(function(x){return x[1]-x[0]>=10});
}
function minutes(iv){return iv.reduce(function(a,x){return a+(x[1]-x[0])},0)}
function fixedMinutes(state,k){return blocksFor(state,k).reduce(function(a,b){return a+(b.realEnd-b.realStart)},0)}

/* ---------- Energie aus Check-ins ---------- */
function recentEnergy(state,k){
  var vals=[];for(var i=1;i<=3;i++){var c=(state.checkins||{})[addDays(k,-i)];if(c&&c.energy)vals.push(c.energy)}
  return vals.length?vals.reduce(function(a,b){return a+b},0)/vals.length:null;   // 1 (fast keine) … 4 (sehr viel)
}
function capacityFor(state,k){
  var p=state.profile||defaultProfile(),cap=+p.capacity||180,why=[];
  cap*= {entspannt:.8,ausgewogen:1,strukturiert:1.15}[p.style]||1;
  if((p.busyDays||[]).indexOf(dow(k))>=0){cap*=.7;why.push("voller Tag")}
  var fm=fixedMinutes(state,k);
  if(fm>=360){cap*=.5;why.push("viele feste Termine")}else if(fm>=180){cap*=.75;why.push("feste Termine")}
  var prev=(state.checkins||{})[addDays(k,-1)];
  if(prev&&(prev.tomorrow==="ruhig"||prev.tomorrow==="langsam")){cap*=.75;why.push("du wolltest ruhig starten")}
  var e=recentEnergy(state,k);if(e!=null&&e<=2){cap*=.85;why.push("zuletzt wenig Energie")}
  var free=minutes(freeIntervals(state,k,[]));
  if(p.freeTime!==false)free*=.8;                   // Puffer und freie Zeit bleiben frei
  return {cap:Math.max(0,Math.round(Math.min(cap,free))),why:why};
}

/* ---------- Routinen und Lernblöcke erzeugen ---------- */
function spreadDays(days,n,state){
  // n Tage möglichst gleichmäßig verteilen, ruhigere Tage bevorzugen
  if(n>=days.length)return days.slice();
  var out=[],step=days.length/n;
  for(var i=0;i<n;i++){
    var ideal=Math.floor(i*step+step/2),best=null,bestScore=1e9;
    for(var j=Math.max(0,ideal-1);j<=Math.min(days.length-1,ideal+1);j++){
      if(out.indexOf(days[j])>=0)continue;var sc=Math.abs(j-ideal)+fixedMinutes(state,days[j])/240;
      if(sc<bestScore){bestScore=sc;best=days[j]}
    }
    if(best)out.push(best);
  }
  return out;
}
function routineInstances(state,from,to){
  var tasks=state.tasks||[],out=[],ws=weekStart(from),days=rangeKeys(from,to);
  (state.routines||[]).forEach(function(r){
    if(!r.freq||r.freq==="nie")return;
    var dur=r.small?Math.min(15,+r.dur||15):(+r.dur||20);
    if(r.freq==="taeglich"){
      days.forEach(function(k){
        if(tasks.some(function(t){return t.routineId===r.id&&t.origDate===k}))return;
        out.push(mkTask({title:r.title,cat:r.cat||"haushalt",dur:dur,prio:2,routineId:r.id,date:k,origDate:k,deadline:k,auto:true,when:r.when||null}));
      });
    }else if(r.freq==="monat"){
      // einmal pro Kalendermonat; ein übersprungener Termin wird im selben Monat neu eingeplant
      var months={};days.forEach(function(k){(months[k.slice(0,7)]=months[k.slice(0,7)]||[]).push(k)});
      Object.keys(months).forEach(function(mk){
        var have=tasks.some(function(t){return t.routineId===r.id&&t.monthKey===mk&&(t.status==="open"||t.status==="done"||t.status==="parked")});
        if(have)return;var md=months[mk],last=md[md.length-1];
        spreadDays(md,1,state).forEach(function(k){
          out.push(mkTask({title:r.title,cat:r.cat||"haushalt",dur:dur,prio:2,routineId:r.id,monthKey:mk,date:k,origDate:k,deadline:last,auto:true,when:r.when||null}));
        });
      });
    }else{
      var want=+r.times||1,have=tasks.filter(function(t){return t.routineId===r.id&&t.weekKey===ws&&t.status!=="dropped"}).length;
      var missing=Math.max(0,want-have);if(!missing)return;
      spreadDays(days,missing,state).forEach(function(k){
        out.push(mkTask({title:r.title,cat:r.cat||"haushalt",dur:dur,prio:2,routineId:r.id,weekKey:ws,date:k,origDate:k,deadline:to,auto:true,when:r.when||null}));
      });
    }
  });
  return out;
}
function studyTasks(state,from,to){
  var out=[],tasks=state.tasks||[];
  (state.exams||[]).forEach(function(ex){
    var d=diffDays(from,ex.date);if(d<1||d>28)return;                 // nur Prüfungen in den nächsten 4 Wochen
    var lastDay=addDays(ex.date,-1)<to?addDays(ex.date,-1):to,avail=diffDays(from,lastDay)+1;if(avail<1)return;
    var target=d<=7?Math.min(avail,5):d<=14?3:2;
    var ws=weekStart(from);
    var have=tasks.filter(function(t){return t.examId===ex.id&&t.weekKey===ws&&t.status!=="dropped"}).length;
    for(var i=have;i<target;i++){
      var isAbgabe=ex.kind==="abgabe";
      out.push(mkTask({title:(isAbgabe?"An Abgabe arbeiten: ":"Lernen: ")+ex.title,cat:isAbgabe?"uni":"lernen",dur:d<=3?45:40,prio:1,
        deadline:lastDay,examId:ex.id,weekKey:ws,auto:true}));
    }
  });
  // Wöchentliches Lernziel für Fächer aus dem Profil (nur wenn Fächer eingetragen sind)
  var p=state.profile||defaultProfile();
  if(p.subjects&&p.subjects.length&&p.learnPerWeek>0){
    var ws2=weekStart(from),planned=tasks.concat(out).filter(function(t){return (t.cat==="lernen")&&(t.weekKey===ws2||(t.date&&t.date>=ws2&&t.date<=addDays(ws2,6)))&&t.status!=="dropped"})
      .reduce(function(a,t){return a+(+t.dur||0)},0);
    var daysLeft=diffDays(from,addDays(ws2,6))+1,goal=Math.round(p.learnPerWeek*daysLeft/7);
    var idx=tasks.filter(function(t){return t.subjectBlock&&t.weekKey===ws2}).length;
    while(planned<goal&&idx<12){
      var subj=p.subjects[idx%p.subjects.length];
      out.push(mkTask({title:"Lernblock: "+subj,cat:"lernen",dur:30,prio:2,deadline:addDays(ws2,6),weekKey:ws2,subjectBlock:true,auto:true}));
      planned+=30;idx++;
    }
  }
  return out;
}
function mkTask(o){
  var t={id:uid(),title:"",cat:"privat",dur:30,prio:2,deadline:null,status:"open",date:null,time:null,pinned:false,moved:0,createdAt:Date.now(),doneAt:null};
  for(var k in o)t[k]=o[k];return t;
}
function splitLarge(tasks){
  var out=[],changes=[];
  tasks.forEach(function(t){
    if(t.status==="open"&&!t.pinned&&!t.part&&(+t.dur||0)>60){
      var n=Math.ceil(t.dur/45),each=Math.round(t.dur/n/5)*5;
      t.status="split";out.push(t);changes.push({type:"split",task:t,n:n});
      for(var i=1;i<=n;i++)out.push(mkTask({title:t.title,cat:t.cat,dur:each,prio:t.prio,deadline:t.deadline,examId:t.examId,weekKey:t.weekKey,
        part:{i:i,n:n,parent:t.id},auto:t.auto}));
    }else out.push(t);
  });
  return {tasks:out,changes:changes};
}

/* ---------- Wochenplan ---------- */
function subjectOf(t){return String(t.title||"").replace(/^(Lernen|Lernblock|An Abgabe arbeiten):\s*/,"").trim().toLowerCase()}
function groupOf(t){
  if(t.cat==="lernen"||t.cat==="uni")return "learn:"+subjectOf(t);
  return (t.part&&t.part.parent)||t.routineId||t.examId||null;
}
function prefWindow(t,p){
  if(t.when&&PEAK[t.when])return PEAK[t.when];
  if(t.cat==="lernen"||t.cat==="uni"||t.cat==="projekt")return PEAK[p.peak]||PEAK.morgens;
  if(t.cat==="selbst")return PEAK.abends;
  if(t.cat==="haushalt")return p.peak==="morgens"?PEAK.nachmittags:PEAK.morgens;
  return null;
}
function findSlot(free,dur,pref){
  var need=dur+10,cands=[];
  free.forEach(function(iv){
    if(iv[1]-iv[0]<need)return;
    if(pref){var s=Math.max(iv[0],pref[0]);if(s+need<=Math.min(iv[1],pref[1]+60))cands.push({s:s,score:0});}
    cands.push({s:iv[0],score:1});
  });
  cands.sort(function(a,b){return a.score-b.score||a.s-b.s});
  return cands.length?Math.ceil(cands[0].s/5)*5:null;
}
function planWeek(state,from,to,opts){
  opts=opts||{};
  var p=state.profile||defaultProfile(),days=rangeKeys(from,to);
  var original=JSON.parse(JSON.stringify(state.tasks||[])),origById={};original.forEach(function(t){origById[t.id]=t});
  var gen=routineInstances(state,from,to).concat(studyTasks(state,from,to));
  var sp=splitLarge(original.concat(gen)),tasks=sp.tasks,changes=sp.changes.slice();
  gen.forEach(function(t){if(t.status!=="split")changes.push({type:"new",task:t})});
  sp.tasks.forEach(function(t){if(t.part&&!origById[t.id])changes.push({type:"new",task:t})});
  changes=changes.filter(function(c,i,a){return a.findIndex(function(x){return x.task.id===c.task.id&&x.type===c.type})===i});

  // Tagesstatus vorbereiten: feste Aufgaben bleiben, wo sie sind
  var day={};
  days.forEach(function(k){var c=capacityFor(state,k);day[k]={cap:c.cap,why:c.why,used:0,big:0,groups:{},timed:[]}});
  function reserve(t){var d=day[t.date];if(!d)return;d.used+=(+t.dur||0);if((+t.dur||0)>=45)d.big++;
    var g=groupOf(t);if(g)d.groups[g]=(d.groups[g]||0)+1;if(t.time)d.timed.push(t)}
  var cands=[];
  tasks.forEach(function(t){
    if(t.status==="done"){if(t.date&&day[t.date])reserve(t);return}
    if(t.status!=="open")return;
    var inRange=t.date&&t.date>=from&&t.date<=to;
    if(t.pinned&&inRange){reserve(t);return}
    if(t.pinned&&t.date&&t.date>to)return;                              // bewusst später geplant
    if(t.date&&t.date>to&&!t.examId)return;
    cands.push(t);
  });
  function urgency(t){return t.deadline?diffDays(from,t.deadline):99}
  cands.sort(function(a,b){return urgency(a)-urgency(b)||a.prio-b.prio||(b.dur-a.dur)});

  var unplaced=[];
  cands.forEach(function(t){
    var before={date:t.date,time:t.time};
    var allowed=days.filter(function(k){return !t.deadline||k<=t.deadline});
    if(t.routineId&&t.origDate){allowed=allowed.filter(function(k){return Math.abs(diffDays(t.origDate,k))<=(t.deadline===t.origDate?0:1)})}
    var g=groupOf(t),dur=+t.dur||30,urg=urgency(t);
    var best=null,bestScore=1e9;
    allowed.forEach(function(k,i){
      var d=day[k];if(d.used+dur>d.cap)return;
      if(dur>=45&&d.big>=(+p.maxBig||2))return;
      var sc=(d.used+dur)/Math.max(1,d.cap);
      if(g&&d.groups[g])sc+=1.2*d.groups[g];                                          // gleiche Gruppe auf verschiedene Tage
      sc+=i*(urg<=3?.35:urg<=7?.08:.02);                                  // Dringendes eher früh
      if(t.routineId&&t.origDate===k)sc-=.3;
      if(sc<bestScore){bestScore=sc;best=k}
    });
    if(!best){t.date=null;t.time=null;unplaced.push(t);
      if(before.date)changes.push({type:"unplaced",task:t,from:before.date});else changes.push({type:"unplaced",task:t});return}
    t.date=best;var slot=findSlot(freeIntervals(state,best,day[best].timed),dur,prefWindow(t,p));
    t.time=slot==null?null:fromMin(slot);reserve(t);
    if(origById[t.id]&&(before.date!==t.date||before.time!==t.time))changes.push({type:before.date?"moved":"planned",task:t,from:before.date,to:t.date});
  });
  var load={};days.forEach(function(k){load[k]={used:day[k].used,cap:day[k].cap,why:day[k].why}});
  return {tasks:tasks,changes:changes,unplaced:unplaced,load:load,from:from,to:to};
}
function dayLoad(state,k){
  var used=(state.tasks||[]).filter(function(t){return t.date===k&&(t.status==="open"||t.status==="done")}).reduce(function(a,t){return a+(+t.dur||0)},0);
  return {used:used,cap:capacityFor(state,k).cap,fixed:fixedMinutes(state,k)};
}

/* ---------- Ideen-Bibliothek ----------
   Konkrete Vorschläge, wenn im Plan nichts Passendes steht. Abgestimmt auf Laras Antworten:
   entspannt mit Lesen, Skincare, Dusche/Bad · bewegt sich mit Spazieren, Tanzen, Aufräumen ·
   kreativ mit Figma, Content, Zeichnen/Journaling, Cinema 4D · lernt gern Coding und Design.
   Nie vorschlagen: Handy oder Social Media.
   feel = zu welchen Stimmungen es passt · kid = "ja" (mit Liana), "nein" (nur allein), "beides"
   act = "pause" (ruhiger Timer ohne Blume) oder "focus" (Fokus-Timer mit Blüte) */
var IDEAS=[
  {id:"lesen",cat:"ruhe",head:"Lesezeit",t:"Lies {m} Minuten in deinem Buch. Das Handy bleibt in einem anderen Raum.",min:5,max:40,feel:["muede","okay","pause","ueberfordert","energie"],kid:"nein",act:"pause",task:"Lesen"},
  {id:"maske",cat:"selfcare",head:"Kleine Auszeit",t:"Trag eine Gesichtsmaske auf und bleib {m} Minuten einfach liegen.",min:15,max:25,feel:["muede","pause","ueberfordert","okay"],kid:"nein",act:"pause",task:"Gesichtsmaske"},
  {id:"skincare",cat:"selfcare",head:"Kurz für dich",t:"Mach eine ruhige Skincare-Runde: reinigen, Serum, Creme. Langsam, ohne nebenbei etwas anderes.",min:5,max:15,feel:["muede","pause","ueberfordert","okay"],kid:"nein",act:"pause",task:"Skincare"},
  {id:"dusche",cat:"selfcare",head:"Warm werden",t:"Nimm eine warme Dusche ohne Eile. Danach ziehst du etwas Gemütliches an.",min:10,max:20,feel:["muede","pause","ueberfordert","okay"],kid:"nein",act:"pause",task:"Warme Dusche"},
  {id:"bad",cat:"selfcare",head:"Langsam machen",t:"Lass dir ein Bad ein und nimm dein Buch mit.",min:30,max:60,feel:["muede","pause","okay"],kid:"nein",act:"pause",task:"Bad mit Buch"},
  {id:"atmen",cat:"ruhe",head:"Erst durchatmen",t:"Setz dich hin, Augen zu. Fünf Minuten langsam atmen: vier Sekunden ein, sechs aus.",min:5,max:5,feel:["ueberfordert","pause","muede"],kid:"nein",act:"pause",task:"Durchatmen"},
  {id:"braindump",cat:"ordnung",head:"Kopf leer machen",t:"Schreib auf Papier alles auf, was dir gerade im Kopf herumgeht. Nicht sortieren, nur raus damit.",min:5,max:15,feel:["ueberfordert","muede","okay"],kid:"beides",act:"pause",task:"Brain-Dump"},
  {id:"journal",cat:"kreativ",head:"Eine Seite für dich",t:"Schreib eine Seite Journal: Was war heute gut? Was nimmst du mit?",min:10,max:20,feel:["muede","okay","ueberfordert","pause"],kid:"nein",act:"pause",task:"Journaling"},
  {id:"snack",cat:"essen",head:"Kurz auftanken",t:"Mach dir einen schönen Snack und einen Tee und iss ganz in Ruhe, ohne Bildschirm.",min:10,max:20,feel:["muede","pause","okay","ueberfordert"],kid:"beides",act:"pause",task:"Snack in Ruhe"},
  {id:"spazieren-liana",cat:"bewegung",head:"Raus mit euch",t:"Geh mit Liana eine Runde spazieren. Frische Luft tut euch beiden gut.",min:20,max:60,feel:["energie","okay","muede","ueberfordert"],kid:"ja",act:"pause",task:"Spaziergang mit Liana"},
  {id:"spazieren",cat:"bewegung",head:"Raus an die Luft",t:"Geh {m} Minuten raus, ohne Ziel. Nur laufen und schauen.",min:15,max:45,feel:["energie","okay","muede","ueberfordert","pause"],kid:"nein",act:"pause",task:"Spaziergang"},
  {id:"tanzen",cat:"bewegung",head:"Laut machen",t:"Drei Lieblingssongs an und durch die Wohnung tanzen.",kt:"Macht drei Lieblingssongs an und tanzt zusammen durchs Wohnzimmer.",min:10,max:15,feel:["energie","okay"],kid:"beides",act:"pause",task:"Tanzen"},
  {id:"dehnen",cat:"bewegung",head:"Lockern",t:"Fünf Minuten dehnen: Nacken, Schultern, Rücken. Ganz sanft.",min:5,max:10,feel:["muede","okay","ueberfordert"],kid:"beides",act:"pause",task:"Dehnen"},
  {id:"flaeche",cat:"aufraeumen",head:"Eine Fläche",t:"Räum {m} Minuten lang eine einzige Fläche frei, zum Beispiel Schreibtisch oder Küchentheke.",min:5,max:15,feel:["energie","okay","muede"],kid:"beides",act:"focus",task:"Eine Fläche aufräumen",tcat:"haushalt"},
  {id:"turbo",cat:"aufraeumen",head:"Turbo-Runde",t:"Musik an und {m} Minuten Turbo-Aufräumen. Wenn die Zeit um ist, hörst du auf.",min:10,max:20,feel:["energie","okay"],kid:"beides",act:"focus",task:"Turbo-Aufräumen",tcat:"haushalt"},
  {id:"schublade",cat:"aufraeumen",head:"Klein, aber fertig",t:"Sortier eine Schublade aus. Danach ist sie fertig, und das fühlt sich gut an.",min:10,max:20,feel:["muede","okay","ueberfordert"],kid:"beides",act:"focus",task:"Eine Schublade sortieren",tcat:"haushalt"},
  {id:"figma-screen",cat:"kreativ",head:"Zeit für Design",t:"Öffne Figma und gestalte einen Screen für eine App-Idee, die dir schon länger im Kopf ist.",min:20,max:60,feel:["energie","okay"],kid:"nein",act:"focus",task:"Figma: App-Screen",tcat:"projekt"},
  {id:"figma-mood",cat:"kreativ",head:"Moodboard",t:"Leg in Figma ein Moodboard an: sechs Farben, zwei Schriften, drei Bilder, die dir gerade gefallen.",min:15,max:30,feel:["energie","okay","muede"],kid:"nein",act:"focus",task:"Figma-Moodboard",tcat:"projekt"},
  {id:"content-ideen",cat:"kreativ",head:"Ideen sammeln",t:"Notier auf Papier drei Ideen für ein Video: nur Titel und erste Szene.",min:10,max:15,feel:["energie","okay","muede"],kid:"beides",act:"focus",task:"Drei Video-Ideen",tcat:"projekt"},
  {id:"content-film",cat:"kreativ",head:"Drehen",t:"Film ein kurzes Video darüber, was du diese Woche gelernt hast. Schneiden kannst du später.",min:20,max:45,feel:["energie"],kid:"nein",act:"focus",task:"Video drehen",tcat:"projekt"},
  {id:"zeichnen",cat:"kreativ",head:"Einfach zeichnen",t:"Zeichne {m} Minuten auf dem iPad oder auf Papier. Ohne Ziel, nur Linien und Formen.",min:10,max:30,feel:["muede","okay","energie","pause"],kid:"nein",act:"focus",task:"Zeichnen",tcat:"projekt"},
  {id:"c4d",cat:"kreativ",head:"3D-Spielerei",t:"Öffne Cinema 4D und probier an einem einfachen Objekt ein neues Material oder Licht aus.",min:30,max:60,feel:["energie","okay"],kid:"nein",act:"focus",task:"Cinema 4D ausprobieren",tcat:"projekt"},
  {id:"code-mini",cat:"lernen",head:"Ein Coding-Häppchen",t:"Löse eine einzige kleine Coding-Aufgabe in JavaScript oder Swift.",min:20,max:40,feel:["energie","okay"],kid:"nein",act:"focus",task:"Coding-Aufgabe",tcat:"lernen"},
  {id:"swiftui",cat:"lernen",head:"Nachbauen lernen",t:"Bau in SwiftUI eine kleine Ansicht nach, die dir in einer App gefällt.",min:30,max:60,feel:["energie"],kid:"nein",act:"focus",task:"SwiftUI nachbauen",tcat:"lernen"},
  {id:"css",cat:"lernen",head:"Ein Detail nachbauen",t:"Bau ein CSS-Detail nach, das dir auf einer Website aufgefallen ist: eine Animation, eine Linie, ein Button.",min:20,max:40,feel:["energie","okay"],kid:"nein",act:"focus",task:"CSS-Detail nachbauen",tcat:"lernen"},
  {id:"figma-feature",cat:"lernen",head:"Etwas Neues in Figma",t:"Lern ein Figma-Feature, das du noch nicht nutzt, zum Beispiel Auto Layout oder Variablen, und probier es direkt aus.",min:15,max:30,feel:["energie","okay","muede"],kid:"nein",act:"focus",task:"Neues Figma-Feature",tcat:"lernen"},
  {id:"typo",cat:"lernen",head:"Mit Designaugen",t:"Nimm dir eine Website, die dir gefällt, und notier dir ihre Schriften, Größen und Abstände.",min:10,max:20,feel:["muede","okay"],kid:"nein",act:"focus",task:"Website analysieren",tcat:"lernen"},
  {id:"buch-liana",cat:"ruhe",head:"Gemeinsam ruhig",t:"Setzt euch zusammen hin und schaut ein Bilderbuch an. Ruhe für euch beide.",min:10,max:20,feel:["muede","pause","ueberfordert","okay"],kid:"ja",act:"pause",task:"Bilderbuch mit Liana"},
  {id:"musik-liana",cat:"ruhe",head:"Kuschelpause",t:"Leg ruhige Musik auf und kuschelt euch {m} Minuten aufs Sofa.",min:5,max:20,feel:["muede","pause","ueberfordert"],kid:"ja",act:"pause",task:"Kuschelpause"}
];
var IDEA_CATS={uni:["lernen"],haushalt:["aufraeumen"],ordnung:["ordnung","aufraeumen"],projekt:["kreativ","lernen"],selbst:["selfcare","essen","ruhe"],entspannen:["ruhe","selfcare","bewegung"],zufall:null};
var FEEL_TXT={energie:"viel Energie",okay:"eine okaye Stimmung",muede:"Müdigkeit",ueberfordert:"wenn es gerade zu viel ist",pause:"eine Pause"};
function pickIdeas(ans,avail,cats,skip,recent,n,rand){
  rand=rand||Math.random;var kid=ans.kid==="ja";
  function ok(i,strictTime){
    if(skip.indexOf("idea:"+i.id)>=0)return false;
    if(i.feel.indexOf(ans.feel)<0)return false;
    if(kid&&i.kid==="nein")return false;if(!kid&&i.kid==="ja")return false;
    if(strictTime&&i.min>avail)return false;
    return !cats||cats.indexOf(i.cat)>=0;
  }
  var pool=IDEAS.filter(function(i){return ok(i,true)});
  if(!pool.length&&cats){var c2=cats;cats=null;pool=IDEAS.filter(function(i){return ok(i,true)});cats=c2}
  var fresh=pool.filter(function(i){return (recent||[]).indexOf(i.id)<0});if(fresh.length>=n)pool=fresh;
  for(var j=pool.length-1;j>0;j--){var r=Math.floor(rand()*(j+1)),tmp=pool[j];pool[j]=pool[r];pool[r]=tmp}
  if(!cats&&(ans.feel==="muede"||ans.feel==="pause")){var calm={ruhe:1,selfcare:1,essen:1};pool.sort(function(a,b){return (calm[b.cat]||0)-(calm[a.cat]||0)})}
  return pool.slice(0,n);
}
function ideaRec(i,ans,avail,hasTasks){
  var m=Math.max(i.min,Math.min(i.max,avail));if(m>avail)m=avail;
  var txt=((ans.kid==="ja"&&i.kt)?i.kt:i.t).replace("{m}",String(m));
  var why=hasTasks?"Passt zu "+FEEL_TXT[ans.feel]+" und deinen "+avail+" Minuten.":"Gerade steht nichts Passendes im Plan. Das hier passt zu "+FEEL_TXT[ans.feel]+".";
  var acts=i.act==="focus"?[{id:"newfocus",label:m+" Min. Fokus starten"},{id:"planpause",label:"Einplanen"},{id:"other",label:"Andere Idee"}]
    :[{id:"pause",label:m+" Min. Timer starten"},{id:"planpause",label:"Einplanen"},{id:"other",label:"Andere Idee"}];
  return {kind:"idea",ideaId:i.id,emoji:"",head:i.head,text:txt,why:why,minutes:m,newTask:{title:i.task,cat:i.tcat||"selbst",dur:m},actions:acts};
}

/* ---------- „Was soll ich jetzt machen?“ ---------- */
function nowMin(d){return d.getHours()*60+d.getMinutes()}
function nextBlock(state,k,nm){var b=blocksFor(state,k).filter(function(x){return x.realStart>=nm})[0];return b||null}
function recommend(state,ans,now,skip,opts){
  skip=skip||[];opts=opts||{};var k=key(now),nm=nowMin(now),avail=+ans.time||30;
  var nb=nextBlock(state,k,nm);if(nb&&nb.realStart-nm<avail){avail=Math.max(5,nb.realStart-nm-5)}
  var feel=ans.feel,need=ans.need,lowEnergy=feel==="muede",tooMuch=feel==="ueberfordert",wantsRest=feel==="pause"||need==="entspannen";
  var open=(state.tasks||[]).filter(function(t){return t.status==="open"&&skip.indexOf(t.id)<0&&(!t.date||t.date<=k)});
  var examSoon=(state.exams||[]).filter(function(e){var d=diffDays(k,e.date);return d>=0&&d<=14}).sort(function(a,b){return a.date<b.date?-1:1})[0];
  function score(t){
    var s=0,u=t.deadline?diffDays(k,t.deadline):30;
    s+=u<0?6:u<=1?5:u<=3?3.5:u<=7?2:0;s+=(4-(t.prio||2));if(t.date&&t.date<k)s+=2;if(t.date===k)s+=1.5;if(t.moved>=2)s+=.5;
    if(examSoon&&t.examId===examSoon.id)s+=2;
    return s;
  }
  function fit(t){return Math.min(+t.dur||30,lowEnergy?Math.min(20,avail):avail)}
  function taskRec(t,emoji,head){
    var m=fit(t),shortened=m<(+t.dur||30),why=[];
    var u=t.deadline?diffDays(k,t.deadline):null;
    if(t.examId){var ex=(state.exams||[]).filter(function(e){return e.id===t.examId})[0];if(ex){var dx=diffDays(k,ex.date);why.push(dx===0?"Die Prüfung ist heute.":dx===1?"Die Prüfung ist morgen.":"Deine Prüfung ist in "+dx+" Tagen.")}}
    else if(u!=null&&u<=0)why.push(u<0?"Das ist schon etwas liegen geblieben.":"Das soll heute fertig werden.");
    else if(u!=null&&u<=3)why.push("Die Frist ist in "+u+" Tagen.");
    if(t.date&&t.date<k)why.push("Das stand eigentlich schon früher an.");
    if(t.date===k&&!why.length)why.push("Das steht für heute in deinem Plan.");
    if(t.moved>=2)why.push("Du hast es schon "+t.moved+"-mal verschoben – ein kleiner Anfang reicht.");
    if(shortened)why.push(lowEnergy?"Du bist müde, deshalb nur ein kurzer Block.":"So passt es in deine Zeit.");
    if(nb&&nb.realStart-nm<(+ans.time||30))why.push("Um "+fromMin(nb.realStart)+" steht „"+nb.title+"“ an.");
    if(!why.length)why.push("Du hast gerade Zeit dafür.");
    var verb=t.cat==="lernen"?(lowEnergy?"Wiederhole":"Lerne"):"Mach";
    var text=t.cat==="lernen"||t.cat==="uni"?(verb+" jetzt "+m+" Minuten: "+t.title.replace(/^Lernen: |^Lernblock: /,"")+"."):("Nimm dir "+m+" Minuten für: "+t.title+".");
    return {kind:"task",emoji:emoji,head:head,text:text,why:why.join(" "),minutes:m,taskId:t.id,
      actions:[{id:"focus",label:m+" Min. Fokus starten"},{id:"plan",label:"In den Tagesplan"},{id:"done",label:"Schon erledigt"},{id:"later",label:"Auf morgen"},{id:"other",label:"Andere Idee"}]};
  }
  function rest(m,head){
    m=Math.min(m||20,avail);
    return {kind:"rest",emoji:"🌿",head:head||"Du darfst langsam machen",text:"Nimm dir "+m+" Minuten nur für dich: eine warme Dusche, etwas Leckeres essen oder eine kleine Pause ohne To-do-Liste.",
      why:"Du musst nicht jede freie Minute produktiv nutzen.",minutes:m,actions:[{id:"pause",label:m+" Min. Pause starten"},{id:"planpause",label:"Pause einplanen"},{id:"other",label:"Andere Idee"}]};
  }
  var recs=[],recent=opts.recent||[],rand=opts.rand;
  function ideas(n,cats){return pickIdeas(ans,avail,cats,skip,recent,n,rand).map(function(i){return ideaRec(i,ans,avail,open.length>0)})}
  if(wantsRest){var calm=ideas(3,feel==="pause"?["ruhe","selfcare","essen"]:IDEA_CATS.entspannen);if(calm.length)recs=recs.concat(calm);else recs.push(rest(feel==="pause"?20:Math.min(30,avail)))}
  if(tooMuch){
    var small=open.slice().sort(function(a,b){return (a.dur||30)-(b.dur||30)||score(b)-score(a)})[0];
    recs.unshift({kind:"small",emoji:"",head:"Wir machen es kleiner",
      text:small?"Wähle nur diese eine Sache und mach 10 Minuten davon: "+small.title+". Wenn selbst das zu viel ist, atme erst einmal fünf Minuten durch.":"Wähle eine einzige kleine Sache. Wenn selbst das gerade zu viel ist, darfst du auch erst einmal fünf Minuten durchatmen.",
      why:open.length?"Du hast "+open.length+" offene Aufgaben – du musst nicht alle auf einmal sehen.":"Gerade wartet nichts Dringendes auf dich.",minutes:5,taskId:small?small.id:null,
      actions:[{id:"pause",label:"5-Minuten-Pause"},small?{id:"focus10",label:"10 Min. mit dieser Aufgabe"}:{id:"newsmall",label:"Kleine Aufgabe anlegen"},{id:"other",label:"Andere Idee"}]});
    recs=recs.concat(ideas(2,["ruhe","ordnung","selfcare","bewegung"]));
  }
  var pool=open.slice();
  var catsFor={uni:["lernen","uni"],haushalt:["haushalt"],ordnung:["privat"],projekt:["projekt"],selbst:["selbst"],zufall:null,entspannen:[]};
  if(!tooMuch&&!wantsRest){
    var cats=catsFor[need];
    if(cats)pool=pool.filter(function(t){return cats.indexOf(t.cat)>=0});
    if(lowEnergy)pool=pool.filter(function(t){return t.cat!=="uni"||(t.deadline&&diffDays(k,t.deadline)<=1)});
    if(ans.kid==="ja")pool=pool.filter(function(t){return t.cat!=="lernen"&&t.cat!=="uni"||(t.deadline&&diffDays(k,t.deadline)<=1)});
    pool.sort(function(a,b){return score(b)-score(a)});
    if(need==="zufall"&&pool.length>1){var top=pool.slice(0,Math.min(4,pool.length));var pick=top[Math.floor(Math.random()*top.length)];pool=[pick].concat(pool.filter(function(t){return t!==pick}))}
    var head={uni:"Dein nächster Schritt",haushalt:"Mach es dir leichter",ordnung:"Kurz Ordnung schaffen",projekt:"Zeit für dein Projekt",selbst:"Kümmer dich um dich",zufall:"Überraschung"}[need]||"Dein nächster Schritt";
    pool.slice(0,3).forEach(function(t){recs.push(taskRec(t,"",head))});
    if(need==="ordnung"&&!pool.length)recs.push({kind:"order",emoji:"",head:"Kurz Ordnung schaffen",text:"Schau dir deine Woche an und lass sie neu verteilen. Das dauert keine fünf Minuten.",why:"Ein klarer Plan nimmt Druck raus.",minutes:5,
        actions:[{id:"replan",label:"Meine Woche neu planen"},{id:"other",label:"Andere Idee"}]});
    // Ideen aus der Bibliothek: Hauptvorschlag, wenn nichts im Plan passt, sonst als Abwechslung
    recs=recs.concat(ideas(pool.length?1:3,IDEA_CATS[need]));
    if(lowEnergy&&recs.length&&recs[0].kind==="task"){var c3=ideas(1,["ruhe","selfcare"]);if(c3.length)recs.splice(1,0,c3[0])}
    if(!recs.length)recs.push({kind:"free",emoji:"",head:"Du hast gerade Luft",text:"Es gibt aktuell keine dringende Aufgabe, die deine Aufmerksamkeit braucht. Du kannst etwas für dich tun, ein Projekt verfolgen oder bewusst entspannen.",
        why:"Nichts ist überfällig oder heute fällig.",minutes:0,actions:[{id:"planpause",label:"Etwas Schönes einplanen"},{id:"replan",label:"Trotzdem planen"},{id:"other",label:"Andere Idee"}]});
  }
  if(!recs.length)recs.push(rest(20));
  var seen={},uniq=[];recs.forEach(function(r){var k2=r.kind==="idea"?"idea:"+r.ideaId:r.kind+":"+r.text;
    if(r.kind==="task"){var tt=(state.tasks||[]).filter(function(t){return t.id===r.taskId})[0];k2=tt&&(tt.cat==="lernen"||tt.cat==="uni")?"learn:"+subjectOf(tt):"t:"+r.taskId}
    if(seen[k2])return;seen[k2]=1;uniq.push(r)});
  if(uniq.length<3){var more=ideas(3,null).filter(function(r){return !seen["idea:"+r.ideaId]});uniq=uniq.concat(more).slice(0,3)}
  return {main:uniq[0],alts:uniq.slice(1,3),avail:avail};
}

/* ---------- Berichte ---------- */
/* warm = gut, Sand = neutral, kühl = schwer; keine Warnfarben */
var MOOD={5:{label:"Richtig gut",emoji:"",color:"#E3346E"},4:{label:"Ganz okay",emoji:"",color:"#F2A0B8"},3:{label:"Neutral",emoji:"",color:"#E6D8C6"},2:{label:"Eher schlecht",emoji:"",color:"#BFC6CC"},1:{label:"Erschöpft",emoji:"",color:"#8E98A3"}};
function avg(a){return a.length?a.reduce(function(x,y){return x+y},0)/a.length:null}
function weekReport(state,ws){
  var days=rangeKeys(ws,addDays(ws,6)),tasks=state.tasks||[],ch=state.checkins||{};
  var done=tasks.filter(function(t){return t.status==="done"&&t.doneDay&&t.doneDay>=ws&&t.doneDay<=days[6]});
  var learnMin=days.map(function(k){return (state.log||{})[k]||0});
  var plannedLearn=tasks.filter(function(t){return (t.cat==="lernen"||t.cat==="uni")&&t.date&&t.date>=ws&&t.date<=days[6]&&t.status!=="dropped"&&t.status!=="split"}).reduce(function(a,t){return a+(+t.dur||0)},0);
  var perDay=days.map(function(k,i){
    var dn=done.filter(function(t){return t.doneDay===k}).length,c=ch[k]||null;
    var plannedMin=tasks.filter(function(t){return t.date===k&&(t.status==="open"||t.status==="done")}).reduce(function(a,t){return a+(+t.dur||0)},0)+fixedMinutes(state,k);
    return {k:k,done:dn,learn:learnMin[i],mood:c?c.mood:null,energy:c?c.energy:null,load:plannedMin};
  });
  var moods=perDay.filter(function(d){return d.mood}).map(function(d){return d.mood}),energies=perDay.filter(function(d){return d.energy}).map(function(d){return d.energy});
  var learnDays=perDay.filter(function(d){return d.learn>0}).length,important=done.filter(function(t){return t.prio===1}).slice(0,4);
  // „voll“ = deutlich mehr als an einem typischen Tag dieser Woche, und nur Tage, die schon vorbei oder heute sind
  var todayK=key(new Date()),past=perDay.filter(function(d){return d.k<=todayK}),med=past.map(function(d){return d.load}).sort(function(a,b){return a-b})[Math.floor(past.length/2)]||0;
  var busiest=past.slice().sort(function(a,b){return b.load-a.load}).filter(function(d){return d.load>=420||(past.length>=3&&d.load>=med*1.4&&d.load>=240)}).slice(0,2);
  var moved=tasks.filter(function(t){return (t.moved||0)>=2&&t.status!=="dropped"&&((t.date&&t.date>=ws&&t.date<=days[6])||t.status==="open")}).sort(function(a,b){return b.moved-a.moved}).slice(0,3);
  var pauses=(state.pauses||[]).filter(function(p){return p.date>=ws&&p.date<=days[6]}).length;
  var wins={};days.forEach(function(k){var c=ch[k];if(c&&c.wins)c.wins.forEach(function(w){wins[w]=(wins[w]||0)+1})});
  var good={};days.forEach(function(k){var c=ch[k];if(c&&c.good)c.good.forEach(function(w){good[w]=(good[w]||0)+1})});
  // Sätze nur aus vorhandenen Daten
  var lines=[],dn=["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
  if(learnDays)lines.push("Du hast diese Woche an "+learnDays+(learnDays===1?" Tag":" Tagen")+" gelernt"+(important.length?" und "+important.length+(important.length===1?" wichtige Aufgabe":" wichtige Aufgaben")+" abgeschlossen":"")+".");
  else if(done.length)lines.push("Du hast diese Woche "+done.length+(done.length===1?" Aufgabe":" Aufgaben")+" erledigt.");
  if(busiest.length)lines.push(busiest.map(function(d){return dn[dow(d.k)]}).join(" und ")+(busiest.length>1?" waren":" war")+" besonders voll. Vielleicht lohnt es sich, nächste Woche weniger auf "+(busiest.length>1?"diese Tage":"diesen Tag")+" zu legen.");
  var ea=avg(energies);if(ea!=null&&energies.length>=2&&ea<=2.2)lines.push("Du hattest diese Woche häufiger wenig Energie. Dein nächster Wochenplan könnte etwas mehr Puffer enthalten.");
  var hard=perDay.filter(function(d){return d.mood&&d.mood<=2&&(d.done>0||d.learn>0)});
  if(hard.length)lines.push("Auch an "+(hard.length===1?"einem schwierigen Tag":hard.length+" schwierigen Tagen")+" hast du etwas geschafft.");
  if(moved.length)lines.push("„"+moved[0].title+"“ wurde öfter verschoben. Vielleicht hilft es, die Aufgabe kleiner zu machen.");
  var topGood=Object.keys(good).filter(function(g){return g!=="nichts"}).sort(function(a,b){return good[b]-good[a]})[0];
  if(topGood&&good[topGood]>=2)lines.push("Was dir mehrmals gutgetan hat: "+topGood+". Das ist eine Beobachtung, keine Regel.");
  return {ws:ws,days:perDay,done:done.length,important:important,learnTotal:learnMin.reduce(function(a,b){return a+b},0),plannedLearn:plannedLearn,
    moodAvg:avg(moods),energyAvg:ea,checkins:moods.length,busiest:busiest,moved:moved,pauses:pauses,wins:wins,good:good,lines:lines};
}
function monthReport(state,y,m){
  var first=new Date(y,m,1),n=new Date(y,m+1,0).getDate(),days=[];
  for(var d=1;d<=n;d++){var k=key(new Date(y,m,d)),c=(state.checkins||{})[k];
    days.push({k:k,mood:c?c.mood:null,energy:c?c.energy:null,learn:(state.log||{})[k]||0,
      done:(state.tasks||[]).filter(function(t){return t.status==="done"&&t.doneDay===k}).length,
      flowers:(state.shelf||[]).filter(function(f){return f.date===k}).length,wins:c&&c.wins?c.wins:[]})}
  var wins={};days.forEach(function(d){d.wins.forEach(function(w){wins[w]=(wins[w]||0)+1})});
  var ms=[];var learnTotal=days.reduce(function(a,d){return a+d.learn},0),doneTotal=days.reduce(function(a,d){return a+d.done},0);
  var flowers=days.reduce(function(a,d){return a+d.flowers},0);
  if(learnTotal>=600)ms.push("Über "+Math.floor(learnTotal/60)+" Stunden gelernt");
  if(flowers>=10)ms.push(flowers+" Blüten gesammelt");
  var bestStreak=0,cur=0;days.forEach(function(d){if(d.learn>0){cur++;bestStreak=Math.max(bestStreak,cur)}else cur=0});
  if(bestStreak>=3)ms.push(bestStreak+" Tage am Stück gelernt");
  var examsDone=(state.exams||[]).filter(function(e){return e.date>=key(first)&&e.date<=days[n-1].k&&e.date<key(new Date())});
  examsDone.forEach(function(e){ms.push((e.kind==="abgabe"?"Abgabe: ":"Prüfung: ")+e.title)});
  return {days:days,wins:wins,learnTotal:learnTotal,doneTotal:doneTotal,flowers:flowers,milestones:ms,
    moodAvg:avg(days.filter(function(d){return d.mood}).map(function(d){return d.mood})),energyAvg:avg(days.filter(function(d){return d.energy}).map(function(d){return d.energy}))};
}

/* ---------- .ics-Import ---------- */
function parseICS(text,from,to){
  var lines=String(text).replace(/\r\n[ \t]/g,"").replace(/\n[ \t]/g,"").split(/\r?\n/),evs=[],cur=null;
  function dt(v,params){
    var allDay=/VALUE=DATE(?!-)/.test(params)||/^\d{8}$/.test(v);
    var m=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);if(!m)return null;
    var d;
    if(allDay||!m[4])d=new Date(+m[1],+m[2]-1,+m[3]);
    else if(m[7])d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]));
    else d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);           // TZID: als lokale Zeit behandeln
    return {d:d,allDay:!!(allDay||!m[4])};
  }
  lines.forEach(function(l){
    if(l==="BEGIN:VEVENT"){cur={};return}
    if(l==="END:VEVENT"){if(cur&&cur.start)evs.push(cur);cur=null;return}
    if(!cur)return;
    var i=l.indexOf(":");if(i<0)return;var head=l.slice(0,i),val=l.slice(i+1),name=head.split(";")[0],params=head.slice(name.length);
    if(name==="SUMMARY")cur.title=val.replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\n/gi," ").trim();
    else if(name==="DTSTART")cur.start=dt(val,params);
    else if(name==="DTEND")cur.end=dt(val,params);
    else if(name==="RRULE")cur.rrule=val;
    else if(name==="UID")cur.uid=val;
    else if(name==="EXDATE"){cur.ex=(cur.ex||[]).concat(val.split(",").map(function(v){var x=dt(v,params);return x?key(x.d):null}))}
  });
  var out=[],BYDAY={MO:0,TU:1,WE:2,TH:3,FR:4,SA:5,SU:6};
  evs.forEach(function(e){
    var s=e.start.d,en=e.end?e.end.d:null,allDay=e.start.allDay,dur=en?Math.round((en-s)/60000):60;
    function push(day){
      var k=key(day);if(k<from||k>to||(e.ex&&e.ex.indexOf(k)>=0))return;
      out.push({id:(e.uid||uid())+"@"+k,title:e.title||"Termin",date:k,allDay:allDay,
        start:allDay?null:fromMin(s.getHours()*60+s.getMinutes()),end:allDay?null:fromMin(Math.min(1439,s.getHours()*60+s.getMinutes()+dur))});
    }
    if(e.rrule&&/FREQ=WEEKLY/.test(e.rrule)){
      var r={};e.rrule.split(";").forEach(function(p){var kv=p.split("=");r[kv[0]]=kv[1]});
      var interval=+r.INTERVAL||1,until=r.UNTIL?dt(r.UNTIL,""):null,count=+r.COUNT||0;
      var days=r.BYDAY?r.BYDAY.split(",").map(function(x){return BYDAY[x.slice(-2)]}):[dow(key(s))];
      var ws=parse(weekStart(key(s))),n=0;
      for(var w=0;w<160;w++){
        for(var di=0;di<7;di++){
          if(days.indexOf(di)<0)continue;var day=new Date(ws);day.setDate(ws.getDate()+w*7*interval+di);
          if(day<parse(key(s)))continue;if(until&&day>until.d)return;if(count&&n>=count)return;n++;
          if(key(day)>to)return;push(day);
        }
      }
    }else if(e.rrule&&/FREQ=DAILY/.test(e.rrule)){
      var r2={};e.rrule.split(";").forEach(function(p){var kv=p.split("=");r2[kv[0]]=kv[1]});
      var until2=r2.UNTIL?dt(r2.UNTIL,""):null,count2=+r2.COUNT||0;
      for(var i=0;i<400;i++){var day2=new Date(s);day2.setDate(s.getDate()+i);if(until2&&day2>until2.d)break;if(count2&&i>=count2)break;if(key(day2)>to)break;push(day2)}
    }else push(s);
  });
  return out;
}

root.KompassLogic={IDEAS:IDEAS,pickIdeas:pickIdeas,key:key,parse:parse,addDays:addDays,diffDays:diffDays,dow:dow,weekStart:weekStart,rangeKeys:rangeKeys,toMin:toMin,fromMin:fromMin,uid:uid,
  CATS:CATS,MOOD:MOOD,defaultProfile:defaultProfile,blocksFor:blocksFor,freeIntervals:freeIntervals,capacityFor:capacityFor,dayLoad:dayLoad,
  mkTask:mkTask,planWeek:planWeek,recommend:recommend,weekReport:weekReport,monthReport:monthReport,parseICS:parseICS,fixedMinutes:fixedMinutes};
})(typeof window!=="undefined"?window:globalThis);
