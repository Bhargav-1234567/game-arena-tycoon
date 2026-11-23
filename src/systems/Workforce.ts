import * as THREE from 'three';
import { EmployeeAvatar } from '../entities/EmployeeAvatar.ts';
import type { WorkerPose } from '../entities/EmployeeAvatar.ts';
import { makeBin, makeLitter, makeCrate } from '../entities/StaffProps.ts';
import { efficiency, JOB_SECONDS, ROLE_JOB } from '../data/employees.ts';
import type { Employee, JobType, Litter, SavedWorkforce } from '../data/employees.ts';
import { loungeRoute } from './Navigation.ts';
import type { StaffSystem } from './StaffSystem.ts';
import type { PlacementSystem } from './PlacementSystem.ts';
import type { Activity, LoungeOperations } from './LoungeOperations.ts';
import type { ReceptionDesk } from '../entities/ReceptionDesk.ts';
import type { FacilityEntity } from '../entities/FacilityEntity.ts';
import type { GamingStation } from '../entities/GamingStation.ts';

type Machine = FacilityEntity | GamingStation;
interface JobSite {
  id: string; label: string; kind: JobType; point: THREE.Vector3; facing: THREE.Vector3;
  machine?: Machine; dirt?: Litter;
}
interface Worker {
  avatar: EmployeeAvatar; status: string; progress?: number; arrived: boolean; duty: boolean;
  path: THREE.Vector3[]; goal?: THREE.Vector3; revision: number; retry: number; entering: boolean;
  blocked?: string;
}
const point = (x: number,z: number) => new THREE.Vector3(x,0,z);
const stockroom = point(1.22,8.85);

export class Workforce {
  readonly workers = new Map<string,Worker>();
  litter: Litter[] = [];
  private dirtMeshes = new Map<string,THREE.Mesh>();
  private scene: THREE.Scene;
  private placement: PlacementSystem;
  private staff: StaffSystem;
  private ops: LoungeOperations;
  private revision = -1;
  private siteNames = new Map<string,string>();
  private targets: JobSite[] = [];

  constructor(scene: THREE.Scene, placement: PlacementSystem, staff: StaffSystem, ops: LoungeOperations) {
    this.scene = scene; this.placement = placement; this.staff = staff; this.ops = ops;
    const bin = makeBin(), crate = makeCrate();
    bin.position.set(1.85,0,8.88); crate.position.set(2.32,.02,8.88);
    scene.add(bin,crate);
  }

  snapshot(): SavedWorkforce {
    return { employees: this.staff.employees, litter: this.litter, payrollSeconds: this.staff.payrollSeconds, accruedWages: this.staff.accruedWages, owed: this.staff.owed };
  }

  private route(start: THREE.Vector3, end: THREE.Vector3) {
    return loungeRoute(start,end,this.placement.gridSystem,this.placement.collisionSystem);
  }

  sync() {
    for (const [id,w] of this.workers) if (!this.staff.employees.some(e => e.id === id)) {
      w.avatar.dispose(); this.workers.delete(id);
    }
    for (const e of this.staff.employees) if (!this.workers.has(e.id)) {
      const avatar = new EmployeeAvatar();
      if (this.placement.collisionSystem.isPointBlocked(e.x,e.z,.32)) { e.x=0; e.z=8.85; }
      avatar.group.position.set(e.x,0,e.z);
      this.scene.add(avatar.group);
      if (e.job?.kind==='repair' || e.job?.kind==='refill') {
        const machine=this.placement.stations.get(e.job.target) ?? this.placement.facilities.get(e.job.target);
        if (machine) machine.serviceOwner=e.id;
      }
      const w: Worker = { avatar, status:'Arriving', arrived:false, duty:false, path:[], revision:-1, retry:0,
        entering:e.z>8 && !e.job };
      this.workers.set(e.id,w);
      void avatar.build(e).catch(() => {
        if (this.workers.get(e.id) === w) { w.status='Loading employee'; w.retry=4; }
      });
    }
  }

  activities(): Activity[] {
    return this.staff.employees.flatMap(e => {
      const w=this.workers.get(e.id);
      return w?.avatar.ready ? [{ id:e.id, position:w.avatar.group.position, label:e.name+' · '+w.status, progress:w.progress }] : [];
    });
  }

  get receptionists(): Employee[] {
    return this.staff.employees.filter(e => e.role === 'receptionist');
  }

  restoreCounterAssignments(): void {
    const occupied = new Set<string>();
    const roster = this.receptionists.sort((a,b) => Number(a.priority==='auto') - Number(b.priority==='auto'));
    for (const employee of roster) {
      // Older rosters recorded a preferred counter or the current automatic assignment.
      const deskId = employee.priority === 'auto' ? employee.job?.target : employee.priority;
      employee.priority = deskId && this.placement.receptionDesks.has(deskId) && !occupied.has(deskId) ? deskId : 'unassigned';
      if (employee.priority !== 'unassigned') occupied.add(employee.priority);
      if (employee.job?.target !== employee.priority) employee.job = undefined;
    }
  }

  private postReceptionist(employee: Employee, deskId: string): void {
    employee.priority = deskId;
    employee.job = undefined;
    const worker = this.workers.get(employee.id);
    if (worker) {
      worker.arrived = false;
      worker.duty = false;
      worker.progress = undefined;
      worker.goal = undefined;
      worker.retry = 0;
      worker.status = deskId === 'unassigned' ? 'Awaiting counter assignment' : 'Heading to counter';
    }
  }

  assignReceptionist(deskId: string, employeeId?: string): boolean {
    if (!this.placement.receptionDesks.has(deskId)) return false;
    const roster = this.receptionists;
    const next = roster.find(e => e.id === employeeId);
    if (employeeId && !next) return false;
    const previous = roster.find(e => e.priority === deskId);
    if (previous === next) return true;
    if (previous) this.postReceptionist(previous, 'unassigned');
    if (next) this.postReceptionist(next, deskId);
    this.staff.onChange?.();
    return true;
  }

  priorityOptions(e: Employee): [string,string][] {
    if (e.role === 'receptionist') {
      const counters: [string,string][] = [['unassigned','Unassigned']];
      for (const [index, desk] of [...this.placement.receptionDesks.values()].entries()) {
        const other = this.receptionists.find(worker => worker !== e && worker.priority === desk.id);
        counters.push([desk.id, 'Counter '+(index+1)+(other ? ' · replace '+other.name : '')]);
      }
      return counters;
    }
    const options: [string,string][] = [['auto','Next available job']];
    if (e.role === 'janitor') return [...options,['entrance','Entrance first'],['sofas','Sofas first']];
    const entities = e.role === 'technician' ? [...this.placement.stations.values(), ...this.placement.facilities.values()].filter(m => !('type' in m) || m.type==='arcade') :
        [...this.placement.facilities.values()].filter(m => m.type==='vending');
    return [...options,...entities.map(m => [m.id,this.siteNames.get(m.id) ?? 'Workstation'] as [string,string])];
  }

  setPriority(e: Employee, id: string) {
    if (!this.priorityOptions(e).some(option => option[0] === id)) return;
    if (e.role === 'receptionist') {
      if (id !== 'unassigned') this.assignReceptionist(id, e.id);
      else if (e.priority !== 'unassigned') this.assignReceptionist(e.priority);
      return;
    }
    e.priority=id;
    const w=this.workers.get(e.id);
    if (w && !w.duty && e.job?.stage !== 'dispose') { e.job=undefined; w.retry=0; w.goal=undefined; }
    this.staff.onChange?.();
  }

  private binStops() {
    return this.placement.decorObjects.filter(o => o.visible && o.userData.item?.id==='waste_bin')
      .map(o => ({ center:o.position, stop:o.localToWorld(point(0,.94)) }));
  }

  nearbyBin(origin: THREE.Vector3) {
    return this.binStops().filter(b => b.center.distanceTo(origin)<2.8 && this.route(origin,b.stop).length)
      .sort((a,b)=>a.stop.distanceToSquared(origin)-b.stop.distanceToSquared(origin))[0];
  }

  drop(kind: Litter['kind'], origin: THREE.Vector3) {
    if (this.litter.length>=24 || this.litter.filter(l => Math.hypot(l.x-origin.x,l.z-origin.z)<2).length>=2) return;
    for (const [dx,dz] of [[.34,.24],[-.36,.20],[.1,-.35],[0,0]]) {
      const x=origin.x+dx,z=origin.z+dz;
      if (this.placement.collisionSystem.isPointBlocked(x,z,.32)) continue;
      this.litter.push({id:'litter_'+crypto.randomUUID(),kind,x,z,delay:1.5+Math.random()*1.5});
      return;
    }
  }

  patienceRate(position: THREE.Vector3) {
    return this.litter.some(l => this.dirtMeshes.get(l.id)?.visible && Math.hypot(l.x-position.x,l.z-position.z)<2.25) ? 1.35 : 1;
  }

  private dirtUpdate(dt: number) {
    const carried = new Set(this.staff.employees.filter(e=>e.job?.stage==='dispose').map(e=>e.job!.target));
    for (const l of this.litter) {
      l.delay=Math.max(0,l.delay-dt);
      if (l.delay>0) continue;
      let mesh=this.dirtMeshes.get(l.id);
      if (!mesh) {
        mesh=makeLitter(l.kind); mesh.name='Litter_'+l.kind;
        mesh.position.x=l.x; mesh.position.z=l.z;
        this.scene.add(mesh); this.dirtMeshes.set(l.id,mesh);
      }
      mesh.visible=!carried.has(l.id);
    }
    for (const [id,mesh] of this.dirtMeshes) if (!this.litter.some(l=>l.id===id)) {
      mesh.removeFromParent(); mesh.geometry.dispose(); this.dirtMeshes.delete(id);
    }
  }

  private sites() {
    const sites: JobSite[] = [];
    let pc=0,counter=0;
    const counts={sofa:0,arcade:0,vending:0};
    for (const m of [...this.placement.stations.values(),...this.placement.facilities.values()]) {
      const facility='type' in m ? m : undefined;
      const label=facility ? facility.type.charAt(0).toUpperCase()+facility.type.slice(1)+' '+(++counts[facility.type]) : 'PC '+(++pc);
      this.siteNames.set(m.id,label);
      if (!m.group.visible || m.isUpgrading || ('isOccupied' in m ? m.isOccupied : m.reservedBy) || m.id===this.ops.manualTarget) continue;
      const refill=facility?.type==='vending' && facility.stock<=1;
      if (!m.needsService && !refill) continue;
      let approach = 'getApproachPosition' in m ? m.getApproachPosition() : m.getTechnicianPosition();
      if ('getTechnicianPosition' in m && this.placement.collisionSystem.isPointBlocked(approach.x,approach.z,.32)) {
        approach=m.getApproachWorldPosition();
      }
      sites.push({ id:m.id,label,kind:refill?'refill':'repair',machine:m, facing:m.group.position,
        point:approach });
    }
    for (const d of this.placement.receptionDesks.values()) {
      const label='Counter '+(++counter); this.siteNames.set(d.id,label);
      if (!d.group.visible || d.isUpgrading || !this.receptionists.some(e => e.priority === d.id)) continue;
      const marker = d.getStaffPosition();
      const side = d.group.localToWorld(point(.92,-2.08));
      const stop = this.placement.collisionSystem.isSegmentBlocked(marker,side) ? marker : side;
      sites.push({id:d.id,label,kind:'assist',point:stop,facing:d.group.position});
    }
    for (const dirt of this.litter) if (dirt.delay===0) {
      const facing=point(dirt.x,dirt.z), stop=point(dirt.x,dirt.z-.22);
      sites.push({id:dirt.id,kind:'clean',label:dirt.kind+' ('+Math.round(dirt.x)+', '+Math.round(dirt.z)+')',dirt,
        point:this.placement.collisionSystem.isPointBlocked(stop.x,stop.z,.32) ? facing : stop, facing});
    }
    return sites;
  }

  private rank(e: Employee, site: JobSite, at: THREE.Vector3) {
    let score=site.point.distanceTo(at);
    if (site.id===e.priority) score-=100;
    if (e.priority==='entrance') score+=site.point.distanceTo(point(0,7))*4;
    if (e.priority==='sofas') {
      const sofas=[...this.placement.facilities.values()].filter(f=>f.type==='sofa' && f.group.visible);
      if (sofas.length) score+=Math.min(...sofas.map(s=>site.point.distanceTo(s.group.position)))*4;
    }
    return score;
  }

  private navigate(e: Employee,w: Worker,to: THREE.Vector3,dt: number,pose: WorkerPose,label: string) {
    const at=w.avatar.group.position;
    if (!w.goal || w.goal.distanceToSquared(to)>.001 || w.revision!==this.placement.layoutRevision) {
      w.path=this.route(at,to); w.goal=to.clone(); w.revision=this.placement.layoutRevision;
    }
    if (at.distanceTo(to)<.065) return true;
    if (!w.path.length) {
      w.status='Blocked · '+label; w.blocked=label; w.avatar.animate('Idle',dt,1,e.role); return false;
    }
    const target=w.path[0], distance=target.distanceTo(at), step=Math.min(distance,dt*2.05);
    if (distance>.001) {
      w.avatar.group.rotation.y=Math.atan2(target.x-at.x,target.z-at.z);
      at.lerp(target,step/distance);
    }
    if (step>=distance-.001) w.path.shift();
    e.x=at.x; e.z=at.z; w.status=label;
    w.avatar.animate(pose,dt,1,e.role);
    return false;
  }

  private choose(e: Employee,w: Worker) {
    const kind = ROLE_JOB[e.role];
    const occupied=new Set(this.staff.employees.filter(other=>other!==e).map(other=>other.job?.target));
    const at=w.avatar.group.position;
    const options=this.targets.filter(s=>s.kind===kind && !occupied.has(s.id) && (kind!=='assist' || s.id===e.priority))
      .sort((a,b)=>this.rank(e,a,at)-this.rank(e,b,at));
    w.blocked=undefined;
    for (const site of options) {
      if (!this.route(at,site.point).length) { w.blocked=site.label; continue; }
      e.job={kind,target:site.id,stage:kind==='refill'?'supply':'work',elapsed:0};
      return;
    }
  }

  private finish(e: Employee,w: Worker) {
    this.countJob(e); e.job=undefined; w.goal=undefined; w.retry=.2; w.status='Job complete'; w.duty=false;
    w.progress=undefined; w.arrived=false;
  }

  private countJob(e: Employee) { e.jobs++; this.ops.shift.jobs=(this.ops.shift.jobs??0)+1; }

  receptionistAt(desk: ReceptionDesk): Employee | undefined {
    if (!desk.group.visible || desk.isUpgrading) return;
    return this.staff.employees.find(e => {
      if (e.role !== 'receptionist' || e.priority !== desk.id || e.job?.target !== desk.id) return false;
      const worker = this.workers.get(e.id);
      return worker?.avatar.ready && worker.arrived && worker.revision === this.placement.layoutRevision;
    });
  }

  cashierRate(desk: ReceptionDesk): number {
    const employee = this.receptionistAt(desk);
    return employee ? 1 + .35 * efficiency(employee) : 1;
  }

  checkedIn(desk: ReceptionDesk): void {
    const employee = this.receptionistAt(desk);
    if (employee) this.countJob(employee);
  }

  update(dt: number, counterProgress?: ReadonlyMap<string, number>) {
    this.sync(); this.dirtUpdate(dt);
    const changed=this.revision!==this.placement.layoutRevision;
    this.revision=this.placement.layoutRevision;
    this.targets=this.sites();
    for (const machine of [...this.placement.stations.values(), ...this.placement.facilities.values()]) machine.serviceOwner=undefined;
    for (const [index,e] of this.staff.employees.entries()) {
      const w=this.workers.get(e.id)!;
      w.retry=Math.max(0,w.retry-dt);
      if (!w.avatar.ready) {
        if (w.status==='Loading employee' && w.retry===0) { w.avatar.dispose(); this.workers.delete(e.id); }
        continue;
      }
      w.progress=undefined; w.duty=false; w.arrived=false;
      if (w.entering) {
        if (!this.navigate(e,w,point(0,7),dt,'Walk','Entering lounge')) continue;
        w.entering=false;
      }
      if (e.job && !this.targets.some(s=>s.id===e.job!.target)) { e.job=undefined; w.goal=undefined; }
      if (!e.job && (w.retry===0 || changed)) { this.choose(e,w); w.retry=.55; }
      const job=e.job;
      if (!job) {
        const home=point((index%2 ? -1 : 1)*(1.6+Math.floor(index/2)*.68),6.35);
        const idle=w.blocked ? 'Blocked · '+w.blocked : e.priority==='unassigned' ? 'Awaiting counter assignment' : 'On call';
        if (this.navigate(e,w,home,dt,'Walk',idle)) { w.status=idle; w.avatar.animate('Idle',dt,1,e.role); }
        continue;
      }
      const site=this.targets.find(s=>s.id===job.target)!;
      if (site.machine) site.machine.serviceOwner=e.id;
      let destination=site.point,walk: WorkerPose='Walk';
      let label='Walking to '+site.label;
      if (job.stage==='supply') { destination=stockroom; label='Collecting crate'; }
      else if (job.stage==='dispose') {
        const stops=[...this.binStops().map(b=>b.stop),stockroom];
        const at=w.avatar.group.position;
        // Retain the chosen bin until it moves or disappears.
        destination=stops.find(p=>w.goal && w.goal.distanceToSquared(p)<.001 && w.path.length>0 && !changed) ??
          stops.sort((a,b)=>a.distanceToSquared(at)-b.distanceToSquared(at)).find(p=>this.route(at,p).length) ?? stockroom;
        walk='CarryBag'; label='Carrying litter to bin';
      } else if (job.kind==='refill') walk='CarryCrate';
      if (!this.navigate(e,w,destination,dt,walk,label)) {
        if (w.status.startsWith('Blocked') && job.stage!=='dispose') {
          e.job=undefined; w.goal=undefined; w.retry=1;
          if (site.machine) site.machine.serviceOwner=undefined;
        }
        continue;
      }
      w.arrived=true;
      const bin=job.stage==='dispose' ? this.binStops().find(b=>b.stop.distanceToSquared(destination)<.001) : undefined;
      const facing=job.stage==='work' ? site.facing : bin?.center ?? destination.clone().add(point(.5,0));
      w.avatar.group.rotation.y=Math.atan2(facing.x-e.x,facing.z-e.z);
      if (job.kind==='assist') {
        w.progress=counterProgress?.get(site.id);
        w.duty=w.progress !== undefined;
        w.status=(w.duty ? 'Checking in guests · ' : 'Ready · ')+site.label;
        w.avatar.animate(w.duty?'Assist':'Idle',dt,efficiency(e),e.role);
        continue;
      }
      const speed=efficiency(e);
      const duration=job.stage==='work' ? (site.dirt?.kind==='spill'?4:JOB_SECONDS[job.kind]) : 1.4;
      job.elapsed+=dt*speed; w.progress=Math.min(1,job.elapsed/duration); w.duty=true;
      const pose: WorkerPose=job.stage==='dispose'?'Dispose':job.stage==='supply'?'Collect':
        job.kind==='repair'?'Repair':job.kind==='refill'?'Restock':site.dirt?.kind==='spill'?'Mop':'PickUp';
      const action={Dispose:'Emptying bag',Collect:'Loading crate',Repair:'Repairing',Restock:'Refilling',Mop:'Mopping',PickUp:'Picking up'}[pose];
      w.status=action+' · '+site.label;
      const facility=site.machine && 'type' in site.machine ? site.machine : undefined;
      w.avatar.animate(pose,dt,speed,e.role,facility);
      if (job.elapsed<duration) continue;
      if (job.stage==='supply') { job.stage='work'; job.elapsed=0; w.goal=undefined; continue; }
      if (job.kind==='clean') {
        if (job.stage==='work' && site.dirt!.kind!=='spill') { job.stage='dispose'; job.elapsed=0; w.goal=undefined; continue; }
        this.litter=this.litter.filter(l=>l.id!==site.id);
      } else if (site.machine && 'sessionsSinceService' in site.machine) site.machine.sessionsSinceService=0;
      else if (site.machine && 'salesSinceRefill' in site.machine) {
        if (job.kind==='refill') site.machine.salesSinceRefill=0;
        else site.machine.playsSinceService=0;
        site.machine.serviceOwner=undefined;
      }
      if (site.machine) site.machine.serviceOwner=undefined;
      this.finish(e,w);
      this.targets=this.targets.filter(s=>s.id!==site.id);
    }
  }
}
