// T026/T027：内置组件 v1（data-model §2 默认值逐字对齐；props 值域全 JSON）
// 相机/灯光/环境以组件形态挂树；环境组件承载全局视觉（背景/雾）——spec 澄清 Q2"环境也是组件"。
import * as THREE from 'three';
import { z } from 'zod';
import { defineComponent, type ComponentDefinition } from './registry';

// ---- 公共 schema 片段 ----
const vec2 = z.array(z.number().finite()).length(2);
const vec3 = z.array(z.number().finite()).length(3);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色须为 #rrggbb');

const materialSchema = z.strictObject({
  color: color.default('#9aa4b2'),
  roughness: z.number().min(0).max(1).default(0.55),
  metalness: z.number().min(0).max(1).default(0.1),
  opacity: z.number().min(0).max(1).default(1),
  transparent: z.boolean().default(false),
  wireframe: z.boolean().default(false),
});
type MaterialProps = z.infer<typeof materialSchema>;

function transformSchema() {
  return {
    position: vec3.default([0, 0, 0]),
    rotation: vec3.default([0, 0, 0]), // 弧度，Euler XYZ
    scale: vec3.default([1, 1, 1]),
    visible: z.boolean().default(true),
  };
}
interface TransformProps {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  visible: boolean;
}

function applyTransforms(o: THREE.Object3D, p: TransformProps): void {
  o.position.set(...p.position);
  o.rotation.set(...p.rotation);
  o.scale.set(...p.scale);
  o.visible = p.visible;
}

function applyMaterial(m: THREE.MeshStandardMaterial, mp: MaterialProps): void {
  m.color.set(mp.color);
  m.roughness = mp.roughness;
  m.metalness = mp.metalness;
  m.opacity = mp.opacity;
  m.transparent = mp.transparent;
  m.wireframe = mp.wireframe;
}

// ---- core.group ----
const groupDef = defineComponent({
  type: 'core.group',
  category: 'group',
  props: z.strictObject(transformSchema()),
  mount(inst) {
    const g = new THREE.Group();
    applyTransforms(g, inst.props as TransformProps);
    return g;
  },
  update(o, _p, n) {
    applyTransforms(o, n as TransformProps);
  },
});

// ---- core.camera.perspective ----
const cameraDef = defineComponent({
  type: 'core.camera.perspective',
  category: 'camera',
  props: z.strictObject({
    ...transformSchema(),
    position: vec3.default([0, 0, 5]),
    fov: z.number().min(1).max(170).default(50),
    near: z.number().min(0.01).default(0.1),
    far: z.number().min(1).default(100),
  }),
  mount(inst, ctx) {
    const p = inst.props as TransformProps & { fov: number; near: number; far: number };
    const cam = new THREE.PerspectiveCamera(p.fov, ctx.aspect, p.near, p.far);
    applyTransforms(cam, p);
    return cam;
  },
  update(o, _p, n, ctx) {
    const p = n as TransformProps & { fov: number; near: number; far: number };
    const cam = o as THREE.PerspectiveCamera;
    cam.fov = p.fov;
    cam.near = p.near;
    cam.far = p.far;
    cam.aspect = ctx.aspect;
    cam.updateProjectionMatrix();
    applyTransforms(cam, p);
  },
});

// ---- 图元 ×5（几何参数子 schema + material）----
function paramMesh<P extends z.ZodType>(
  type: string,
  geomSchema: P,
  makeGeometry: (gp: z.infer<P>) => THREE.BufferGeometry,
): ComponentDefinition {
  return defineComponent({
    type,
    category: 'primitive',
    props: z.strictObject({
      ...transformSchema(),
      material: materialSchema.prefault({}),
      // 几何参数整体可省略：内层字段各自有默认值（data-model §2）
      geometry: (geomSchema as unknown as z.ZodType).prefault({}),
    }),
    mount(inst, ctx) {
      const p = inst.props as TransformProps & { material: MaterialProps; geometry: z.infer<P> };
      const mesh = new THREE.Mesh(
        ctx.track(makeGeometry(p.geometry)),
        ctx.track(new THREE.MeshStandardMaterial()),
      );
      applyTransforms(mesh, p);
      applyMaterial(mesh.material as THREE.MeshStandardMaterial, p.material);
      return mesh;
    },
    update(o, _prev, next, ctx) {
      const n = next as TransformProps & { material: MaterialProps; geometry: z.infer<P> };
      applyTransforms(o, n);
      applyMaterial((o as THREE.Mesh).material as THREE.MeshStandardMaterial, n.material);
      const oldGeom = (o as THREE.Mesh).geometry;
      (o as THREE.Mesh).geometry = ctx.track(makeGeometry(n.geometry));
      ctx.track(oldGeom).dispose(); // 旧几何经 ctx 归账后立即释放（renderer.info.memory 即时回落）
    },
  });
}

const geomBox = z.strictObject({ size: vec3.default([1, 1, 1]), segments: vec3.default([1, 1, 1]) });
const geomSphere = z.strictObject({
  radius: z.number().positive().default(0.5),
  widthSegments: z.number().int().min(3).default(32),
  heightSegments: z.number().int().min(2).default(16),
});
const geomPlane = z.strictObject({ size: vec2.default([1, 1]) });
const geomCylinder = z.strictObject({
  radiusTop: z.number().positive().default(0.5),
  radiusBottom: z.number().positive().default(0.5),
  height: z.number().positive().default(1),
  radialSegments: z.number().int().min(3).default(32),
});
const geomTorus = z.strictObject({
  radius: z.number().positive().default(0.5),
  tube: z.number().positive().default(0.2),
  radialSegments: z.number().int().min(3).default(16),
  tubularSegments: z.number().int().min(3).default(48),
});

const meshDefs: ComponentDefinition[] = [
  paramMesh('core.mesh.box', geomBox, (g) => new THREE.BoxGeometry(g.size[0]!, g.size[1]!, g.size[2]!, g.segments[0]!, g.segments[1]!, g.segments[2]!)),
  paramMesh('core.mesh.sphere', geomSphere, (g) => new THREE.SphereGeometry(g.radius, g.widthSegments, g.heightSegments)),
  paramMesh('core.mesh.plane', geomPlane, (g) => new THREE.PlaneGeometry(g.size[0]!, g.size[1]!)),
  paramMesh('core.mesh.cylinder', geomCylinder, (g) => new THREE.CylinderGeometry(g.radiusTop, g.radiusBottom, g.height, g.radialSegments)),
  paramMesh('core.mesh.torus', geomTorus, (g) => new THREE.TorusGeometry(g.radius, g.tube, g.radialSegments, g.tubularSegments)),
];

// ---- core.light.ambient / core.light.directional ----
const ambientDef = defineComponent({
  type: 'core.light.ambient',
  category: 'light',
  props: z.strictObject({ color: color.default('#ffffff'), intensity: z.number().min(0).default(1) }),
  mount(inst) {
    const p = inst.props as { color: string; intensity: number };
    return new THREE.AmbientLight(new THREE.Color(p.color), p.intensity);
  },
  update(o, _p, n) {
    const p = n as { color: string; intensity: number };
    const l = o as THREE.AmbientLight;
    l.color.set(p.color);
    l.intensity = p.intensity;
  },
});

const directionalDef = defineComponent({
  type: 'core.light.directional',
  category: 'light',
  props: z.strictObject({
    color: color.default('#ffffff'),
    intensity: z.number().min(0).default(1),
    position: vec3.default([5, 10, 7]),
  }),
  mount(inst) {
    const p = inst.props as { color: string; intensity: number; position: [number, number, number] };
    const l = new THREE.DirectionalLight(new THREE.Color(p.color), p.intensity);
    l.position.set(...p.position);
    return l;
  },
  update(o, _p, n) {
    const p = n as { color: string; intensity: number; position: [number, number, number] };
    const l = o as THREE.DirectionalLight;
    l.color.set(p.color);
    l.intensity = p.intensity;
    l.position.set(...p.position);
  },
});

// ---- core.environment（全局视觉：背景/雾；每文档至多一个——SceneGraph 强制 E_ENV_DUPLICATE）----
const environmentDef = defineComponent({
  type: 'core.environment',
  category: 'environment',
  props: z.strictObject({
    background: color.nullable().default('#101014'),
    fog: z
      .strictObject({ color: color.default('#101014'), near: z.number().default(1), far: z.number().default(60) })
      .nullable()
      .default(null),
  }),
  mount(inst, ctx) {
    applyEnvironment(ctx.scene, inst.props as EnvironmentProps);
    return new THREE.Group(); // 环境组件是树上的合法节点，无可见几何
  },
  update(_o, _prev, next, ctx) {
    applyEnvironment(ctx.scene, next as EnvironmentProps);
  },
});
interface EnvironmentProps {
  background: string | null;
  fog: { color: string; near: number; far: number } | null;
}
function applyEnvironment(scene: THREE.Scene, p: EnvironmentProps): void {
  scene.background = p.background === null ? null : new THREE.Color(p.background);
  scene.fog = p.fog === null ? null : new THREE.Fog(new THREE.Color(p.fog.color), p.fog.near, p.fog.far);
}

// ---- 交互 marker（US4 / data-model §1.6：叶子 marker，语义由父实例决定）----
const pickableDef = defineComponent({
  type: 'core.pickable',
  category: 'interaction',
  props: z.strictObject({ enabled: z.boolean().default(true) }),
  mount: () => new THREE.Group(), // marker 无可见几何；拾取根 = 其父实例子树
  update: () => {},
});

const orbitDef = defineComponent({
  type: 'core.control.orbit',
  category: 'interaction',
  props: z.strictObject({
    target: vec3.default([0, 0, 0]),
    minDistance: z.number().positive().optional(),
    maxDistance: z.number().positive().optional(),
    enableDamping: z.boolean().default(true),
    dampingFactor: z.number().min(0).max(1).default(0.08),
  }),
  mount: () => new THREE.Group(), // 由 InteractionController 消费（挂到激活相机）；每运行时至多一个
  update: () => {},
});

/** 预装全部内置组件（底座内部调用；internal 注册以使用 core. 前缀）。 */
export function registerBuiltinComponents(registry: {
  register(d: ComponentDefinition, opts?: { override?: boolean; internal?: boolean }): void;
}): void {
  const all: ComponentDefinition[] = [
    groupDef,
    cameraDef,
    ...meshDefs,
    ambientDef,
    directionalDef,
    environmentDef,
    pickableDef,
    orbitDef,
  ];
  for (const d of all) registry.register(d, { internal: true });
}

/** v1 内置类型清单（组件冒烟矩阵的数据源）。 */
export const BUILTIN_TYPES = [
  'core.group',
  'core.camera.perspective',
  'core.mesh.box',
  'core.mesh.sphere',
  'core.mesh.plane',
  'core.mesh.cylinder',
  'core.mesh.torus',
  'core.light.ambient',
  'core.light.directional',
  'core.environment',
  'core.pickable',
  'core.control.orbit',
] as const;
