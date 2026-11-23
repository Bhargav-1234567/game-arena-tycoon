import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ORIGINAL_CHARACTERS } from '../../src/data/characters.ts';
import { AnimationClip, AnimationMixer, Bone, Group, QuaternionKeyframeTrack, VectorKeyframeTrack, Vector3 } from 'three';
import { APPEARANCE_SLOTS, wardrobeFor } from '../../src/characters/CharacterAppearance.ts';

const ALL_MODELS = ORIGINAL_CHARACTERS.flatMap((character) => [character, { ...character, path: character.gamePath }]);

function asset(path: string) {
  const bytes = readFileSync(new URL(`../../public${path}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  const read = (id: number): number[][] => {
    const accessor = gltf.accessors[id], view = gltf.bufferViews[accessor.bufferView];
    const width = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[accessor.type];
    const size = ({ 5121: 1, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[accessor.componentType];
    const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: width }, (_, k) => {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? width * size) + k * size;
      return accessor.componentType === 5126 ? data.getFloat32(offset, true) : accessor.componentType === 5125 ? data.getUint32(offset, true)
        : accessor.componentType === 5123 ? data.getUint16(offset, true) : data.getUint8(offset);
    }));
  };
  return { bytes, gltf, read };
}

test('every runtime person is an original, reproducible asset with embedded authored textures and motion', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/assets/models/characters/original/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.original, true); assert.equal(ORIGINAL_CHARACTERS.length, 6);
  for (const character of ALL_MODELS) {
    assert.ok(character.path.includes('/characters/original/'));
    const { bytes, gltf } = asset(character.path), entry = manifest.characters.find((entry: any) => entry.id === character.path.split('/').at(-1)!.replace('.glb', ''));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.match(gltf.asset.generator, /original character authoring/);
    assert.equal(gltf.scenes[0].extras.customHuman.original, true);
    assert.ok(gltf.images.length >= 2); assert.ok(gltf.images.every((image: any) => image.bufferView !== undefined && !image.uri));
    assert.deepEqual(gltf.animations.map((clip: any) => clip.name), ['Idle', 'Walk', 'SitDown', 'Gaming', 'StandUp', 'Wave', 'CheckIn']);
    assert.ok(gltf.materials.every((material: any) => material.pbrMetallicRoughness.metallicFactor === 0));
  }
});

test('custom meshes have valid indices, normalized skin weights, human proportions and bounded geometry cost', () => {
  for (const character of ALL_MODELS) {
    const { gltf, read } = asset(character.path), rig = gltf.skins[0]; let triangles = 0, minY = Infinity, maxY = -Infinity;
    assert.equal(rig.joints.length, 29);
    const counts = new Map<string, number[]>();
    for (const node of gltf.nodes.filter((node: any) => node.mesh !== undefined)) {
      let count = 0;
      for (const primitive of gltf.meshes[node.mesh].primitives) {
      const positions = read(primitive.attributes.POSITION), normals = read(primitive.attributes.NORMAL);
      const joints = read(primitive.attributes.JOINTS_0), weights = read(primitive.attributes.WEIGHTS_0), indices = read(primitive.indices).flat();
      triangles += indices.length / 3;
      count += indices.length / 3;
      for (const index of indices) assert.ok(index >= 0 && index < positions.length);
      positions.forEach((position, i) => {
        assert.ok(position.every(Number.isFinite)); minY = Math.min(minY, position[1]); maxY = Math.max(maxY, position[1]);
        assert.ok(Math.abs(weights[i].reduce((sum, value) => sum + value, 0) - 1) < .00001);
        assert.ok(joints[i].every((joint) => joint < rig.joints.length));
        assert.ok(normals[i].every(Number.isFinite));
      });
      }
      const slot = node.extras?.customAppearance?.slot ?? 'body';
      counts.set(slot, [...(counts.get(slot) ?? []), count]);
    }
    const game = character.path.endsWith('_game.glb');
    const maxActiveTriangles = [...counts.values()].reduce((sum, values) => sum + Math.max(...values), 0);
    assert.ok(triangles > 30000 && triangles < (game ? 46000 : 116000));
    assert.ok(maxActiveTriangles > 10000 && maxActiveTriangles < (game ? 17000 : 47000));
    assert.ok(minY >= -.001 && minY < .02);
    assert.ok(maxY > 1.60 && maxY < 1.85);
    assert.equal(new Set(rig.joints).size, rig.joints.length);
    assert.equal(read(rig.inverseBindMatrices).length, rig.joints.length);
  }
});

test('every generated wardrobe option has its own weighted geometry and shares the original skeleton', () => {
  for (const character of ALL_MODELS) {
    const { gltf } = asset(character.path), metadata = gltf.scenes[0].extras.customHuman;
    assert.equal(metadata.gender, character.gender);
    assert.deepEqual(metadata.appearanceOptions, wardrobeFor(character.gender));
    const modules = gltf.nodes.filter((node: any) => node.extras?.customAppearance);
    for (const slot of APPEARANCE_SLOTS) for (const option of metadata.appearanceOptions[slot]) {
      const nodes = modules.filter((node: any) => node.extras.customAppearance.slot === slot && node.extras.customAppearance.option === option);
      assert.equal(nodes.length, option === 'none' ? 0 : 1, `${character.id} ${slot} ${option}`);
      for (const node of nodes) {
        assert.equal(node.skin, 0);
        assert.ok(gltf.meshes[node.mesh].primitives.length > 0);
        assert.ok(gltf.meshes[node.mesh].primitives.every((primitive: any) => primitive.attributes.JOINTS_0 !== undefined));
      }
    }
  }
});

test('female torsos and every top retain a fitted bust profile in both detail levels', () => {
  for (const character of ALL_MODELS.filter((entry) => entry.gender === 'female')) {
    const { gltf, read } = asset(character.path);
    const scale = gltf.scenes[0].extras.customHuman.height / 1.73;
    const profile = (meshName: string, material: string, side: number, height: number) => {
      const mesh = gltf.meshes.find((entry: any) => entry.name === meshName);
      const surface = mesh.primitives.find((entry: any) => gltf.materials[entry.material].name === material);
      const depths = read(surface.attributes.POSITION)
        .filter(([x, y]) => x * side / scale > .04 && x * side / scale < .104 && Math.abs(y / scale - height) < .019)
        .map(([, , z]) => z / scale);
      assert.ok(depths.length, meshName);
      return Math.max(...depths);
    };
    for (const side of [-1, 1]) {
      const torso = profile('body_base', 'Lining', side, 1.275);
      assert.ok(torso > profile('body_base', 'Lining', side, 1.18) + .034);
      for (const style of wardrobeFor('female').top) {
        const chest = profile(`top_${style}`, 'Cotton', side, 1.275);
        assert.ok(chest > torso + .01, `${character.id} ${style} garment clearance`);
      }
    }
  }
});

test('accessories and skirt hems follow the intended joints in both model detail levels', () => {
  for (const character of ALL_MODELS) {
    const { gltf, read } = asset(character.path);
    const skin = gltf.skins[0];
    for (const node of gltf.nodes) {
      const part = node.extras?.customAppearance;
      if (!part || !(['headwear', 'neckwear'].includes(part.slot) || part.option.endsWith('_skirt'))) continue;
      const weightedBones = new Set<string>();
      const lowerHem = new Set<string>();
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const joints = read(primitive.attributes.JOINTS_0), weights = read(primitive.attributes.WEIGHTS_0);
        const positions = read(primitive.attributes.POSITION);
        for (let i = 0; i < joints.length; i++) {
          for (let j = 0; j < weights[i].length; j++) {
            if (weights[i][j] <= 0) continue;
            const bone = gltf.nodes[skin.joints[joints[i][j]]].name;
            weightedBones.add(bone);
            if (gltf.materials[primitive.material].name === 'Denim' && positions[i][1] < .63 * gltf.scenes[0].extras.customHuman.height / 1.73) lowerHem.add(bone);
          }
        }
      }
      if (part.slot === 'headwear') assert.deepEqual([...weightedBones], ['Head']);
      else if (part.slot === 'neckwear') {
        assert.ok(weightedBones.has('Chest'));
        assert.ok([...weightedBones].every((bone) => ['Spine', 'Chest', 'Neck'].includes(bone)));
      } else {
        assert.ok(weightedBones.has('Hips'));
        assert.deepEqual([...lowerHem].sort(), ['Thigh.L', 'Thigh.R']);
      }
    }
  }
});

test('original clips use normalized quaternions and seamless looping poses; sit and stand are reciprocal', () => {
  for (const character of ALL_MODELS) {
    const { gltf, read } = asset(character.path);
    for (const clip of gltf.animations) for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler], times = read(sampler.input).flat(), values = read(sampler.output);
      assert.equal(values.length, times.length); assert.equal(times[0], 0);
      assert.ok(times.every((time: number, index: number) => index === 0 || time > times[index - 1]));
      assert.ok(values.every((row) => row.every(Number.isFinite)));
      if (channel.target.path === 'rotation') for (const quaternion of values) assert.ok(Math.abs(Math.hypot(...quaternion) - 1) < .00001);
      if (['Idle', 'Walk', 'Gaming'].includes(clip.name)) {
        for (let k = 0; k < values[0].length; k++) assert.ok(Math.abs(values[0][k] - values.at(-1)![k]) < .00001, `${character.id} ${clip.name} ${channel.target.node} must loop without a pose pop`);
      }
    }
    const hipNode = gltf.nodes.findIndex((node: any) => node.name === 'Hips');
    const hip = (name: string) => { const clip = gltf.animations.find((clip: any) => clip.name === name); const channel = clip.channels.find((channel: any) => channel.target.node === hipNode && channel.target.path === 'translation'); return read(clip.samplers[channel.sampler].output); };
    const sit = hip('SitDown'), stand = hip('StandUp');
    assert.deepEqual(sit[0], stand.at(-1)); assert.deepEqual(sit.at(-1), stand[0]); assert.ok(sit[0][1] - sit.at(-1)![1] > .35);
  }
});

test('the authored walking stance plants a foot while the model advances at its declared stride speed', () => {
  for (const character of ALL_MODELS) {
    const { gltf, read } = asset(character.path), rig = gltf.skins[0], root = new Group();
    const nodes = gltf.nodes.map((node: any, index: number) => {
      const value = rig.joints.includes(index) ? new Bone() : new Group(); value.name = node.name;
      if (node.translation) value.position.fromArray(node.translation); return value;
    });
    gltf.nodes.forEach((node: any, index: number) => node.children?.forEach((child: number) => nodes[index].add(nodes[child])));
    root.add(nodes[0]);
    const source = gltf.animations.find((clip: any) => clip.name === 'Walk');
    const tracks = source.channels.map((channel: any) => {
      const sampler = source.samplers[channel.sampler], times = read(sampler.input).flat(), values = read(sampler.output).flat();
      const name = `${nodes[channel.target.node].uuid}.${channel.target.path === 'rotation' ? 'quaternion' : 'position'}`;
      return channel.target.path === 'rotation' ? new QuaternionKeyframeTrack(name, times, values) : new VectorKeyframeTrack(name, times, values);
    });
    const clip = new AnimationClip('Walk', -1, tracks), mixer = new AnimationMixer(root); mixer.clipAction(clip).play();
    const metadata = gltf.scenes[0].extras.customHuman;
    const foot = nodes[gltf.nodes.findIndex((node: any) => node.name === 'Foot.L')];
    let anchor: Vector3 | undefined;
    for (let frame = 0; frame <= 45; frame++) {
      const time = clip.duration * .60 * frame / 45; mixer.setTime(time); root.position.z = time * metadata.walkSpeed;
      root.updateMatrixWorld(true); const position = foot.getWorldPosition(new Vector3());
      anchor ??= position.clone();
      assert.ok(Math.abs(position.y - metadata.ankleHeight) < .003, `${character.id} stance foot height ${position.y}, expected ${metadata.ankleHeight}, frame ${frame}`);
      assert.ok(Math.abs(position.z - anchor.z) < .003, `${character.id} stance foot must not slide`);
    }
  }
});
