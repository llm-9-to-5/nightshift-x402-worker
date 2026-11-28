import fs from 'fs'; import {keccak256,toHex} from 'viem';
const S=JSON.parse(fs.readFileSync('services.json')).services;
const cand=new Map();
const add=(r,name)=>{ if(!r) return; for (const v of [r, r.replace(/^https?:\/\//,'').replace(/\/.*$/,'')]) { if(!cand.has(v)) cand.set(v,name);} };
for(const s of S){ add(s.realm,s.name); for(const u of [s.serviceUrl,s.url]) if(u){ try{const h=new URL(u).host; add(h,s.name); add(h.replace(/^www\./,''),s.name);}catch{} } }
for(const h of fs.readFileSync('mppscan_hosts.txt','utf8').split('\n').filter(Boolean)){ try{const x=new URL(h).host; add(x,x);}catch{} }
const fp={}; for(const [r,n] of cand) fp[keccak256(toHex(r)).slice(0,22)]={realm:r,name:n};
fs.writeFileSync('fingerprints.json',JSON.stringify(fp,null,0)); console.log(Object.keys(fp).length);
