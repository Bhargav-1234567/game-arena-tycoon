import test from 'node:test';
import assert from 'node:assert/strict';
import { StaffSystem } from '../../src/systems/StaffSystem.ts';
import { EconomySystem } from '../../src/systems/EconomySystem.ts';
import { efficiency, validateWorkforce, wage } from '../../src/data/employees.ts';
import type { SavedWorkforce } from '../../src/data/employees.ts';

test('old staff counts migrate once, preserve cash, and restore the same people', () => {
  const economy=new EconomySystem(), staff=new StaffSystem(economy), before=economy.cash;
  const counts=[{id:'receptionist',hiredCount:2},{id:'janitor',hiredCount:2},{id:'technician',hiredCount:1}];
  staff.restore(counts);
  assert.equal(staff.employees.length,4);
  assert.equal(new Set(staff.employees.map(e=>e.name)).size,4);
  const state: SavedWorkforce={employees:structuredClone(staff.employees),litter:[],payrollSeconds:0,owed:0};
  validateWorkforce(state,counts);
  staff.restore(counts,state);
  assert.deepEqual(staff.employees,state.employees);
  assert.equal(economy.cash,before);
  assert.equal(staff.getTotalHourlyWages(),84);
  assert.equal(staff.fire('receptionist'),true);
  assert.equal(staff.fire('receptionist'),false);
});

test('raises apply to one worker and payroll charges time worked across salary changes and reloads', () => {
  const economy=new EconomySystem(), staff=new StaffSystem(economy);
  economy.cash=99;
  assert.equal(staff.hire('janitor'),false);
  economy.cash=100;
  assert.equal(staff.hire('janitor'),true);
  const worker=staff.employees[0];
  const payments:number[]=[];
  staff.onWages=n=>payments.push(n);
  staff.update(7.5);
  assert.equal(staff.raise(worker.id),true);
  assert.equal(wage(worker),16);
  assert.equal(3/efficiency(worker),2.4);
  staff.update(7.5);
  assert.equal(staff.owed,29);
  economy.cash=35;
  staff.update(15);
  assert.deepEqual(payments,[35]);
  assert.equal(staff.owed,25);
  staff.update(5);
  const save={employees:structuredClone(staff.employees), payrollSeconds:staff.payrollSeconds, accruedWages:staff.accruedWages, owed:staff.owed,litter:[]};
  validateWorkforce(save,staff.roles);
  const restored=new StaffSystem(economy); restored.restore(staff.roles,save);
  economy.cash=100;
  restored.update(10);
  assert.equal(economy.cash,44);
  assert.equal(restored.owed,0);
  assert.equal(restored.raise(worker.id),true);
  assert.equal(restored.raise(worker.id),true);
  assert.equal(restored.raise(worker.id),false);
});

test('saved staff cannot double-book a target or restore a work stage from another role', () => {
  const staff=new StaffSystem(new EconomySystem());
  staff.hire('technician'); staff.hire('technician');
  const state: SavedWorkforce={employees:staff.employees,litter:[],owed:0,payrollSeconds:0};
  for(const e of staff.employees) e.job={kind:'repair',target:'pc_1',stage:'work',elapsed:1.5};
  assert.throws(()=>validateWorkforce(state,staff.roles),/assignment/);
  staff.employees[1].job=undefined;
  validateWorkforce(state,staff.roles);
  staff.employees[0].job!.stage='dispose';
  assert.throws(()=>validateWorkforce(state,staff.roles),/assignment/);
  staff.employees[0].job=undefined;
  assert.throws(()=>validateWorkforce({...state,employees:[]},staff.roles),/roster/);
});
