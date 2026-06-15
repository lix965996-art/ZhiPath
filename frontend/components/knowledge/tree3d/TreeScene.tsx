"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { StarmapModel, SubjectKey, Tier } from "../starmap-data";
import { placeFruitsInCanopy, type Canopy, type TreeFruit } from "./layout";

export interface TreeSceneProps {
  model: StarmapModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  queryHits: string[];
}

type Vec3Tuple = [number, number, number];

const MODEL_URL = "/models/the_orange_tree.glb";
useGLTF.preload(MODEL_URL);

const TIER_COLOR: Record<Tier, string> = {
  mastered: "#f5b133",
  consolidating: "#3b82f6",
  weak: "#ff4d6d",
};
const SUBJECT_TINT: Record<SubjectKey, string> = {
  ds: "#3b82f6",
  co: "#8b5cf6",
  os: "#ff9f43",
  cn: "#22c55e",
};

/** 共享柔光贴图（径向渐变），让标记是"发光的光点"而非塑料球。 */
let GLOW: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (GLOW) return GLOW;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.42, "rgba(255,255,255,0.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  GLOW = new THREE.CanvasTexture(c);
  return GLOW;
}

export function TreeScene({ model, selectedId, onSelect, queryHits }: TreeSceneProps) {
  const assessed = model.mode === "real";
  const hitSet = useMemo(() => new Set(queryHits), [queryHits]);
  const queryActive = queryHits.length > 0;

  return (
    <Canvas
      dpr={[1, 1.9]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 1.15, 6.6], fov: 42 }}
      style={{ background: "transparent" }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.08;
      }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 5]} intensity={1.15} />
      <directionalLight position={[-4, 3, -3]} intensity={0.35} color="#cdb6ff" />
      {/* 离线环境光（Lightformer 烘环境贴图，不联网，避免 HDRI 拉取卡住整张画布） */}
      <Environment resolution={192} frames={1}>
        <Lightformer intensity={2.0} position={[0, 5, -2]} scale={[10, 10, 1]} color="#ffffff" />
        <Lightformer intensity={1.1} position={[-5, 2, 3]} scale={[8, 8, 1]} color="#dbe4ff" />
        <Lightformer intensity={1.2} position={[5, 1.5, 3]} scale={[7, 7, 1]} color="#fff1d6" />
        <Lightformer intensity={0.7} position={[0, -2, 3]} scale={[10, 5, 1]} color="#ffffff" />
      </Environment>

      <Suspense fallback={null}>
        <OrangeTree
          model={model}
          selectedId={selectedId}
          onSelect={onSelect}
          hitSet={hitSet}
          queryActive={queryActive}
          assessed={assessed}
        />
      </Suspense>

      <ContactShadows position={[0, -1.52, 0]} opacity={0.26} scale={8} blur={2.9} far={4} color="#4c3b7a" />

      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.5}
        rotateSpeed={0.55}
        minDistance={4.6}
        maxDistance={9.5}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.15, 0]}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}

function OrangeTree({
  model,
  selectedId,
  onSelect,
  hitSet,
  queryActive,
  assessed,
}: {
  model: StarmapModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hitSet: Set<string>;
  queryActive: boolean;
  assessed: boolean;
}) {
  const { scene } = useGLTF(MODEL_URL);

  const fit = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((o) => {
      const nm = (o.name || "").toLowerCase();
      if (/grass|wave|refelection|reflection|skybox|moon/.test(nm) || nm.startsWith("sun")) {
        o.visible = false;
      }
    });
    const tree = cloned.getObjectByName("Tree");
    const box = new THREE.Box3().setFromObject(tree ?? cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const TARGET_H = 3.7;
    const sf = size.y > 0 ? TARGET_H / size.y : 1;
    const py = -1.5 - box.min.y * sf;
    const canopy: Canopy = {
      cx: 0,
      cy: py + box.max.y * sf - size.y * sf * 0.34,
      cz: 0,
      radius: Math.max(size.x, size.z) * sf * 0.44,
    };
    return { cloned, sf, position: [-center.x * sf, py, -center.z * sf] as Vec3Tuple, canopy };
  }, [scene]);

  const fruits = useMemo(() => placeFruitsInCanopy(model, fit.canopy), [model, fit]);

  return (
    <group>
      <group scale={fit.sf} position={fit.position} rotation={[0, -0.15, 0]}>
        <primitive object={fit.cloned} />
      </group>
      {fruits.map((f) => (
        <Orb
          key={f.id}
          fruit={f}
          color={assessed ? TIER_COLOR[f.tier] : SUBJECT_TINT[f.subject]}
          selected={selectedId === f.id}
          dim={queryActive && !hitSet.has(f.id)}
          assessed={assessed}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

function Orb({
  fruit,
  color,
  selected,
  dim,
  assessed,
  onSelect,
}: {
  fruit: TreeFruit;
  color: string;
  selected: boolean;
  dim: boolean;
  assessed: boolean;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const tex = glowTexture();
  const base = Math.max(0.07, fruit.size);

  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    const wob = assessed && fruit.tier === "weak" ? Math.sin(t * 2.3 + fruit.pos.x) * 0.12 : 0;
    const target = hover || selected ? 1.5 : 1 + wob;
    const cur = ref.current.scale.x;
    ref.current.scale.setScalar(cur + (target - cur) * 0.15);
  });

  function over(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setHover(true);
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  }
  function out() {
    setHover(false);
    if (typeof document !== "undefined") document.body.style.cursor = "default";
  }
  function click(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    onSelect(fruit.id);
  }

  return (
    <group ref={ref} position={[fruit.pos.x, fruit.pos.y, fruit.pos.z]}>
      {selected ? (
        <sprite scale={[base * 13, base * 13, 1]}>
          <spriteMaterial map={tex} color="#7c3aed" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </sprite>
      ) : null}
      <sprite scale={[base * 9, base * 9, 1]} onClick={click} onPointerOver={over} onPointerOut={out}>
        <spriteMaterial map={tex} color={color} transparent opacity={dim ? 0.1 : 0.52} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite scale={[base * 3.4, base * 3.4, 1]}>
        <spriteMaterial map={tex} color={color} transparent opacity={dim ? 0.4 : 1} depthWrite={false} toneMapped={false} />
      </sprite>
      {hover || selected ? (
        <Html center distanceFactor={9} position={[0, base * 4.4, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full border border-[#e3e0f0] bg-white/95 px-2.5 py-1 text-[11.5px] font-medium text-[#1c1c1e] shadow-[0_6px_20px_-8px_rgba(60,40,120,0.4)]">
            {fruit.label}
            <span style={{ color, marginLeft: 6, fontFamily: "ui-monospace, monospace" }}>
              {assessed ? `${Math.round(fruit.mastery * 100)}%` : "待诊断"}
            </span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
