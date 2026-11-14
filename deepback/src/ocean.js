import * as THREE from 'three';

const SIZE = 1600;
const SEG = 150;
const STEP = SIZE / SEG;

export class Ocean {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    this.base = geo.attributes.position.array.slice();
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x1d6275,
      roughness: 0.3,
      metalness: 0.15,
      flatShading: true,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.level = 3;
    this.amp = 1;
    this.t = 0;
  }

  waveAt(x, z, t = this.t) {
    return this.amp * (
      0.55 * Math.sin(x * 0.045 + t * 0.9) +
      0.4 * Math.sin(z * 0.06 - t * 1.1) +
      0.25 * Math.sin((x + z) * 0.11 + t * 1.7)
    );
  }

  surfaceAt(x, z) {
    return this.level + this.waveAt(x, z);
  }

  update(t, level, cx, cz) {
    this.t = t;
    this.level = level;
    const ox = Math.round(cx / STEP) * STEP;
    const oz = Math.round(cz / STEP) * STEP;
    this.mesh.position.set(ox, level, oz);
    const arr = this.geo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] = this.waveAt(this.base[i] + ox, this.base[i + 2] + oz, t);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
