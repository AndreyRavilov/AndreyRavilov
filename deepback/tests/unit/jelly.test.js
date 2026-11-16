import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Jellies, STING_RADIUS } from '../../src/jelly.js';

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

test('медузы дрейфуют под водой у боков Матери', () => {
  const J = new Jellies(new THREE.Scene());
  J.reset(6, rnd);
  for (let t = 0; t < 20; t += 0.5) {
    J.update(0.5, t, 4, null);
    for (const j of J.list) assert.ok(j.y < 4, 'медуза над водой');
  }
  assert.equal(J.alive.length, 6);
});

test('медуза жалит плывущего вплотную, но не чаще раза в пару секунд', () => {
  const J = new Jellies(new THREE.Scene());
  J.reset(1, rnd);
  J.update(0, 0, 4, null);
  const j = J.list[0];
  const p = { pos: new THREE.Vector3(j.x, j.y - 0.9, j.z), swimming: true };
  assert.equal(J.update(1 / 60, 0, 4, p), j);
  p.pos.set(j.x, j.y - 0.9, j.z);
  assert.equal(J.update(1 / 60, 0, 4, p), null);
  // на суше не жалит, а далеко — тем более
  j.cool = 0;
  assert.equal(J.update(1 / 60, 0, 4, { pos: p.pos, swimming: false }), null);
  assert.equal(J.update(1 / 60, 0, 4, { pos: new THREE.Vector3(j.x + STING_RADIUS * 3, j.y, j.z), swimming: true }), null);
});

test('лопнувшая медуза больше не жалит и исчезает', () => {
  const J = new Jellies(new THREE.Scene());
  J.reset(1, rnd);
  const j = J.list[0];
  J.kill(j);
  assert.equal(J.alive.length, 0);
  for (let i = 0; i < 30; i++) J.update(1 / 30, i / 30, 4, { pos: new THREE.Vector3(j.x, j.y - 0.9, j.z), swimming: true });
  assert.equal(j.mesh.visible, false);
});
