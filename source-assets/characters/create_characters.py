"""Author the lounge's original people. No imported geometry, rigs, motion or textures.

Run with Python 3.10+: python source-assets/characters/create_characters.py
Coordinates: metres, +Y up, +Z forward. The glTF contains a real weighted skeleton.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import random
import struct
import zlib

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'public/assets/models/characters/original'
TAU = math.tau


def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def unit(a): return mul(a, 1 / max(1e-12, math.sqrt(dot(a, a))))
def lerp(a, b, t): return tuple(x + (y-x)*t for x, y in zip(a, b))
def ease(t): return t*t*(3-2*t)
def quat(x=0., y=0., z=0.):
    a,b,c,d,e,f = math.sin(x/2),math.cos(x/2),math.sin(y/2),math.cos(y/2),math.sin(z/2),math.cos(z/2)
    return (a*d*f+b*c*e, b*c*f-a*d*e, b*d*e+a*c*f, b*d*f-a*c*e)
def rgba(code):
    values = [int(code[i:i+2], 16)/255 for i in (0,2,4)]
    return [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values] + [1]


def png(width, height, pixels):
    def chunk(tag, data): return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    raw=b''.join(b'\0'+bytes(pixels[y*width*3:(y+1)*width*3]) for y in range(height))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')


class Character:
    def __init__(self, spec, game=False):
        self.spec=spec; self.scale=spec['height']/1.73; self.female=spec['female']
        self.game=game; self.file_id=spec['id']+('_game' if game else '')
        self.width=.92 if self.female else 1.
        self.slot='body'; self.option='base'
        self.bones=[]; self.bone_id={}; self.parts={}; self.materials=[]; self.material_id={}
        self.binary=bytearray(); self.views=[]; self.accessors=[]; self.images=[]; self.textures=[]
        self.make_rig(); self.make_materials()

    def bone(self, name, position, parent=None):
        index=len(self.bones); self.bone_id[name]=index
        self.bones.append({'name':name,'position':position,'parent':self.bone_id[parent] if parent else None})

    def make_rig(self):
        for name, point, parent in [('Hips',(0,.92,0),None),('Spine',(0,1.10,0),'Hips'),('Chest',(0,1.31,0),'Spine'),
            ('Neck',(0,1.46,0),'Chest'),('Head',(0,1.54,0),'Neck')]: self.bone(name,point,parent)
        for side, sign in [('L',-1),('R',1)]:
            self.bone('Thigh.'+side,(sign*.095,.88,0),'Hips')
            self.bone('Shin.'+side,(sign*.095,.45,0),'Thigh.'+side)
            self.bone('Foot.'+side,(sign*.095,.09,0),'Shin.'+side)
            self.bone('UpperArm.'+side,(sign*.19*self.width,1.385,0),'Chest')
            self.bone('Forearm.'+side,(sign*.25*self.width,1.12,.022),'UpperArm.'+side)
            self.bone('Hand.'+side,(sign*.26*self.width,.895,.045),'Forearm.'+side)
            for finger in range(5):
                self.bone(f'Finger{finger}.{side}',(sign*(.26*self.width+(finger-1.5)*.016),.823 if finger<4 else .855,.052 if finger<4 else .020),'Hand.'+side)
            self.bone('Lid.'+side,(sign*.032,1.594,.070),'Head')

    def mat(self, name, color, rough=.8, texture=None):
        value={'name':name,'pbrMetallicRoughness':{'baseColorFactor':rgba(color),'metallicFactor':0.,'roughnessFactor':rough}}
        if texture is not None: value['pbrMetallicRoughness']['baseColorTexture']={'index':texture}
        self.material_id[name]=len(self.materials); self.materials.append(value)

    def image(self, name, data):
        view=self.buffer(data)
        self.images.append({'name':name,'bufferView':view,'mimeType':'image/png'})
        self.textures.append({'source':len(self.images)-1,'sampler':0}); return len(self.textures)-1

    def make_materials(self):
        rng=random.Random(81); size=128; pixels=[]
        for y in range(size):
            for x in range(size):
                weave=253 + .6*math.sin(x*math.pi/2)*math.sin(y*math.pi/2)+rng.uniform(-.6,.6)
                pixels.extend([max(0,min(255,round(weave)))]*3)
        fabric=self.image('Original woven cotton',png(size,size,pixels))
        size=256; pixels=[]
        for y in range(size):
            for x in range(size):
                u=x/size; v=1-y/size; noise=rng.uniform(-1.5,1.5)
                cheek=sum(math.exp(-((u-c)/.052)**2-((v-.38)/.12)**2) for c in (.085,.915))
                beard=0 if self.female else (5 if v<.30 and min(u,1-u)<.18 and rng.random()<.17 else 0)
                pixels.extend([round(max(0,min(255,252+noise-beard))),round(max(0,min(255,251+noise-cheek*13-beard))),round(max(0,min(255,250+noise-cheek*9-beard)))])
        face=self.image('Original face tone and pores',png(size,size,pixels))
        self.mat('Skin',self.spec['skin'],.76); self.mat('Face',self.spec['skin'],.72,face)
        shadow=self.spec['skin']; self.mat('SkinShadow',''.join(f'{round(int(shadow[i:i+2],16)*.83):02x}' for i in (0,2,4)),.85)
        self.mat('Cotton',self.spec['shirt'],.93,fabric); self.mat('Denim',self.spec['pants'],.96,fabric)
        self.mat('Trim',self.spec['trim'],.9); self.mat('Hair',self.spec['hair'],.87)
        self.mat('HairStrands',self.spec['hairLight'],.90); self.mat('Shoe','27303b',.7)
        self.mat('Accent',self.spec['trim'],.93,fabric); self.mat('Frames','343139',.55)
        self.mat('Sole','d4d4ce',.95); self.mat('EyeWhite','e6dfd1',.38)
        self.mat('Iris',self.spec['iris'],.42); self.mat('Pupil','11181c',.35)
        self.mat('Lips',self.spec['lips'],.78); self.mat('Seam',self.spec['seam'],.95)
        self.mat('Badge','c6b27b',.5); self.mat('Catchlight','ffffff',.15)

    def weight(self, name): return [(self.bone_id[name],1.)]

    def torso_weight(self, point):
        y=point[1]; levels=[(.92,'Hips'),(1.10,'Spine'),(1.31,'Chest'),(1.46,'Neck')]
        for (a,an),(b,bn) in zip(levels,levels[1:]):
            if y<=b:
                t=max(0,min(1,(y-a)/(b-a))); return [(self.bone_id[an],1-t),(self.bone_id[bn],t)]
        return self.weight('Neck')

    def patch(self, vertices, faces, material, weights, uvs=None, fitted=False):
        key=(self.slot,self.option,material)
        part=self.parts.setdefault(key,{'vertices':[],'faces':[],'weights':[],'uvs':[]})
        offset=len(part['vertices'])
        if self.female and not fitted and (self.slot in ('top','neckwear') or material=='Lining'):
            vertices=[(x,y,z+self.bust_depth(x,y,z)) for x,y,z in vertices]
        part['vertices'].extend([tuple(v*self.scale for v in point) for point in vertices])
        part['faces'].extend([tuple(offset+i for i in face) for face in faces])
        part['weights'].extend([weights(point) if callable(weights) else weights for point in vertices])
        part['uvs'].extend(uvs or [(0,0)]*len(vertices))

    def tube(self, points, radii, material, weights, segments=24, cap=True):
        if self.game: segments=max(6,round(segments*.45))
        vertices=[]; uvs=[]; faces=[]
        for ring,(point,(rx,rz)) in enumerate(zip(points,radii)):
            tangent=unit(sub(points[min(ring+1,len(points)-1)],points[max(0,ring-1)]))
            axis=unit(cross(tangent,(0,0,1) if abs(tangent[2])<.95 else (0,1,0))); other=unit(cross(axis,tangent))
            for k in range(segments+1):
                angle=TAU*k/segments
                vertices.append(add(point,add(mul(axis,math.sin(angle)*rx),mul(other,math.cos(angle)*rz))))
                uvs.append((k/segments,ring/(len(points)-1)))
        for ring in range(len(points)-1):
            for k in range(segments):
                a=ring*(segments+1)+k; b=a+1; c=a+segments+1; d=c+1
                faces.extend([(a,b,c),(b,d,c)])
        if cap:
            for ring,flip in [(0,True),(len(points)-1,False)]:
                center=len(vertices); vertices.append(points[ring]); uvs.append((.5,.5)); base=ring*(segments+1)
                faces.extend([(center,base+k+1,base+k) if flip else (center,base+k,base+k+1) for k in range(segments)])
        self.patch(vertices,faces,material,weights,uvs)

    def ellipsoid(self, center, radii, material, bone, segments=20, rings=12):
        if self.game: rings=max(5,round(rings*.5))
        points=[]; sizes=[]
        for i in range(rings+1):
            angle=math.pi*i/rings; points.append((center[0],center[1]-radii[1]*math.cos(angle),center[2]))
            sizes.append((max(.00001,radii[0]*math.sin(angle)),max(.00001,radii[2]*math.sin(angle))))
        self.tube(points,sizes,material,self.weight(bone),segments)

    def line(self, points, radius, material, bone, segments=8):
        self.tube(points,[(radius,radius)]*len(points),material,self.weight(bone),segments)

    def garment_trim(self, points, radius):
        # Sample long seams on the curved cloth before applying the bust contour.
        samples=[]
        for a,b in zip(points,points[1:]):
            steps=max(1,math.ceil(math.dist(a,b)/.024)) if self.female else 1
            samples.extend(lerp(a,b,i/steps) for i in range(steps))
        samples.append(points[-1])
        self.tube(samples,[radius]*len(samples),'Accent',self.torso_weight,8)

    def cloth_front(self,x,y):
        # Cross-sections tilt with the torso centreline. Interpolate their front at x, y.
        profile=[]
        for i,((_,h,z),(rx,rz)) in enumerate(zip(self.top_centres,self.top_radii)):
            prev=self.top_centres[max(0,i-1)]
            nxt=self.top_centres[min(i+1,len(self.top_centres)-1)]
            _,up,forward=unit(sub(nxt,prev))
            depth=rz*math.sqrt(max(0,1-(x/rx)**2))
            profile.append((h-forward*depth,z+up*depth))
        for (a,za),(b,zb) in zip(profile,profile[1:]):
            if a<=y<=b: return za+(zb-za)*(y-a)/(b-a)
        return min(profile,key=lambda point:abs(point[0]-y))[1]

    def cloth_panel(self, corners, triangles):
        # Clip the actual front facets to each flat pattern. The resulting trim
        # follows even the coarsest game mesh at the bust and at bent seams.
        vertices=[]; faces=[]
        def side(a,b,p):
            return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
        for indices in triangles:
            outline=[corners[i] for i in indices]
            if side(*outline)<0: outline.reverse()
            for facet in self.front_facets:
                polygon=facet
                for a,b in zip(outline,outline[1:]+outline[:1]):
                    if not polygon: break
                    clipped=[]
                    for p,q in zip(polygon,polygon[1:]+polygon[:1]):
                        s,t=side(a,b,p),side(a,b,q)
                        if s>=0: clipped.append(p)
                        if (s<0<t) or (t<0<s): clipped.append(lerp(p,q,s/(s-t)))
                    polygon=clipped
                if len(polygon)<3: continue
                start=len(vertices)
                vertices.extend((x,y,z+.0015) for x,y,z in polygon)
                faces.extend((start,start+i,start+i+1) for i in range(1,len(polygon)-1))
        self.patch(vertices,faces,'Accent',self.torso_weight,fitted=True)

    def select_part(self, slot, option):
        self.slot=slot; self.option=option

    def arm_shape(self, side):
        sign=-1 if side=='L' else 1; w=self.width
        shoulder=(sign*.19*w,1.385,0); elbow=(sign*.25*w,1.12,.022); wrist=(sign*.26*w,.895,.045)
        points=[lerp(shoulder,elbow,t) for t in [0,.12,.3,.5,.7,.9,1]]+[lerp(elbow,wrist,t) for t in [.2,.4,.65,.85,1]]
        radii=[(.066*w,.067),(.075*w,.071),(.071*w,.067),(.063*w,.061),(.055*w,.055),(.045*w,.047),(.042*w,.044),
               (.043*w,.045),(.043*w,.044),(.036*w,.039),(.028*w,.031),(.025*w,.029)]
        def weights(p):
            t=max(0,min(1,(1.18-p[1])/.12)); return [(self.bone_id['UpperArm.'+side],1-t),(self.bone_id['Forearm.'+side],t)]
        return points,radii,weights

    def leg_weights(self, side):
        def weights(p):
            t=max(0,min(1,(.505-p[1])/.11)); return [(self.bone_id['Thigh.'+side],1-t),(self.bone_id['Shin.'+side],t)]
        return weights

    def bust_depth(self, x, y, z):
        # Fit in unscaled body coordinates so the garment, seams and scarf deform together.
        if z<=0 or y<1.15 or y>1.43:
            return 0
        forward=ease(min(1,z/.076))
        centre_y=1.275+.10*(abs(x)-.064)
        vertical_radius=.065 if y<centre_y else .092
        vertical=max(0,1-((y-centre_y)/vertical_radius)**2)**2
        lobes=sum(math.exp(-((x-side*.067)/.061)**2) for side in [-1,1])
        return self.spec['bust_depth']*forward*vertical*lobes

    def bodice_rows(self):
        rows=[(.99,.132,.095,0),(1.06,.133,.092,.005),(1.14,.145,.096,.006),(1.22,.166,.112,.014),
              (1.30,.193,.118,.014),(1.36,.209,.112,.005),(1.40,.206,.100,-.005),(1.43,.165,.084,0),(1.455,.070,.052,0)]
        if not self.female: return rows
        # Add contours between the underbust and upper chest in both detail levels.
        detailed=[]
        for lower,upper in zip(rows,rows[1:]):
            detailed.append(lower)
            if 1.14<=lower[0]<1.36:
                detailed.extend(lerp(lower,upper,t) for t in (1/3,2/3))
        return detailed+[rows[-1]]

    def make_body(self):
        w=self.width
        # Every outfit shares this original body, hands and weighted skeleton.
        self.select_part('body','base')
        if self.female:
            self.mat('Lining','68565d',.96)
            rows=self.bodice_rows()
            self.tube([(0,y,z) for y,x,d,z in rows],[(x*w*.86,d*.80) for y,x,d,z in rows],
                      'Lining',self.torso_weight,36)
        self.tube([(0,1.435,0),(0,1.48,0),(0,1.525,0)],[(.047,.045),(.045,.042),(.043,.041)],'Skin',self.weight('Neck'),28)
        for side,sign in [('L',-1),('R',1)]:
            points,radii,weights=self.arm_shape(side)
            self.tube(points,radii,'Skin',weights,24)
            self.ellipsoid((sign*.183*w,1.365,-.002),(.068*w,.070,.070),'Skin','Chest',24,12)
            self.ellipsoid((sign*.26*w,.858,.050),(.034,.063,.018),'Skin','Hand.'+side,20,12)
            for finger in range(4):
                x=sign*(.26*w+(finger-1.5)*.016); length=[.056,.069,.065,.049][finger]; bone=f'Finger{finger}.{side}'
                points=[(x,.829,.052),(x,.815,.055),(x,.829-length*.57,.057),(x,.829-length,.060)]
                self.tube(points,[(.008,.009),(.008,.009),(.0068,.0075),(.0035,.005)],'Skin',self.weight(bone),12)
                self.ellipsoid((x,.835-length,.065),(.0043,.007,.0016),'Trim',bone,10,6)
            x=sign*.26*w
            self.tube([(x-sign*.026,.874,.044),(x-sign*.043,.854,.051),(x-sign*.049,.832,.059)],
                      [(.011,.012),(.010,.011),(.005,.007)],'Skin',self.weight('Finger4.'+side),14)
        for style in self.top_styles(): self.make_top(style)
        for style in ['jeans','chinos','joggers','shorts']: self.make_bottoms(style)
        if self.female:
            for style in SKIRTS: self.make_skirt(style)
        for style in ['sneakers','high_tops','boots','loafers']: self.make_shoes(style)
        self.make_accessories()
        self.select_part('body','base')

    def top_styles(self):
        return TOPS + (['wrap_blouse'] if self.female else [])

    def make_top(self, style):
        self.select_part('top',style); w=self.width
        rows=self.bodice_rows()
        # An untucked hoodie clears the waistband instead of intersecting its surface.
        if style=='hoodie': rows=[(y,x+.025 if y<1.1 else x,d+.012 if y<1.1 else d,z) for y,x,d,z in rows]
        baggy=.009 if style=='hoodie' else .004 if style=='overshirt' else 0
        if style=='wrap_blouse':
            rows=[(y,x*.94 if 1.04<y<1.22 else x,d,z) for y,x,d,z in rows]
            rows[0]=(.985,.118,.080,-.002)
        self.top_centres=[(0,y,z) for y,x,d,z in rows]
        self.top_radii=[(x*w+baggy,d+baggy) for y,x,d,z in rows]
        self.tube(self.top_centres,self.top_radii,'Cotton',self.torso_weight,40)
        if style in ('tshirt','raglan','blazer'):
            bodice=self.parts[(self.slot,self.option,'Cotton')]
            points=[mul(p,1/self.scale) for p in bodice['vertices']]
            self.front_facets=[[points[a],points[b],points[c]] for a,b,c in bodice['faces']
                               if cross(sub(points[b],points[a]),sub(points[c],points[a]))[2]>1e-10]
        for side,sign in [('L',-1),('R',1)]:
            points,radii,weights=self.arm_shape(side)
            long=style in ['hoodie','overshirt','blazer']; count=len(points) if long else 5
            material='Accent' if style=='raglan' else 'Cotton'
            if style=='wrap_blouse':
                radii=[(rx*size,rz*size) for (rx,rz),size in zip(radii,[1,1.18,1.22,1.15,1]+[1]*7)]
            self.tube(points[:count],[(rx+.004+baggy,rz+.005+baggy) for rx,rz in radii[:count]],material,weights,24)
            self.ellipsoid((sign*.183*w,1.365,-.002),(.073*w+baggy,.075+baggy,.075+baggy),material,'Chest',24,12)
            a,b=(points[-2],points[-1]) if long else (lerp(points[0],points[6],.66),lerp(points[0],points[6],.70))
            self.tube([a,b],[(.031+baggy,.035+baggy)]*2 if long else [(.061*w,.061)]*2,'Accent',self.weight('Forearm.'+side if long else 'UpperArm.'+side),24)
        self.tube([(0,1.440,0),(0,1.452,0)],[(.074*w,.056)]*2,'Accent',self.torso_weight,32)
        if style=='wrap_blouse':
            # Two overlapping front panels with a bound diagonal edge and tie waist.
            edge=[(-.071,1.439,.058),(-.045,1.402,.102),(0,1.362,.122),(.064,1.299,.131),(.104,1.226,.118),(.112,1.106,.077)]
            self.garment_trim(edge,(.004,.003))
            self.tube([(0,1.079,.005),(0,1.102,.005)],[(.137*w,.098)]*2,'Accent',self.torso_weight,32)
            for direction in [-1,1]:
                points=[(.101,1.092,.080),(.111+direction*.008,1.048,.080),(.115+direction*.016,1.014,.073)]
                self.tube(points,[(.009,.004),(.008,.004),(.006,.003)],'Accent',self.torso_weight,10)
        if style in ['polo','overshirt']:
            self.patch([(-.062,1.452,.043),(-.085,1.415,.075),(-.024,1.401,.096),(0,1.443,.061),
                        (.062,1.452,.043),(.085,1.415,.075),(.024,1.401,.096)],
                       [(0,1,2),(0,2,3),(4,3,6),(4,6,5)],'Accent',self.torso_weight)
            ys=[1.385,1.36] if style=='polo' else [1.38,1.32,1.26,1.20,1.14,1.08]
            for y in ys: self.ellipsoid((0,y,.109 if y>1.34 else .133 if y>1.22 else .119),(.0035,.0035,.002),'Badge','Chest' if y>1.3 else 'Spine',10,6)
        if style in ['tshirt','raglan']:
            for y in [1.26,1.29]:
                self.cloth_panel([(-.125*w,y),(.125*w,y),(.125*w,y+.010),(-.125*w,y+.010)],[(0,1,2),(0,2,3)])
        if style=='hoodie':
            self.tube([(-.087,1.415,-.056),(-.075,1.448,-.095),(0,1.468,-.125),(.075,1.448,-.095),(.087,1.415,-.056)],
                      [(.030,.036)]*5,'Cotton',self.torso_weight,20)
            for sign in [-1,1]:
                cord=[(sign*.052,y,self.cloth_front(sign*.052,y)+.004) for y in [1.425,1.40,1.37,1.34,1.32]]
                self.garment_trim(cord,(.0025,.0025))
            self.line([(-.073,1.10,.105),(-.073,1.17,.123),(0,1.18,.127),(.073,1.17,.123),(.073,1.10,.105)],.003,'Accent','Spine')
            self.tube([(0,.995,0),(0,1.022,0)],[(.161*w+baggy,.121)]*2,'Accent',self.torso_weight,32)
        if style=='blazer':
            self.cloth_panel([(-.067,1.426),(-.105,1.36),(-.035,1.24),(-.042,1.40),
                              (.067,1.426),(.105,1.36),(.035,1.24),(.042,1.40)],[(0,1,2),(0,2,3),(4,7,6),(4,6,5)])
            badge=[(x,1.33,self.cloth_front(x,1.33)+.005) for x in [-.11,-.095,-.075]]
            self.tube(badge,[(.005,.003)]*3,'Badge',self.torso_weight,8)
            for y in [1.14,1.195,1.25]: self.ellipsoid((.015,y,self.cloth_front(.015,y)+.003),(.005,.005,.003),'Badge','Spine',10,6)

    def make_bottoms(self, style):
        self.select_part('bottoms',style); w=self.width
        rows=[(.815,.042,.055),(.84,.115,.082),(.875,.168,.100),(.93,.170,.108),(.98,.154,.102),(1.025,.141,.096),(1.075,.133,.092)]
        self.tube([(0,y,-.005) for y,x,z in rows],[(x*w,z) for y,x,z in rows],'Denim',self.torso_weight,36)
        self.tube([(0,1.07,0),(0,1.085,0)],[(.135*w,.096),(.134*w,.095)],'Seam',self.torso_weight,32)
        for side,sign in [('L',-1),('R',1)]:
            weights=self.leg_weights(side)
            rows=[(.88,.077,.085),(.82,.078,.080),(.72,.071,.072),(.61,.060,.064),(.49,.052,.056),(.45,.051,.054),
                  (.40,.052,.054),(.34,.052,.052),(.25,.044,.046),(.16,.037,.039),(.13,.037,.039)]
            if style=='shorts':
                self.tube([(sign*.095,y,-.003) for y,rx,rz in rows],[(rx*w*.91,rz*.91) for y,rx,rz in rows],'Skin',weights,28)
                rows=rows[:4]+[(.57,.062,.066)]
            elif style=='joggers': rows=[(y,rx*(1.08 if y>.3 else .88),rz*(1.08 if y>.3 else .9)) for y,rx,rz in rows]
            elif style=='chinos': rows=[(y,rx*1.04,rz*1.03) for y,rx,rz in rows]
            self.tube([(sign*.095,y,-.003) for y,rx,rz in rows],[(rx*w,rz) for y,rx,rz in rows],'Denim',weights,28)
            seam=[(sign*(.095+rx*w*.98),y,-.003) for y,rx,rz in rows[1:-1]]
            if style in ['jeans','joggers']: self.tube(seam,[(.0018,.0018)]*len(seam),'Accent' if style=='joggers' else 'Seam',weights,5)
            self.line([(sign*.068,.998,.090),(sign*.075,.962,.098),(sign*.12,.946,.094)],.0017,'Seam','Hips',6)
            y,rx,rz=rows[-1]
            self.tube([(sign*.095,y-.002,0),(sign*.095,y+.018,0)],[(rx*w+.001,rz+.003)]*2,'Accent' if style=='joggers' else 'Denim',weights,24)

    def make_skirt(self, style):
        self.select_part('bottoms',style)
        pleated=style=='pleated_skirt'
        # Let the hem follow each thigh, with a soft blend between legs at the centre.
        def drape(point):
            x,y,_=point
            leg=ease(max(0,min(1,(.984-y)/.19)))
            right=ease(max(0,min(1,.5+x/.16)))
            return [(self.bone_id['Hips'],1-leg),(self.bone_id['Thigh.L'],leg*(1-right)),
                    (self.bone_id['Thigh.R'],leg*right)]

        hem=.595 if pleated else .535
        rows=[(hem,.231,.147),(hem+.013,.230,.146),(.70,.213,.140),(.82,.195,.130),
              (.91,.177,.118),(.98,.156,.108),(1.034,.133,.094)]
        segments=48 if pleated else (20 if self.game else 32)
        points=[]; faces=[]; uvs=[]
        for row,(y,width,depth) in enumerate(rows):
            for i in range(segments+1):
                angle=TAU*i/segments
                fold=(.5+.5*math.cos(12*angle))*(1-row/(len(rows)-1)) if pleated else 0
                points.append((math.sin(angle)*(width+.016*fold),y,math.cos(angle)*(depth+.021*fold)-.004))
                uvs.append((i/segments,(y-hem)/(1.034-hem)))
                if row and i:
                    a=row*(segments+1)+i
                    faces.extend([(a-segments-2,a-segments-1,a-1),(a-segments-1,a,a-1)])
        self.patch(points,faces,'Denim',drape,uvs)
        self.tube([(0,1.014,-.004),(0,1.040,-.004)],[(.144,.102),(.135,.095)],'Seam',self.torso_weight,32)
        # Fitted lining shorts cover the underside when sitting. Only exposed leg is modelled.
        for side,sign in [('L',-1),('R',1)]:
            x=sign*.095
            weights=self.leg_weights(side)
            self.tube([(x,.66,0),(x,.79,0),(x,.865,0)],[(.066,.068),(.074,.077),(.077,.079)],'Denim',weights,20)
            leg=[(.13,.034,.036),(.21,.036,.039),(.33,.047,.049),(.40,.048,.050),
                 (.45,.047,.049),(.52,.049,.052),(.62,.054,.057),(.68,.059,.062)]
            self.tube([(x,y,0) for y,rx,rz in leg],[(rx,rz) for y,rx,rz in leg],'Skin',weights,24)

    def make_accessories(self):
        head=self.weight('Head')
        # The outer crown clears the raised curls. The back remains open below the band.
        for style in ['baseball_cap','beanie']:
            self.select_part('headwear',style)
            rows=[(1.622,.099,.100),(1.646,.102,.104),(1.684,.090,.095),
                  (1.716,.070,.076),(1.736,.045,.050),(1.746,.012,.013)]
            if style=='beanie':
                rows=[(y+(.011 if y>1.70 else -.007),rx+.002,rz+.002) for y,rx,rz in rows]
            self.tube([(0,y,-.007) for y,rx,rz in rows],[(rx,rz) for y,rx,rz in rows],'Cotton',head,36)
            if style=='baseball_cap':
                self.ellipsoid((0,1.632,.091),(.089,.008,.067),'Accent','Head',28,8)
                self.ellipsoid((0,1.747,-.007),(.009,.005,.009),'Accent','Head',12,6)
            else:
                self.tube([(0,1.615,-.007),(0,1.638,-.007),(0,1.642,-.007)],
                          [(.095,.095),(.103,.103),(.101,.101)],'Accent',head,36)
        self.select_part('headwear','headphones')
        arch=[]
        for step in range(19):
            angle=math.pi*step/18
            arch.append((.108*math.cos(angle),1.588+.153*math.sin(angle),-.005))
        self.tube(arch,[(.006,.015)]*len(arch),'Frames',head,12)
        for sign in [-1,1]:
            self.ellipsoid((sign*.098,1.580,-.005),(.019,.040,.032),'Frames','Head',20,10)
            self.ellipsoid((sign*.109,1.580,-.005),(.016,.035,.029),'Accent','Head',20,10)
        for style in ['knit_scarf','neckerchief']:
            self.select_part('neckwear',style)
            rows=[(1.430,.104,.083),(1.447,.090,.078),(1.475,.064,.060),(1.487,.059,.055)]
            if style=='neckerchief': rows=[(1.453,.085,.069),(1.467,.066,.063),(1.478,.059,.055)]
            self.tube([(0,y,0) for y,rx,rz in rows],[(rx,rz) for y,rx,rz in rows],'Accent',self.torso_weight,32)
            if style=='knit_scarf':
                for sign,length in [(-1,.16),(1,.11)]:
                    ends=[(sign*.049,1.449,.066),(sign*.054,1.407,.103),
                          (sign*.064,1.359,.126),(sign*.060,1.359-length,.141)]
                    self.garment_trim(ends,(.021,.007))
            else:
                corners=[(-.059,1.463,.061),(-.037,1.415,.099),(.010,1.369,.127),(.062,1.456,.061),(0,1.439,.092)]
                self.patch(corners,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'Accent',self.torso_weight)

    def make_shoes(self, style):
        self.select_part('shoes',style); w=self.width
        for side,sign in [('L',-1),('R',1)]:
            bone='Foot.'+side; x=sign*.095
            rx=.057*w; rz=.137; top=.057
            if style=='loafers': rx=.053*w; rz=.124; top=.046
            if style=='boots': rx=.060*w; rz=.139; top=.062
            self.ellipsoid((x,.076,.048),(rx,top,rz),'Shoe',bone,28,12)
            self.tube([(x,.006,.049),(x,.023,.049)],[(rx+.001,rz+.001),(rx+.002,rz+.002)],'Sole',self.weight(bone),32)
            self.tube([(x,.12,0),(x,.16,0)],[(.032,.035)]*2,'Accent',self.weight(bone),24)
            if style in ['high_tops','boots']:
                height=.20 if style=='boots' else .17
                self.tube([(x,.09,0),(x,height,0)],[(.049,.059),(.044,.046)],'Shoe',self.weight(bone),28)
                self.tube([(x,height-.012,0),(x,height,0)],[(.046,.048)]*2,'Accent',self.weight(bone),24)
            if style=='loafers': self.line([(x-.046,.113,.065),(x,.122,.071),(x+.046,.113,.065)],.006,'Accent',bone,12)
            else:
                for z in [.04,.065,.09]: self.line([(x-.029,.123,z),(x,.130,z+.005),(x+.029,.123,z)],.0023,'Sole',bone)

    def make_head(self):
        female=self.female; width=.96 if female else 1.
        rows=[(1.49,.019,.038,.030),(1.501,.043,.052,.043),(1.516,.062,.060,.055),
              (1.540,.074,.069,.065),(1.565,.080,.073,.072),(1.585,.079,.070,.075),
              (1.600,.078,.069,.076),(1.620,.077,.070,.077),(1.640,.074,.067,.075),
              (1.661,.067,.060,.068),(1.681,.054,.046,.054),(1.700,.032,.027,.032),(1.711,.002,.002,.002)]
        verts=[]; faces=[]; uvs=[]; segments=28 if self.game else 56
        dense=[]
        count=20 if self.game else 40
        for i in range(count+1):
            y=rows[0][0]+(rows[-1][0]-rows[0][0])*i/count
            pair=next(((a,b) for a,b in zip(rows,rows[1:]) if a[0]<=y<=b[0]),(rows[-2],rows[-1]))
            a,b=pair; t=(y-a[0])/(b[0]-a[0]); dense.append((y,*lerp(a[1:],b[1:],t)))
        for y,rx,front,back in dense:
            for k in range(segments+1):
                a=TAU*k/segments; c=math.cos(a)
                x=math.sin(a)*rx*width; z=c*(front if c>=0 else back)-.003
                if c>.35:
                    def feature(cx,cy,sx,sy):return math.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
                    z+=(max(0,c-.35)/.65)*sum(-.004*feature(sign*.032,1.594,.018,.012)+.003*feature(sign*.035,1.616,.020,.010)+.003*feature(sign*.046,1.570,.020,.015) for sign in [-1,1])
                verts.append((x,y,z))
                uvs.append((k/segments,(y-1.49)/.221))
        for ring in range(len(dense)-1):
            for k in range(segments):
                a=ring*(segments+1)+k; b=a+1; c=a+segments+1
                faces.extend([(a,b,c),(b,c+1,c)])
        self.patch(verts,faces,'Face',self.weight('Head'),uvs)
        # Facial planes: bridge, tip, nostrils, cupid's bow and softly defined chin.
        nose=[]; nose_faces=[]
        for y,width,base,front in [(1.609,.006,.063,.068),(1.596,.007,.063,.073),(1.579,.008,.064,.081),
                                   (1.566,.010,.065,.090),(1.558,.011,.065,.095),(1.552,.010,.065,.086),(1.548,.006,.065,.072)]:
            for k in range(9):
                u=(k-4)/4; nose.append((u*width,y,base+(front-base)*math.cos(u*math.pi/2)**1.2))
        for row in range(6):
            for k in range(8):
                a=row*9+k; nose_faces.extend([(a,a+9,a+1),(a+1,a+9,a+10)])
        self.patch(nose,nose_faces,'Skin',self.weight('Head'))
        for sign,side in [(-1,'L'),(1,'R')]:
            self.ellipsoid((sign*.009,1.553,.079),(.0045,.0035,.0055),'Skin','Head',16,8)
            self.ellipsoid((sign*.008,1.551,.082),(.0025,.001,.001),'SkinShadow','Head',12,6)
            x=sign*.032; y=1.594; z=.065
            self.ellipsoid((x,y,z),(.014,.0048,.006),'EyeWhite','Head',24,12)
            self.ellipsoid((x,y,z+.0053),(.0048,.0048,.0013),'Iris','Head',20,10)
            self.ellipsoid((x,y,z+.0065),(.0021,.0028,.0007),'Pupil','Head',16,8)
            self.ellipsoid((x-.0015,y+.0017,z+.0071),(.0008,.0008,.0003),'Catchlight','Head',10,6)
            # The upper lid is weighted to a dedicated blink bone.
            self.line([(x-.014,1.594,.065),(x-.008,1.599,.069),(x,1.600,.071),(x+.008,1.598,.069),(x+.014,1.594,.065)],.0014,'Skin','Lid.'+side,10)
            self.line([(x-.014,1.593,.065),(x-.007,1.590,.068),(x+.005,1.590,.069),(x+.014,1.593,.065)],.0009,'Skin','Head')
            self.line([(sign*.017,1.614,.067),(sign*.028,1.616,.068),(sign*.041,1.614,.063),(sign*.048,1.611,.058)],.0015 if female else .002,'Hair','Head',8)
            self.ellipsoid((sign*.080,1.568,-.007),(.010,.021,.011),'Skin','Head',18,12)
            self.ellipsoid((sign*.088,1.568,.001),(.0025,.013,.004),'SkinShadow','Head',16,10)
            self.ellipsoid((sign*.089,1.565,.004),(.002,.008,.003),'Skin','Head',14,8)
            if self.spec.get('staff'): self.ellipsoid((sign*.085,1.549,.003),(.003,.0035,.002),'Badge','Head',12,8)
        lips=[]; faces=[]
        for row in range(3):
            for i in range(25):
                u=(i-12)/12; x=u*.021
                seam=1.527+.0005*abs(u)
                y=seam+(.002*(1-u*u) if row==0 else -.0028*(1-u*u) if row==2 else 0)
                z=.065*math.sqrt(1-(x/.074)**2)-.003+.002*(1-u*u)*(1 if row==1 else .3)
                lips.append((x,y,z))
        for row in range(2):
            for i in range(24):
                a=row*25+i; faces.extend([(a,a+25,a+1),(a+1,a+25,a+26)])
        self.patch(lips,faces,'Lips',self.weight('Head'))
        for style in HAIRSTYLES['female' if self.female else 'male']: self.make_hair(style)
        for style in ['square','round']: self.make_glasses(style)
        self.select_part('body','base')

    def make_glasses(self, style):
        self.select_part('glasses',style)
        for sign in [-1,1]:
            x=sign*.032
            if style=='round': points=[(x+.017*math.cos(TAU*i/24),1.594+.012*math.sin(TAU*i/24),.075) for i in range(25)]
            else: points=[(x+dx,1.594+dy,.075) for dx,dy in [(-.017,.010),(.017,.010),(.018,-.008),(.012,-.012),(-.012,-.012),(-.018,-.008),(-.017,.010)]]
            self.line(points,.0018,'Frames','Head',8)
            self.line([(sign*.049,1.599,.075),(sign*.077,1.601,.015),(sign*.082,1.579,-.012)],.0016,'Frames','Head',8)
        self.line([(-.014,1.596,.075),(0,1.599,.079),(.014,1.596,.075)],.0015,'Frames','Head',8)

    def make_hair(self, style):
        self.select_part('hair',style)
        verts=[]; faces=[]; segments=28 if self.game else 56; rings=10 if self.game else 18
        for ring in range(rings+1):
            t=max(.001,ring/rings)
            for k in range(segments+1):
                phi=TAU*k/segments; front=(1+math.cos(phi))/2
                max_angle=(2.90-front*1.56) if style=='bob' else 2.12-front*.78
                angle=t*max_angle
                quiff=.016*max(0,math.cos(phi-.45))*math.sin(angle) if style=='quiff' else 0
                verts.append((math.sin(phi)*math.sin(angle)*.083,1.615+math.cos(angle)*.104+quiff,
                              -.007+math.cos(phi)*math.sin(angle)*.081))
        for ring in range(rings):
            for k in range(segments):
                a=ring*(segments+1)+k; b=a+1; c=a+segments+1
                faces.extend([(a,c,b),(b,c,c+1)])
        self.patch(verts,faces,'Hair',self.weight('Head'))
        if style in ['quiff','side_part']:
            for strand in range(0,9,2 if self.game else 1):
                x=-.060+strand*.013; taper=math.sqrt(max(.1,1-(x/.086)**2))
                points=[(x,1.644+.010*taper,.067*taper), (x+.010,1.677+.009*taper,.062*taper),
                        (x+.019,1.710+.008*taper,.030*taper),(x+.014,1.719,.001)]
                self.tube(points,[(.004,.005),(.006,.007),(.005,.006),(.001,.002)],'Hair',self.weight('Head'),10)
            for sign in [-1,1]:
                self.tube([(sign*.078,1.608,.019),(sign*.080,1.585,.016),(sign*.079,1.568,.012)],
                          [(.006,.009),(.005,.008),(.002,.003)],'Hair',self.weight('Head'),12)
        # Shallow sculpted locks follow the scalp; this is not a sphere hair cap alone.
        for strand in range(0,15,2 if self.game else 1):
            phi=TAU*strand/15+.12; front=(1+math.cos(phi))/2; max_angle=(2.90-front*1.56) if style=='bob' else 2.12-front*.78
            points=[]
            for step in range(9):
                t=.12+.85*step/8; a=t*max_angle; sweep=phi+.19*(1-t)
                quiff=.016*max(0,math.cos(sweep-.45))*math.sin(a) if style=='quiff' else 0
                points.append((math.sin(sweep)*math.sin(a)*.0835,1.615+math.cos(a)*.1045+quiff,-.007+math.cos(sweep)*math.sin(a)*.0815))
            self.line(points,.00035,'HairStrands','Head',6)
        if style=='curls':
            for row in range(5):
                a=.20+row*.29
                locks=(3,6,9,12,12)[row]
                for k in range(locks):
                    phi=TAU*(k+(row%2)*.5)/locks
                    center=(math.sin(phi)*math.sin(a)*.087,1.615+math.cos(a)*.108,-.007+math.cos(phi)*math.sin(a)*.086)
                    self.ellipsoid(center,(.014,.014,.014),'Hair','Head',12,8)
        if style=='side_part':
            for offset in [-.012,0,.012]:
                self.line([(-.063,1.65+offset,.060),(-.035,1.70+offset,.048),(.025,1.714+offset,.021),(.067,1.674+offset,-.018)],.006,'Hair','Head',10)
        if style=='bun':
            self.ellipsoid((0,1.625,-.101),(.044,.044,.040),'Hair','Head',28,16)
            for i in range(7):
                a=TAU*i/7
                self.line([(math.sin(a)*.031,1.625+math.cos(a)*.034,-.127),
                           (math.sin(a+.5)*.031,1.625+math.cos(a+.5)*.034,-.131)],.0015,'HairStrands','Head')
        if style=='ponytail':
            self.tube([(0,1.63,-.084),(0,1.61,-.12),(.010,1.55,-.15),(.018,1.48,-.17),(.010,1.41,-.15)],
                      [(.024,.025),(.034,.032),(.035,.032),(.026,.024),(.008,.010)],'Hair',self.weight('Head'),24)
            self.tube([(0,1.619,-.113),(0,1.610,-.123)],[(.031,.030)]*2,'Accent',self.weight('Head'),24)
        if style=='braid':
            for i in range(9):
                y=1.60-i*.023; x=(-1 if i%2 else 1)*.009; z=-.104-i*.006
                radius=.022-i*.0016
                self.ellipsoid((x,y,z),(radius,radius*.9,radius*.85),'Hair','Head',16,10)
                self.line([(x-radius*.7,y+.005,z-.008),(x,y-.009,z-radius*.9),(x+radius*.7,y-.011,z-.008)],.0012,'HairStrands','Head')
            self.ellipsoid((0,1.405,-.155),(.010,.006,.012),'Accent','Head',14,8)

    def buffer(self, data, target=None):
        while len(self.binary)%4:self.binary.append(0)
        view={'buffer':0,'byteOffset':len(self.binary),'byteLength':len(data)}
        if target:view['target']=target
        self.binary.extend(data); self.views.append(view); return len(self.views)-1

    def accessor(self, values, count, kind, component=5126, target=None, bounds=False):
        fmt={5126:'f',5123:'H',5121:'B',5125:'I'}[component]
        view=self.buffer(struct.pack('<'+fmt*len(values),*values),target)
        entry={'bufferView':view,'componentType':component,'count':count,'type':kind}
        if bounds:
            width={'VEC3':3,'SCALAR':1}[kind]; entry['min']=[min(values[i::width]) for i in range(width)]; entry['max']=[max(values[i::width]) for i in range(width)]
        self.accessors.append(entry);return len(self.accessors)-1

    def pose(self, name, t, duration):
        rotations={b['name']:(0.,0.,0.) for b in self.bones}; hips=(0.,.92,0.); lids=0.
        phase=TAU*t/duration
        if name=='Walk':
            feet={}
            for side,offset in [('L',0),('R',.5)]:
                f=(t/duration+offset)%1
                if f<.62: feet[side]=(.30-.60*f/.62,0.,0.)
                else:
                    swing=(f-.62)/.38
                    feet[side]=(-.30+.60*ease(swing),.10*math.sin(math.pi*swing),.12*math.sin(math.pi*swing))
            hip_y=min(.92,min(.09+lift+.04+math.sqrt(max(.1,(.43+.36-.006)**2-z*z)) for z,lift,toe in feet.values()))
            hips=(0,hip_y,0)
            for sign,side in [(-1,'L'),(1,'R')]:
                z,lift,toe=feet[side]; down=hip_y-.04-.09-lift; distance=math.hypot(z,down)
                theta=math.atan2(z,down); alpha=math.acos(max(-1,min(1,(.43**2+distance**2-.36**2)/(2*.43*distance))))
                a=-theta-alpha; k=math.acos(max(-1,min(1,(distance**2-.43**2-.36**2)/(2*.43*.36))))
                rotations['Thigh.'+side]=(a,0,0); rotations['Shin.'+side]=(k,0,0); rotations['Foot.'+side]=(-a-k+toe,0,0)
                rotations['UpperArm.'+side]=(.24*math.cos(phase+(math.pi if side=='R' else 0)),0,sign*.025)
                rotations['Forearm.'+side]=(-.15,0,0)
            rotations['Chest']=(.02,.025*math.sin(phase),.015*math.sin(phase))
            rotations['Head']=(.025,-.025*math.sin(phase),0)
        elif name in ['SitDown','StandUp','Gaming']:
            blend=1 if name=='Gaming' else ease(t/duration if name=='SitDown' else 1-t/duration)
            hips=(0,.92-.43*blend,0)
            rotations['Spine']=(.07*blend,0,0); rotations['Chest']=(.025*blend,0,0); rotations['Head']=(.05*blend,0,0)
            for sign,side in [(-1,'L'),(1,'R')]:
                rotations['Thigh.'+side]=(-math.pi/2*blend,0,sign*.035*blend)
                rotations['Shin.'+side]=(math.pi/2*blend,0,0)
                rotations['UpperArm.'+side]=(-.48*blend,sign*.06*blend,-sign*.04*blend)
                rotations['Forearm.'+side]=(-1.04*blend,0,0)
                rotations['Hand.'+side]=(.04*blend,0,0)
                for finger in range(5): rotations[f'Finger{finger}.{side}']=((.16+(.08*math.sin(phase*6+finger*1.7+sign) if name=='Gaming' and side=='R' else .015*math.sin(phase*3+finger) if name=='Gaming' else 0))*blend,0,0)
            if name=='Gaming':
                rotations['Head']=(.05+.012*math.sin(phase),.02*math.sin(phase),0)
                rotations['Hand.L']=(.04,.025*math.sin(phase*2),0)
        else:
            rotations['Chest']=(.008*math.sin(t*TAU/duration),0,0)
            rotations['Head']=(.012*math.sin(phase),.035*math.sin(phase),0)
            for sign,side in [(-1,'L'),(1,'R')]:
                rotations['UpperArm.'+side]=(-.035,0,sign*.025)
                rotations['Forearm.'+side]=(-.065,0,0)
                for finger in range(5):rotations[f'Finger{finger}.{side}']=(.09,0,0)
            if name in ['Wave','CheckIn']:
                gesture=math.sin(math.pi*min(1,t/duration))**.65
                rotations['UpperArm.R']=(-1.03*gesture,0,-.35*gesture)
                rotations['Forearm.R']=(-1.12*gesture,0,0)
                rotations['Hand.R']=(.1*gesture,0,.20*math.sin(t*15)*gesture)
        # A brief authored blink, held open through the rest of the loop.
        blink=t%duration
        if duration>2 and 2.8<blink<3.04:lids=-.009*math.sin((blink-2.8)/.24*math.pi)
        return hips,rotations,lids

    def animation(self, name, duration, nodes):
        frames=max(16,round(duration*(72 if name=='Walk' else 24))); times=[duration*i/frames for i in range(frames+1)]
        time=self.accessor(times,len(times),'SCALAR',bounds=True); channels=[]; samplers=[]
        poses=[self.pose(name,t,duration) for t in times]
        def channel(node,path,values,kind):
            out=self.accessor([v for row in values for v in row],len(times),kind)
            samplers.append({'input':time,'output':out,'interpolation':'LINEAR'})
            channels.append({'sampler':len(samplers)-1,'target':{'node':node,'path':path}})
        channel(nodes['Hips'],'translation',[mul(p[0],self.scale) for p in poses],'VEC3')
        for bone in self.bones:
            name_b=bone['name']; channel(nodes[name_b],'rotation',[quat(*p[1][name_b]) for p in poses],'VEC4')
            if name_b.startswith('Lid.'):
                parent=self.bones[bone['parent']]['position']; rest=sub(bone['position'],parent)
                channel(nodes[name_b],'translation',[mul(add(rest,(0,p[2],0)),self.scale) for p in poses],'VEC3')
        return {'name':name,'channels':channels,'samplers':samplers}

    def export(self):
        self.make_body(); self.make_head()
        gender='female' if self.female else 'male'
        options={'hair':HAIRSTYLES[gender], 'top':self.top_styles(),
                 'bottoms':['jeans','chinos','joggers','shorts']+(SKIRTS if self.female else []),
                 'shoes':['sneakers','high_tops','boots','loafers'], 'glasses':['none','square','round'],
                 'headwear':['none','baseball_cap','beanie','headphones'],'neckwear':['none','knit_scarf','neckerchief']}
        defaults={'hair':'bun' if self.spec.get('staff') else 'ponytail' if self.female else 'quiff',
                  'top':'blazer' if self.spec.get('staff') else 'polo','bottoms':'chinos' if self.spec.get('staff') else 'jeans',
                  'shoes':'loafers' if self.spec.get('staff') else 'sneakers','glasses':'none','headwear':'none','neckwear':'none',
                  'shirtColor':'#'+self.spec['shirt'],'pantsColor':'#'+self.spec['pants'],'shoeColor':'#27303b',
                  'soleColor':'#d4d4ce','hairColor':'#'+self.spec['hair'],'accentColor':'#'+self.spec['trim'],'frameColor':'#343139'}
        if self.female and not self.spec.get('staff'):
            defaults['top']='wrap_blouse'
            defaults['bottoms']='a_line_skirt' if self.spec['id']=='customer_meera' else 'pleated_skirt'
        nodes=[{'name':self.spec['id'],'children':[1,2],'extras':{'customHuman':{
            'version':1,'id':self.spec['id'],'detail':'game' if self.game else 'portrait','height':self.spec['height'],'original':True,'forward':'+Z','walkSpeed':(.60/(.62*.72))*self.scale,
            'gender':gender,'appearanceVersion':1,'appearanceOptions':options,'defaultAppearance':defaults,
            'nativeSeatSurface':.385*self.scale,'seatedHipHeight':.49*self.scale,'legUpper':.43*self.scale,'legLower':.36*self.scale,'ankleHeight':.09*self.scale}}},
            {'name':'Original weighted character mesh','mesh':0,'skin':0}]
        indices={bone['name']:i+2 for i,bone in enumerate(self.bones)}
        for i,bone in enumerate(self.bones):
            parent=bone['parent']; local=sub(bone['position'],self.bones[parent]['position']) if parent is not None else bone['position']
            value={'name':bone['name'],'translation':list(mul(local,self.scale))}
            children=[j+2 for j,b in enumerate(self.bones) if b['parent']==i]
            if children:value['children']=children
            nodes.append(value)
        inverse=[]
        for bone in self.bones:
            x,y,z=mul(bone['position'],-self.scale)
            inverse.extend([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1])
        ibm=self.accessor(inverse,len(self.bones),'MAT4'); groups={}; triangles=0
        for (slot,option,material),part in self.parts.items():
            vertices=part['vertices']; normals=[(0.,0.,0.) for v in vertices]
            for a,b,c in part['faces']:
                normal=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]))
                for index in (a,b,c):normals[index]=add(normals[index],normal)
            # Weld only the *normal* at coincident positions; skin weights/UV seams remain intact.
            shared={}
            for p,n in zip(vertices,normals):
                key=tuple(round(v,6) for v in p); shared[key]=add(shared.get(key,(0,0,0)),n)
            normals=[unit(shared[tuple(round(v,6) for v in p)]) for p in vertices]
            joints=[]; weights=[]
            for values in part['weights']:
                values=[(i,w) for i,w in values if w>0]; total=sum(w for i,w in values)
                values=values+[(0,0)]*(4-len(values)); joints.extend(i for i,w in values); weights.extend(w/total for i,w in values)
            attributes={'POSITION':self.accessor([v for p in vertices for v in p],len(vertices),'VEC3',target=34962,bounds=True),
                'NORMAL':self.accessor([v for p in normals for v in p],len(vertices),'VEC3',target=34962),
                'TEXCOORD_0':self.accessor([v for uv in part['uvs'] for v in uv],len(vertices),'VEC2',target=34962),
                'JOINTS_0':self.accessor(joints,len(vertices),'VEC4',5121,34962),
                'WEIGHTS_0':self.accessor(weights,len(vertices),'VEC4',target=34962)}
            faces=[i for f in part['faces'] for i in f]; triangles+=len(faces)//3
            groups.setdefault((slot,option),[]).append({'attributes':attributes,'indices':self.accessor(faces,len(faces),'SCALAR',5125,34963),'material':self.material_id[material]})
        meshes=[]; slot_triangles={}
        for (slot,option),primitives in groups.items():
            mesh=len(meshes); name=f'{slot}_{option}'
            meshes.append({'name':name,'primitives':primitives})
            count=sum(self.accessors[p['indices']]['count']//3 for p in primitives)
            slot_triangles.setdefault(slot,{})[option]=count
            node={'name':name,'mesh':mesh,'skin':0}
            if slot!='body': node['extras']={'customAppearance':{'slot':slot,'option':option}}
            if mesh==0: nodes[1]=node
            else:
                nodes[0]['children'].append(len(nodes)); nodes.append(node)
        max_active=sum(max(values.values()) for values in slot_triangles.values())
        animations=[self.animation(name,duration,indices) for name,duration in [('Idle',4.),('Walk',.72),('SitDown',.65),('Gaming',4.),('StandUp',.65),('Wave',1.2),('CheckIn',1.6)]]
        gltf={'asset':{'version':'2.0','generator':'Game Arena Tycoon original character authoring v1',
            'copyright':'Original models, rig, textures and animation authored for this repository; no external character assets.'},
            'scene':0,'scenes':[{'nodes':[0],'extras':nodes[0]['extras']}],'nodes':nodes,'meshes':meshes,
            'skins':[{'name':'Original lounge humanoid rig','inverseBindMatrices':ibm,'skeleton':2,'joints':list(indices.values())}],
            'animations':animations,'materials':self.materials,'textures':self.textures,'images':self.images,
            'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],
            'buffers':[{'byteLength':len(self.binary)}],'bufferViews':self.views,'accessors':self.accessors}
        data=json.dumps(gltf,separators=(',',':')).encode(); data+=b' '*((-len(data))%4)
        binary=bytes(self.binary)+b'\0'*((-len(self.binary))%4)
        result=struct.pack('<III',0x46546c67,2,12+8+len(data)+8+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary
        path=OUTPUT/(self.file_id+'.glb'); path.write_bytes(result)
        return {'id':self.file_id,'file':path.relative_to(ROOT).as_posix(),'height':self.spec['height'],'triangles':triangles,
                'maxActiveTriangles':max_active,'appearanceOptions':options,'slotTriangles':slot_triangles,
                'joints':len(self.bones),'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'clips':[a['name'] for a in animations]}


TOPS=['polo','tshirt','raglan','hoodie','overshirt','blazer']
SKIRTS=['a_line_skirt','pleated_skirt']
HAIRSTYLES={'male':['crop','side_part','quiff','curls','bun'], 'female':['crop','side_part','curls','bob','ponytail','bun','braid']}


SPECS=[
    dict(id='customer_aarav',female=False,height=1.74,skin='b88667',shirt='286d72',trim='c4c5ac',pants='293b50',hair='30251f',hairLight='4d392d',iris='493c2e',lips='986354',seam='46576b'),
    dict(id='customer_kabir',female=False,height=1.80,skin='885a43',shirt='43516d',trim='bb9b6b',pants='343638',hair='211f20',hairLight='393536',iris='42382d',lips='754637',seam='535252'),
    dict(id='customer_rohan',female=False,height=1.69,skin='d2a17e',shirt='995648',trim='ded2b8',pants='334b5c',hair='3c2d23',hairLight='604532',iris='617460',lips='aa7668',seam='567082'),
    dict(id='customer_meera',female=True,bust_depth=.049,height=1.67,skin='be8b6a',shirt='c1b5a0',trim='805e50',pants='30435a',hair='322725',hairLight='51403a',iris='544334',lips='a16a61',seam='526880'),
    dict(id='customer_anaya',female=True,bust_depth=.058,height=1.71,skin='906349',shirt='637a64',trim='d0b99b',pants='383d46',hair='211f25',hairLight='3d3540',iris='503c2f',lips='7e4c47',seam='5b626c'),
    dict(id='receptionist_isha',female=True,bust_depth=.054,staff=True,height=1.69,skin='c39272',shirt='273c53',trim='74a5a2',pants='273440',hair='2e2421',hairLight='4e3830',iris='564432',lips='a56f66',seam='435360')
]


if __name__=='__main__':
    OUTPUT.mkdir(parents=True,exist_ok=True)
    manifest={'generator':Path(__file__).relative_to(ROOT).as_posix(),'original':True,'characters':[Character(spec,game).export() for spec in SPECS for game in [False,True]]}
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    for item in manifest['characters']:print(f"{item['id']}: {item['triangles']} triangles, {item['joints']} joints, {item['bytes']/1024:.0f} KiB")
