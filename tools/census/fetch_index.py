# Fetch all x402 listings from 402index into index.json (step 1 of the census)
import json,urllib.request
out=[];off=0
while True:
    d=json.load(urllib.request.urlopen(urllib.request.Request(f"https://402index.io/api/v1/services?limit=500&offset={off}&protocol=x402",headers={"User-Agent":"nightshift-census"}),timeout=60))
    s=d.get("services",[])
    if not s: break
    out+=s; off+=len(s)
json.dump(out,open("index.json","w")); print(len(out))
