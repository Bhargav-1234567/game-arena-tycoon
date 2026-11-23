import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { wardrobeFor, APPEARANCE_SLOTS, randomCharacterAppearance, applyCharacterAppearance } from '../../src/characters/CharacterAppearance.ts';
import type { CharacterGender } from '../../src/characters/CharacterAppearance.ts';

function seededRandom(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('seeded random wardrobes independently cover every style and colour for male and female customers', () => {
  for (const gender of ['male', 'female'] as const) {
    const random = seededRandom(218), appearances = Array.from({ length: 2000 }, () => randomCharacterAppearance(gender, 'customer', random));
    const expected = wardrobeFor(gender);
    for (const slot of APPEARANCE_SLOTS) assert.deepEqual([...new Set(appearances.map((entry) => entry[slot]))].sort(), [...expected[slot]].sort());
    for (const color of ['shirtColor', 'pantsColor', 'shoeColor', 'hairColor'] as const) assert.ok(new Set(appearances.map((entry) => entry[color])).size >= 6);
    assert.ok(new Set(appearances.map((entry) => JSON.stringify(entry))).size > 1950);
    for (const top of expected.top) for (const shoes of expected.shoes) assert.ok(appearances.some((entry) => entry.top === top && entry.shoes === shoes));
    assert.ok(appearances.some((entry) => entry.headwear === 'headphones' && entry.neckwear === 'knit_scarf'));
    assert.ok(appearances.some((entry) => entry.headwear === 'none' && entry.neckwear === 'none'));
    assert.deepEqual(randomCharacterAppearance(gender, 'customer', seededRandom(19)), randomCharacterAppearance(gender, 'customer', seededRandom(19)));
  }
});

function fixture(gender: CharacterGender) {
  const model = new Group(), options = wardrobeFor(gender);
  model.userData.customHuman = { appearanceOptions: options };
  for (const slot of APPEARANCE_SLOTS) for (const option of options[slot]) {
    if (option === 'none') continue;
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: slot === 'hair' ? 'Hair' : slot === 'shoes' ? 'Shoe' : 'Cotton' }));
    mesh.userData.customAppearance = { slot, option }; model.add(mesh);
  }
  return model;
}

test('one module per category remains visible through repeated wardrobe changes and independent instances keep their look', () => {
  const model = fixture('female'), neighbour = fixture('female'), random = seededRandom(73);
  const first = randomCharacterAppearance('female', 'customer', random); applyCharacterAppearance(neighbour, first);
  const neighborColor = (neighbour.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material.color.clone();
  for (let i = 0; i < 120; i++) {
    const appearance = randomCharacterAppearance('female', 'customer', random); applyCharacterAppearance(model, appearance);
    for (const slot of APPEARANCE_SLOTS) {
      const visible = model.children.filter((node) => node.visible && node.userData.customAppearance.slot === slot);
      assert.equal(visible.length, appearance[slot] === 'none' ? 0 : 1);
      if (visible.length) assert.equal(visible[0].userData.customAppearance.option, appearance[slot]);
    }
  }
  assert.deepEqual(neighbour.userData.appearance, first);
  assert.ok((neighbour.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material.color.equals(neighborColor));
  const before = JSON.stringify(model.userData.appearance), visibility = model.children.map((node) => node.visible);
  assert.throws(() => applyCharacterAppearance(model, { ...first, hair: 'missing' as any }), /Unsupported/);
  assert.throws(() => applyCharacterAppearance(model, { ...first, shoeColor: 'invalid' }), /hex/);
  assert.equal(JSON.stringify(model.userData.appearance), before); assert.deepEqual(model.children.map((node) => node.visible), visibility);
});

test('receptionists vary hair and footwear while retaining their role uniform', () => {
  const random = seededRandom(15), appearances = Array.from({ length: 100 }, () => randomCharacterAppearance('female', 'receptionist', random));
  assert.ok(appearances.every((entry) => entry.top === 'blazer' && entry.bottoms === 'chinos' && entry.shirtColor === '#273c53'));
  assert.ok(new Set(appearances.map((entry) => entry.hair)).size > 4);
  assert.equal(new Set(appearances.map((entry) => entry.shoes)).size, 4);
});
