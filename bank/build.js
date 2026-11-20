const fs=require('fs'),crypto=require('crypto');
const hash=s=>crypto.createHash('sha1').update(s).digest('hex').slice(0,10);
let all=JSON.parse(fs.readFileSync(__dirname+'/00_eksisterende.json'));
for(const f of ['01_kart_fossiler','02_tid_vulkaner','03_plate_landskap','04_resten']) all=all.concat(require('./'+f));
all=all.map(q=>{let t=q[0];if(t==='Bergarter')t=q[1].startsWith('Metamorfe')?'Metamorfe bergarter':'Magmatiske bergarter';
 const opts=q[2]==='TF'?'TF':q[2];
 if(opts!=='TF'&&(q[3]>=opts.length||opts.length<2))throw Error('bad '+q[1]);
 return {id:hash(q[1]),t,q:q[1],o:opts,a:q[3],e:q[4]};});

// Ekte eksamener: egne faste sett, og spørsmålene legges også i banken (merket med src)
const TOPICS=new Set(all.map(q=>q.t));
const exams={};
for(const [year,file] of [['2024','05_eksamen_2024'],['2025','06_eksamen_2025']]){
  exams[year]=require('./'+file).sort((x,y)=>x[0]-y[0]).map(r=>{
    const [nr,t,q,o,a,e,img]=r;
    if(img&&!fs.existsSync(__dirname+'/../public/img/'+img))throw Error('mangler bilde '+img);
    if(!TOPICS.has(t))throw Error('ukjent tema '+t+' i '+year+' nr '+nr);
    const n=o==='TF'?2:o.length;(Array.isArray(a)?a:[a]).forEach(i=>{if(i<0||i>=n)throw Error('fasit '+year+' '+nr)});
    return {id:hash('E'+year+'|'+q+(img?'|'+img:'')),t,q,o,a,e,src:'Eksamen '+year+' oppg. '+nr,nr,...(img?{img}:{})};
  });
  all=all.concat(exams[year]);
}
// Bildequiz: foto og tegninger av fossiler, bergarter og mineraler
const B=JSON.parse(fs.readFileSync(__dirname+'/07_bilder.json'));
const images=B.items.map(it=>{
  if(!fs.existsSync(__dirname+'/../public/img/'+it.f))throw Error('mangler bilde '+it.f);
  if(!B.info[it.n])throw Error('mangler info '+it.n);
  return {id:hash('B|'+it.f),...it};
});
const ids=new Set();images.forEach(x=>{if(ids.has(x.id))throw Error('DUP bilde '+x.f);ids.add(x.id)});all.forEach(q=>{if(ids.has(q.id))throw Error('DUP '+q.q);ids.add(q.id)});
const c={};all.forEach(q=>c[q.t]=(c[q.t]||0)+1);console.log(c,all.length);
fs.writeFileSync(__dirname+'/../public/questions.js','window.QUESTIONS='+JSON.stringify(all)+';\nwindow.REAL_EXAMS='+JSON.stringify(Object.fromEntries(Object.entries(exams).map(([y,qs])=>[y,qs.map(q=>q.id)])))+';\nwindow.IMAGES='+JSON.stringify({items:images,info:B.info})+';');
