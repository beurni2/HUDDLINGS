# Founder pack: sheet | before the fur note (6dc6ac6) | now, cropped from each commit's phone.png (aligned panels).
import os, sys, json
from PIL import Image, ImageDraw, ImageFont
import numpy as np
# The folder holding before_<view>.png and now_<view>.png (each commit's qa/phase3/<view>/phone.png) and boxes.json.
P=os.environ.get('PACK', os.path.dirname(os.path.abspath(__file__)))+'/'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(n):
    try: return ImageFont.truetype(FONT, n)
    except Exception: return ImageFont.load_default()
def panels(path):
    im=Image.open(path).convert('RGB'); a=np.asarray(im).astype(int); h,w,_=a.shape
    white=(a.min(axis=2)>=250).mean(axis=0)
    mid=[x for x in range(int(w*.3),int(w*.7)) if white[x]>0.98]
    l,r=mid[0],mid[-1]+1
    return im.crop((0,22,l,h)), im.crop((r,22,w,h))
VIEWS=['front','threeQuarter.L','threeQuarter.R','side.L','side.R','back']
NAMES={'front':'Front','threeQuarter.L':'Three-quarter, facing left','threeQuarter.R':'Three-quarter, facing right','side.L':'Side, facing left','side.R':'Side, facing right','back':'Back'}
def get(v):
    sheet,_=panels(P+f'now_{v}.png'); _,before=panels(P+f'before_{v}.png'); _,now=panels(P+f'now_{v}.png')
    return sheet,before,now
def row(ims, heads, title, scale=1.0, gap=12):
    ims=[i.resize((int(i.width*scale),int(i.height*scale)), Image.LANCZOS) for i in ims]
    th=46 if title else 0; hh=40
    W=sum(i.width for i in ims)+gap*(len(ims)-1); H=th+hh+max(i.height for i in ims)
    out=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(out)
    if title: d.text((4,6),title,fill=(30,30,30),font=font(30))
    x=0
    for i,hd in zip(ims,heads):
        d.text((x+4,th+6),hd,fill=(90,90,90),font=font(24)); out.paste(i,(x,th+hh)); x+=i.width+gap
    return out
def stack(rows, gap=28):
    W=max(r.width for r in rows); H=sum(r.height for r in rows)+gap*(len(rows)-1)
    out=Image.new('RGB',(W,H),'white'); y=0
    for r in rows: out.paste(r,(0,y)); y+=r.height+gap
    return out
HEADS=['Sheet','Before your note','Now']
if sys.argv[1]=='views':
    for name,vs in [('views_1.png',VIEWS[:3]),('views_2.png',VIEWS[3:])]:
        stack([row(list(get(v)),HEADS,NAMES[v]) for v in vs]).save(P+name)
elif sys.argv[1]=='zooms':
    boxes=json.load(open(P+'boxes.json'))
    for v,items in boxes.items():
        rows=[]
        for label,(x0,y0,x1,y1) in items:
            ims=[i.crop((x0,y0,x1,y1)) for i in get(v)]
            s=min(3.0, 480/ims[0].width)
            rows.append(row(ims,HEADS,label,scale=s))
        stack(rows).save(P+f'zoom_{v}.png')
