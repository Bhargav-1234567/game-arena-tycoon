import type { Vector3 } from 'three';
import type { FacilityEntity } from '../entities/FacilityEntity.ts';
import type { GamingStation } from '../entities/GamingStation.ts';
import type { PlacementSystem } from './PlacementSystem.ts';

export interface ShiftResult {
  wages?: number;
  jobs?: number;
  downtime?: number;
  day: number;
  served: number;
  lost: number;
  waitSeconds: number;
  waitSamples: number;
  pc: number;
  vending: number;
  arcade: number;
}
export function newShift(day: number): ShiftResult {
  return { day, served: 0, lost: 0, waitSeconds: 0, waitSamples: 0, pc: 0, vending: 0, arcade: 0 };
}
export interface Activity {
  id: string;
  position: Vector3;
  label: string;
  progress?: number;
  patience?: number;
}
export class LoungeOperations {
  shift = newShift(1);
  previous?: ShiftResult;
  manualTarget?: string;
  readonly tasks = new Map<string, Activity>();
  private elapsed = new Map<string, number>();

  rollover(day: number) {
    if (this.shift.day === day) return false;
    this.previous = this.shift;
    this.shift = newShift(day);
    return true;
  }

  update(delta: number, placement: PlacementSystem, player?: Vector3) {
    this.tasks.clear();
    this.manualTarget = undefined;
    let playerAvailable = !!player;
    const machines: (GamingStation | FacilityEntity)[] = [...placement.stations.values(), ...placement.facilities.values()];
    for (const machine of machines) {
      const facility = 'type' in machine ? machine : undefined;
      const refill = facility?.type === 'vending' && facility.stock <= 1;
      if (!refill && !machine.needsService) { this.elapsed.delete(machine.id); continue; }
      if (!machine.group.visible || machine.isUpgrading) continue;
      if (machine.needsService || (facility?.type === 'vending' && facility.stock === 0)) this.shift.downtime = (this.shift.downtime ?? 0) + delta;
      const point = 'getApproachPosition' in machine ? machine.getApproachPosition() : machine.getApproachWorldPosition();
      const occupied = 'isOccupied' in machine ? machine.isOccupied : !!machine.reservedBy;
      const manual = !occupied && playerAvailable && player!.distanceTo(point) < .85;

      let time = this.elapsed.get(machine.id) ?? 0;
      if (manual) {
        playerAvailable = false;
        this.manualTarget = machine.id;
        time += delta;
        this.elapsed.set(machine.id, time);
      }
      const duration = refill ? 3 : 5;
      if (time >= duration) {
        if ('sessionsSinceService' in machine) machine.sessionsSinceService = 0;
        else if (refill) machine.salesSinceRefill = 0;
        else machine.playsSinceService = 0;
        this.elapsed.delete(machine.id);
        continue;
      }
      if (machine.serviceOwner && !manual) continue;
      this.tasks.set(machine.id, { id: machine.id, position: point,
        label: refill ? (manual ? 'Refilling' : 'Refill · '+facility!.stock+' left') : manual ? 'Repairing' : 'Repair here',
        progress: time / duration });
    }
  }
}
