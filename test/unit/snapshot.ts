import type {Object3D} from 'three';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function value(v: unknown): unknown {
  if (typeof v === 'number') return round(v);
  if (v && typeof v === 'object') {
    const o = v as {isColor?: true; isVector2?: true; isVector3?: true; isVector4?: true; toArray?(): number[]};
    if (o.isColor || o.isVector2 || o.isVector3 || o.isVector4) return o.toArray!().map(round);
    if (Array.isArray(v)) return v.map(value);
  }
  return typeof v === 'boolean' || typeof v === 'string' ? v : undefined;
}

/** A plain description of everything a pose can change: transforms, draw ranges, uniforms. */
export function snapshot(root: Object3D) {
  const nodes: unknown[] = [];
  root.traverse(node => {
    const mesh = node as Object3D & {geometry?: any; material?: any};
    const uniforms: Record<string, unknown> = {};
    for (const material of [mesh.material].flat().filter(Boolean)) {
      for (const [key, u] of Object.entries((material.uniforms ?? {}) as Record<string, {value: unknown}>)) {
        uniforms[key] = value(u.value);
      }
      if (typeof material.opacity === 'number') uniforms.opacity = round(material.opacity);
    }
    nodes.push({
      name: node.name,
      type: node.type,
      visible: node.visible,
      position: node.position.toArray().map(round),
      rotation: [node.rotation.x, node.rotation.y, node.rotation.z].map(round),
      scale: node.scale.toArray().map(round),
      vertices: mesh.geometry?.attributes?.position?.count,
      drawRange: mesh.geometry ? [mesh.geometry.drawRange.start, mesh.geometry.drawRange.count] : undefined,
      uniforms,
    });
  });
  return nodes;
}

export function meshCount(root: Object3D) {
  let n = 0;
  root.traverse(node => {
    if ((node as {isMesh?: boolean}).isMesh) n++;
  });
  return n;
}
