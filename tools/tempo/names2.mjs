import fs from 'fs'; import {keccak256,toHex} from 'viem';
const fp=JSON.parse(fs.readFileSync('fingerprints.json'));
for(const h of fs.readFileSync('extra_hosts.txt','utf8').split('\n').filter(Boolean)) for (const v of [h, h.replace(/^www\./,'')]) { const k=keccak256(toHex(v)).slice(0,22); if(!fp[k]) fp[k]={realm:v,name:v}; }
fs.writeFileSync('fingerprints.json',JSON.stringify(fp)); console.log(Object.keys(fp).length);
