import re
import json,sys
src,adm,out=sys.argv[1:4]
a1={}
for l in open(adm,encoding='utf8'):
    p=l.rstrip('\n').split('\t'); a1[p[0]]=p[2]
rows=[]
for l in open(src,encoding='utf8'):
    p=l.rstrip('\n').split('\t')
    name=p[2] or p[1]; cc=p[8]; ad=p[10]
    alts=0
    if int(p[14] or 0)>=300000:
        import unicodedata
        def n(x): return ' '.join(re.sub(r'[^a-z0-9 ]+',' ',unicodedata.normalize('NFD',x).encode('ascii','ignore').decode().lower()).split())
        al=sorted({n(a) for a in [p[1]]+p[3].split(',') if a and all(ord(ch)<0x250 for ch in a)}-{n(name),''})
        alts='|'.join(al) if al else 0
    rows.append([name,alts,cc,a1.get(f"{cc}.{ad}",""),ad,round(float(p[4]),4),round(float(p[5]),4),int(p[14] or 0),p[17]])
rows.sort(key=lambda r:-r[7])
open(out,'w').write("export default "+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+";\n")
print(len(rows))
