/**
 * VaultBox3D.jsx — TIMEVAULT interactive 3D presentation box
 *
 * Public API (default export, also available as a named export):
 *
 *   <VaultBox3D
 *     isOpen={boolean}                 // lid target state (default false)
 *     onOpenComplete={() => {}}        // fired once when the lid reaches fully open
 *     onCloseComplete={() => {}}       // fired once when the lid reaches fully closed
 *     onError={(error) => {}}          // fired if WebGL / the 3D scene fails to start
 *     innerScreen={<ReactNode/>}       // content of the display inside the lid (PIN stage)
 *     className, style                 // optional wrapper overrides
 *   >
 *     {content shown on the display embedded in the TOP of the lid}
 *   </VaultBox3D>
 *
 * Both displays are real 3D assemblies (gold bezel mesh + glass mesh) that are children of the
 * lid group, so they move with the lid and can never drift. Their interactive content is a normal
 * DOM element that is pinned to the glass every frame: the four corners of the glass are projected
 * through the SAME camera that renders the box, and the element receives the exact 2D perspective
 * transform (a homography via CSS matrix3d) that maps it onto those corners. This does not depend
 * on drei <Html transform> / CSS3D, whose results differ between browsers and embedded previews.
 *
 * Nothing here loads an external image, video or HDR file.
 */
import React, {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  RoundedBox,
} from '@react-three/drei';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* -------------------------------------------------------------------------- */
/* Dimensions (world units)                                                    */
/* -------------------------------------------------------------------------- */
const BOX_W = 4.0; // base width  (x)
const BOX_D = 2.8; // base depth  (z, +z is the front)
const BASE_H = 0.95; // base height (y)
const WALL = 0.16; // base wall thickness
const FLOOR_H = 0.2; // base interior floor height
const LID_OVER = 0.03; // lid overhang on every side
const LID_W = BOX_W + LID_OVER * 2;
const LID_D = BOX_D + LID_OVER * 2;
const LID_H = 0.72;
const HINGE_Y = BASE_H + 0.004; // hinge axis = rear-bottom edge of the lid
const HINGE_Z = -LID_D / 2;
const OPEN_ANGLE = 1.86; // ~106.6 degrees
const OPEN_SECONDS = 2.1;
const CLOSE_SECONDS = 1.6;

/* Global scene scale. Everything below is authored in "box units"; keep at 1. */
const S = 1;
const TARGET_Y_CLOSED = 0.8 * S;
const TARGET_Y_OPEN = 2.0 * S;
const OPEN_DOLLY = 0.95; // camera pulls back by this fraction when open

/* Design sizes (CSS px) of the two screens. PrivateVault.css is written for these. */
const TOP_DESIGN = { w: 760, h: 520 };
const INNER_DESIGN = { w: 640, h: 800 };

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */
function roundedRectPath(path, w, h, r) {
  const rr = Math.max(0.01, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - rr);
  path.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  path.lineTo(x + rr, y + h);
  path.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + rr);
  path.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
  return path;
}

/**
 * Rounded slab with softly bevelled edges, standing on y = 0, centred on x/z.
 * Final outer footprint is exactly w x d and final height exactly h.
 * Optional `hole` makes it a ring (final hole footprint = hole.w x hole.d).
 */
function makeSlabGeometry({ w, d, r, h, bevel, hole }) {
  const bs = bevel;
  const bt = bevel;
  const shape = new THREE.Shape();
  roundedRectPath(shape, w - bs * 2, d - bs * 2, Math.max(r - bs, 0.02));
  if (hole) {
    const p = new THREE.Path();
    roundedRectPath(p, hole.w + bs * 2, hole.d + bs * 2, hole.r + bs);
    shape.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h - bt * 2,
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: bs,
    bevelOffset: 0,
    bevelSegments: 6,
    curveSegments: 16,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2); // extrusion axis (z) becomes up (y)
  geo.translate(0, bt, 0);
  return toCreasedNormals(geo, 0.7);
}

/** Plain rounded prism, y from 0 to h. */
function makePrismGeometry(w, d, r, h) {
  const shape = new THREE.Shape();
  roundedRectPath(shape, w, d, r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Flat rounded plane in the XY plane facing +z. */
function makeRoundedPlaneGeometry(w, h, r) {
  const shape = new THREE.Shape();
  roundedRectPath(shape, w, h, r);
  return new THREE.ShapeGeometry(shape, 12);
}

/** Gold bezel ring in the XY plane, z from -0.012 to +0.018 (faces +z). */
function makeBezelGeometry(glassW, glassH, pad) {
  const bs = 0.006;
  const bt = 0.006;
  const total = 0.03;
  const shape = new THREE.Shape();
  roundedRectPath(shape, glassW + pad * 2 - bs * 2, glassH + pad * 2 - bs * 2, 0.07);
  const hole = new THREE.Path();
  roundedRectPath(hole, glassW + bs * 2, glassH + bs * 2, 0.03 + bs);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: total - bt * 2,
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: bs,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.translate(0, 0, -0.012 + bt);
  return toCreasedNormals(geo, 0.7);
}

/* -------------------------------------------------------------------------- */
/* Materials (procedural — no external textures)                               */
/* -------------------------------------------------------------------------- */
function createGrainTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, size, size);

  let seed = 1337;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 2 + rnd() * 3.5;
    const v = Math.round(150 + rnd() * 90);
    // draw wrapped copies so the texture tiles seamlessly
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const px = x + ox;
        const py = y + oy;
        if (px < -r || px > size + r || py < -r || py > size + r) continue;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(${v},${v},${v},0.9)`);
        g.addColorStop(1, 'rgba(128,128,128,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.8, 1.8);
  tex.anisotropy = 8;
  return tex;
}

function useBoxMaterials() {
  const mats = useMemo(() => {
    const grain = createGrainTexture();
    return {
      leather: new THREE.MeshPhysicalMaterial({
        color: '#0c4634',
        roughness: 0.6,
        metalness: 0,
        bumpMap: grain,
        bumpScale: 0.6, // tune 0.3–1.2 to taste
        sheen: 0.55,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color('#4a9a7c'),
        clearcoat: 0.1,
        clearcoatRoughness: 0.55,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: '#d9bd7c',
        metalness: 1,
        roughness: 0.22,
        envMapIntensity: 1.3,
      }),
      goldSatin: new THREE.MeshStandardMaterial({
        color: '#cfb272',
        metalness: 1,
        roughness: 0.42,
        envMapIntensity: 1.1,
      }),
      ivory: new THREE.MeshStandardMaterial({ color: '#eadfc6', roughness: 0.88 }),
      cushion: new THREE.MeshPhysicalMaterial({
        color: '#efe5cf',
        roughness: 0.95,
        sheen: 1,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color('#fff6e0'),
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#04261c',
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
      }),
      thread: new THREE.MeshStandardMaterial({ color: '#c3bd90', roughness: 0.8 }),
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => {
        if (m.bumpMap) m.bumpMap.dispose();
        m.dispose();
      });
    },
    [mats]
  );
  return mats;
}

function useBoxGeometries() {
  const geo = useMemo(
    () => ({
      base: makeSlabGeometry({
        w: BOX_W,
        d: BOX_D,
        r: 0.22,
        h: BASE_H,
        bevel: 0.035,
        hole: { w: BOX_W - WALL * 2, d: BOX_D - WALL * 2, r: 0.07 },
      }),
      floor: makePrismGeometry(BOX_W - WALL * 2 + 0.02, BOX_D - WALL * 2 + 0.02, 0.08, FLOOR_H),
      liningRing: makeSlabGeometry({
        w: BOX_W - WALL * 2 - 0.004,
        d: BOX_D - WALL * 2 - 0.004,
        r: 0.07,
        h: BASE_H - 0.035 - FLOOR_H,
        bevel: 0.012,
        hole: { w: BOX_W - WALL * 2 - 0.1, d: BOX_D - WALL * 2 - 0.1, r: 0.04 },
      }),
      lid: makeSlabGeometry({
        w: LID_W,
        d: LID_D,
        r: 0.24,
        h: LID_H,
        bevel: 0.09,
      }),
      lidLining: (() => {
        const g = makeRoundedPlaneGeometry(LID_W - 0.2, LID_D - 0.2, 0.12);
        g.rotateX(Math.PI / 2); // face down
        g.translate(0, -0.003, 0);
        return g;
      })(),
    }),
    []
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
    },
    [geo]
  );
  return geo;
}

/* -------------------------------------------------------------------------- */
/* Small decorative parts                                                      */
/* -------------------------------------------------------------------------- */
function Stitches({ w, d, r, inset, y, count, color = '#c3bd90' }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const shape = new THREE.Shape();
    roundedRectPath(shape, w - inset * 2, d - inset * 2, Math.max(r - inset, 0.05));
    const pts = shape.getSpacedPoints(count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      dummy.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
      dummy.rotation.set(0, Math.atan2(-(b.y - a.y), b.x - a.x), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [w, d, r, inset, y, count]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.048, 0.012, 0.012]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </instancedMesh>
  );
}

function GoldFrame({ material }) {
  const w = BOX_W - 0.6;
  const h = BASE_H - 0.42;
  const t = 0.022;
  return (
    <group position={[0, 0.21, BOX_D / 2 + 0.004]}>
      <mesh material={material} position={[0, 0, 0]}>
        <boxGeometry args={[w, t, 0.012]} />
      </mesh>
      <mesh material={material} position={[0, h, 0]}>
        <boxGeometry args={[w, t, 0.012]} />
      </mesh>
      <mesh material={material} position={[-w / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, 0.012]} />
      </mesh>
      <mesh material={material} position={[w / 2, h / 2, 0]}>
        <boxGeometry args={[t, h, 0.012]} />
      </mesh>
    </group>
  );
}

function Latch({ gold, satin }) {
  // Lives in the lid-body frame, so it travels with the lid.
  return (
    <group position={[0, 0.04, LID_D / 2 + 0.025]}>
      <RoundedBox args={[0.46, 0.56, 0.05]} radius={0.02} smoothness={4} castShadow material={satin} />
      <RoundedBox args={[0.28, 0.28, 0.03]} radius={0.012} smoothness={4} position={[0, -0.04, 0.035]} material={gold} />
      <RoundedBox args={[0.19, 0.19, 0.03]} radius={0.01} smoothness={4} position={[0, -0.04, 0.06]} material={satin} />
      <RoundedBox args={[0.09, 0.09, 0.03]} radius={0.006} smoothness={3} position={[0, -0.04, 0.085]} material={gold} />
    </group>
  );
}

function Cushions({ material }) {
  const xs = [-1.35, -0.45, 0.45, 1.35];
  return (
    <group>
      {xs.map((x) => (
        <RoundedBox
          key={x}
          args={[0.8, 0.34, 1.7]}
          radius={0.1}
          smoothness={5}
          position={[x, FLOOR_H + 0.17, 0.05]}
          material={material}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Physically mounted display                                                  */
/* -------------------------------------------------------------------------- */
const stopPropagation = (e) => e.stopPropagation();

/* Solve the 3x3 projective transform that maps the 4 points `src` onto `dst` (h8 = 1). */
function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  for (let c = 0; c < 8; c += 1) {
    let piv = c;
    for (let r = c + 1; r < 8; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < 8; r += 1) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k += 1) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8).fill(0);
  for (let r = 7; r >= 0; r -= 1) {
    let sum = b[r];
    for (let k = r + 1; k < 8; k += 1) sum -= A[r][k] * h[k];
    h[r] = sum / A[r][r];
  }
  return h;
}

/**
 * A screen mounted on a surface. The group's +z axis is the surface normal and the group lives
 * inside the lid, so it moves with it. It draws the gold bezel and the glass as real meshes and,
 * every frame, pins the DOM element `mountRef` (rendered by <VaultBox3D>) onto the glass.
 */
function ScreenMount({ position, rotation, glassWidth, design, materials, mountRef }) {
  const glassHeight = (glassWidth * design.h) / design.w;

  const groupRef = useRef(null);
  const last = useRef({ key: -1, transform: '' });
  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      n: new THREE.Vector3(),
      v: new THREE.Vector3(),
      c: new THREE.Vector3(),
      corners: [
        new THREE.Vector3(-glassWidth / 2, glassHeight / 2, 0.009), // top-left
        new THREE.Vector3(glassWidth / 2, glassHeight / 2, 0.009), // top-right
        new THREE.Vector3(glassWidth / 2, -glassHeight / 2, 0.009), // bottom-right
        new THREE.Vector3(-glassWidth / 2, -glassHeight / 2, 0.009), // bottom-left
      ],
    }),
    [glassWidth, glassHeight]
  );
  const srcRect = useMemo(
    () => [
      [0, 0],
      [design.w, 0],
      [design.w, design.h],
      [0, design.h],
    ],
    [design.w, design.h]
  );

  const bezelGeo = useMemo(() => makeBezelGeometry(glassWidth, glassHeight, 0.07), [glassWidth, glassHeight]);
  const glassGeo = useMemo(() => makeRoundedPlaneGeometry(glassWidth, glassHeight, 0.03), [glassWidth, glassHeight]);
  useEffect(
    () => () => {
      bezelGeo.dispose();
      glassGeo.dispose();
    },
    [bezelGeo, glassGeo]
  );

  useFrame(({ camera, size }) => {
    const g = groupRef.current;
    const el = mountRef.current;
    if (!g || !el) return;

    const hide = () => {
      if (last.current.key !== 0) {
        last.current.key = 0;
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      }
    };

    camera.updateMatrixWorld();
    g.updateWorldMatrix(true, false);

    // Facing test: the screen is only usable while its glass faces the camera.
    g.getWorldPosition(tmp.p);
    g.getWorldDirection(tmp.n);
    tmp.v.copy(camera.position).sub(tmp.p).normalize();
    const facing = tmp.n.dot(tmp.v);
    const fade = THREE.MathUtils.clamp((facing - 0.08) / 0.22, 0, 1);
    if (fade <= 0) {
      hide();
      return;
    }

    // Project the four glass corners through the render camera into canvas pixels.
    const pts = [];
    for (let i = 0; i < 4; i += 1) {
      tmp.c.copy(tmp.corners[i]);
      g.localToWorld(tmp.c);
      tmp.c.applyMatrix4(camera.matrixWorldInverse);
      if (tmp.c.z >= -camera.near) {
        hide();
        return;
      }
      tmp.c.applyMatrix4(camera.projectionMatrix);
      pts.push([(tmp.c.x * 0.5 + 0.5) * size.width, (-tmp.c.y * 0.5 + 0.5) * size.height]);
    }

    const h = solveHomography(srcRect, pts);
    if (!h) {
      hide();
      return;
    }
    const transform = `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
    if (transform !== last.current.transform) {
      last.current.transform = transform;
      el.style.transform = transform;
    }
    const key = Math.round(fade * 20);
    if (key !== last.current.key) {
      last.current.key = key;
      el.style.opacity = String(key / 20);
      el.style.visibility = 'visible';
      el.style.pointerEvents = key >= 14 ? 'auto' : 'none';
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      <mesh geometry={bezelGeo} material={materials.gold} castShadow />
      <mesh geometry={glassGeo} material={materials.glass} position={[0, 0, 0.008]} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* The box                                                                     */
/* -------------------------------------------------------------------------- */
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function WatchBox({ isOpen, onOpenComplete, onCloseComplete, progressRef, topMountRef, innerMountRef }) {
  const mats = useBoxMaterials();
  const geo = useBoxGeometries();
  const size = useThree((s) => s.size);
  const compact = size.width < 640;

  const lidRef = useRef(null);
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const callbacks = useRef({});
  callbacks.current = { onOpenComplete, onCloseComplete };
  // t: 0 (closed) .. 1 (open); state is what we last announced to the parent
  const motion = useRef({ t: 0, state: 'closed' });

  useFrame((_, delta) => {
    const m = motion.current;
    const lid = lidRef.current;
    if (!lid) return;
    const dir = openRef.current ? 1 : -1;
    const dur = dir > 0 ? OPEN_SECONDS : CLOSE_SECONDS;
    m.t = THREE.MathUtils.clamp(m.t + (dir * Math.min(delta, 0.05)) / dur, 0, 1);
    const eased = easeInOutCubic(m.t);
    lid.rotation.x = -OPEN_ANGLE * eased;
    progressRef.current = eased;

    if (m.t >= 1) {
      if (m.state !== 'open') {
        m.state = 'open';
        if (callbacks.current.onOpenComplete) callbacks.current.onOpenComplete();
      }
    } else if (m.t <= 0) {
      if (m.state !== 'closed') {
        m.state = 'closed';
        if (callbacks.current.onCloseComplete) callbacks.current.onCloseComplete();
      }
    } else {
      m.state = dir > 0 ? 'opening' : 'closing';
    }
  }, -3); // runs before the camera rig and before the screens are pinned to the glass

  const topGlassW = compact ? 2.8 : 1.9;
  const innerGlassW = compact ? 1.9 : 1.6;

  return (
    <group>
      {/* ------------------------------ BASE (stationary) ------------------------------ */}
      <mesh geometry={geo.base} material={mats.leather} castShadow receiveShadow />
      <mesh geometry={geo.floor} material={mats.ivory} receiveShadow />
      <mesh geometry={geo.liningRing} material={mats.ivory} position={[0, FLOOR_H, 0]} receiveShadow />
      <Cushions material={mats.cushion} />
      <GoldFrame material={mats.gold} />
      {/* catch plate the latch hooks over */}
      <RoundedBox
        args={[0.32, 0.18, 0.04]}
        radius={0.012}
        smoothness={4}
        position={[0, 0.66, BOX_D / 2 + 0.012]}
        material={mats.gold}
        castShadow
      />
      {/* hinge barrels */}
      {[-1.25, 1.25].map((x) => (
        <mesh
          key={x}
          position={[x, HINGE_Y - 0.03, HINGE_Z + 0.0]}
          rotation={[0, 0, Math.PI / 2]}
          material={mats.gold}
          castShadow
        >
          <cylinderGeometry args={[0.065, 0.065, 0.42, 24]} />
        </mesh>
      ))}

      {/* ------------------------------ LID (rotates about rear hinge) ------------------------------ */}
      <group ref={lidRef} position={[0, HINGE_Y, HINGE_Z]}>
        {/* lid-body frame: origin at the lid's bottom centre */}
        <group position={[0, 0, LID_D / 2]}>
          <mesh geometry={geo.lid} material={mats.leather} castShadow receiveShadow />
          <mesh geometry={geo.lidLining} material={mats.ivory} receiveShadow />
          <Stitches w={LID_W} d={LID_D} r={0.24} inset={0.17} y={LID_H + 0.002} count={150} color="#c3bd90" />
          <Latch gold={mats.gold} satin={mats.goldSatin} />

          {/* display embedded in the TOP of the lid (normal = +y of the lid) */}
          <ScreenMount
            position={[0, LID_H, -0.1]}
            rotation={[-Math.PI / 2, 0, 0]}
            glassWidth={topGlassW}
            design={TOP_DESIGN}
            materials={mats}
            mountRef={topMountRef}
          />

          {/* display on the INSIDE of the lid (normal = -y of the lid, faces the viewer when open) */}
          <ScreenMount
            position={[0, 0, 0.0]}
            rotation={[Math.PI / 2, 0, 0]}
            glassWidth={innerGlassW}
            design={INNER_DESIGN}
            materials={mats}
            mountRef={innerMountRef}
          />
        </group>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Camera rig: responsive FOV + smooth re-framing as the lid opens             */
/* -------------------------------------------------------------------------- */
function CameraRig({ progressRef }) {
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const rig = useRef({ init: false, ty: TARGET_Y_CLOSED, m: 1 });
  const offset = useMemo(() => new THREE.Vector3(), []);

  // keep the whole box in view on narrow (portrait) canvases without touching camera position
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const fov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(0.34 / aspect)),
      26,
      70
    );
    if (camera.isPerspectiveCamera && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [size.width, size.height, camera]);

  useFrame(() => {
    if (!controls) return;
    const r = rig.current;
    if (!r.init) {
      controls.target.set(0, TARGET_Y_CLOSED, 0);
      controls.update();
      r.init = true;
      return;
    }
    const k = progressRef.current;
    const ty = TARGET_Y_CLOSED + (TARGET_Y_OPEN - TARGET_Y_CLOSED) * k;
    const m = 1 + OPEN_DOLLY * k;
    if (Math.abs(ty - r.ty) > 1e-5 || Math.abs(m - r.m) > 1e-5) {
      // preserve whatever angle / zoom the visitor has chosen
      offset.copy(camera.position).sub(controls.target).multiplyScalar(m / r.m);
      controls.target.y += ty - r.ty;
      camera.position.copy(controls.target).add(offset);
      r.ty = ty;
      r.m = m;
    }
  }, -2);
  return null;
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                       */
/* -------------------------------------------------------------------------- */
function Scene({ isOpen, onOpenComplete, onCloseComplete, topMountRef, innerMountRef }) {
  const progressRef = useRef(0);
  const gl = useThree((s) => s.gl);

  return (
    <>
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[3.5 * S, 7 * S, 5 * S]}
        intensity={2}
        color="#fff1d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6 * S}
        shadow-camera-right={6 * S}
        shadow-camera-top={6 * S}
        shadow-camera-bottom={-6 * S}
        shadow-camera-near={0.5 * S}
        shadow-camera-far={24 * S}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02 * S}
      />
      <directionalLight position={[-5 * S, 3 * S, 2 * S]} intensity={0.5} color="#ffe6c0" />

      {/* Studio reflections generated in-scene: no network, no HDR file */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#cdbf9f']} />
        <Lightformer form="rect" intensity={2.2} color="#fff3dc" position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe8c4" position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1} color="#ffffff" position={[6, 2, 4]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#fff0d2" position={[0, 2, 9]} rotation-y={Math.PI} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#fffaf0" position={[0, 3, -6]} scale={5} />
      </Environment>

      <group scale={S}>
        <WatchBox
          isOpen={isOpen}
          onOpenComplete={onOpenComplete}
          onCloseComplete={onCloseComplete}
          progressRef={progressRef}
          topMountRef={topMountRef}
          innerMountRef={innerMountRef}
        />
      </group>

      {/* soft directional shadow + contact shadow on an invisible floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40 * S, 40 * S]} />
        <shadowMaterial transparent opacity={0.16} />
      </mesh>
      <ContactShadows position={[0, 0.002 * S, 0]} opacity={0.5} scale={12 * S} blur={2.4} far={2.5 * S} resolution={512} color="#3a2e1c" />

      <CameraRig progressRef={progressRef} />
      <OrbitControls
        makeDefault
        domElement={gl.domElement}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        zoomSpeed={0.7}
        minDistance={4.2 * S}
        maxDistance={15 * S}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2 - 0.08}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Error boundary — a failed WebGL context must never blank the page           */
/* -------------------------------------------------------------------------- */
class BoxBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (typeof this.props.onError === 'function') this.props.onError(error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="tv-vault-canvas-error" role="alert">
          The 3D view is unavailable on this device.
        </div>
      );
    }
    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* Public component                                                            */
/* -------------------------------------------------------------------------- */
/* Visual shell of a screen's DOM content. Its size is the fixed design size; the per-frame
   homography in <ScreenMount> scales and tilts it exactly onto the 3D glass. */
function screenShellStyle(design) {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: design.w,
    height: design.h,
    transformOrigin: '0 0',
    overflow: 'hidden',
    borderRadius: 12,
    color: '#f2ead6',
    background:
      'linear-gradient(150deg, rgba(10,58,45,0.96) 0%, rgba(4,30,23,0.97) 60%, rgba(2,20,15,0.98) 100%)',
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
    willChange: 'transform',
  };
}

function VaultBox3D({
  isOpen = false,
  onOpenComplete,
  onCloseComplete,
  onError,
  innerScreen = null,
  children = null,
  className = '',
  style,
}) {
  const topMountRef = useRef(null);
  const innerMountRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const handleError = (error) => {
    setFailed(true);
    if (typeof onError === 'function') onError(error);
  };

  return (
    <div
      className={`tv-vault-canvas ${className}`.trim()}
      role="group"
      aria-label="Interactive 3D TIMEVAULT watch box. Drag to rotate, scroll or pinch to zoom."
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        ...style,
      }}
    >
      <BoxBoundary onError={handleError}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, TARGET_Y_CLOSED + 4.5 * S, 5.4 * S], fov: 30, near: 0.5 * S, far: 60 * S }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = 1.05;
          }}
        >
          <Scene
            isOpen={Boolean(isOpen)}
            onOpenComplete={onOpenComplete}
            onCloseComplete={onCloseComplete}
            topMountRef={topMountRef}
            innerMountRef={innerMountRef}
          />
        </Canvas>
      </BoxBoundary>

      {/* Screen content. Positioned every frame by <ScreenMount>; never laid out by CSS. */}
      {failed ? null : (
        <div
          className="tv-vault-overlay"
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
        >
          <div
            ref={topMountRef}
            className="tv-vault-glass"
            style={screenShellStyle(TOP_DESIGN)}
            onPointerDown={stopPropagation}
            onWheel={stopPropagation}
            onTouchStart={stopPropagation}
          >
            {children}
            <span className="tv-vault-glass-sheen" aria-hidden="true" />
          </div>
          <div
            ref={innerMountRef}
            className="tv-vault-glass"
            style={screenShellStyle(INNER_DESIGN)}
            onPointerDown={stopPropagation}
            onWheel={stopPropagation}
            onTouchStart={stopPropagation}
          >
            {innerScreen}
            <span className="tv-vault-glass-sheen" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

export { VaultBox3D };
export default VaultBox3D;
