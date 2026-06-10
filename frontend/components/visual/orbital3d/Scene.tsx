"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Billboard,
  Float,
  MeshDistortMaterial,
  OrbitControls,
  Text,
} from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import * as THREE from "three";

import type { OrbitalNode } from "./nodes";

export interface SceneProps {
  nodes: OrbitalNode[];
  isStreaming?: boolean;
  highlights?: Record<string, boolean>;
  onPickNode?: (node: OrbitalNode) => void;
}

export function Scene({
  nodes,
  isStreaming = false,
  highlights = {},
  onPickNode,
}: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.8]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      camera={{ position: [0, 0.6, 5.4], fov: 42 }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#05060f"]} />
      <fog attach="fog" args={["#05060f", 5, 16]} />

      {/* 灯光：紫主光 + 蓝补光 + 红强调 */}
      <ambientLight intensity={0.18} />
      <pointLight position={[0, 0, 0]} intensity={4} color={"#a78bfa"} distance={9} decay={1.8} />
      <pointLight position={[4, 3, 3]} intensity={1.2} color={"#22d3ee"} distance={12} />
      <pointLight position={[-4, -2, 2]} intensity={1.0} color={"#f43f5e"} distance={12} />
      <directionalLight position={[3, 8, 3]} intensity={0.35} />

      {/* 星空 (GPU 粒子) */}
      <StarField count={2800} streaming={isStreaming} />

      {/* 全息地板：透明圆盘 + 网格 */}
      <HoloFloor />

      {/* 3 个 3D 圆环 */}
      <OrbitRing radius={2.25} color={"#7c3aed"} rotation={[Math.PI / 2.6, 0, 0]} speed={0.18} />
      <OrbitRing radius={1.72} color={"#22d3ee"} rotation={[0.4, 0.7, 1.2]} speed={-0.24} />
      <OrbitRing radius={2.6} color={"#f43f5e"} rotation={[1.6, 0, -0.5]} speed={0.12} />

      {/* 核心：扭曲球 + fresnel 光晕 */}
      <Core streaming={isStreaming} />

      {/* 6 节点 */}
      {nodes.map((node, i) => (
        <CapabilityNode
          key={node.id}
          node={node}
          radius={2.0}
          index={i}
          highlight={Boolean(highlights[node.id] ?? isStreaming)}
          onPick={onPickNode}
        />
      ))}

      {/* 能量流：核心 → 每个节点 */}
      {nodes.map((node) => (
        <EnergyBeam key={`beam-${node.id}`} node={node} radius={2.0} active={isStreaming} />
      ))}

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={isStreaming ? 1.6 : 0.35}
        rotateSpeed={0.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.7}
      />

      {/* 后期：Bloom 真发光 + 色差 + 噪点 + 暗角 */}
      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.85}
          kernelSize={KernelSize.LARGE}
          mipmapBlur
        />
        <ChromaticAberration
          offset={new THREE.Vector2(0.0006, 0.001)}
          radialModulation={false}
          modulationOffset={0}
          blendFunction={BlendFunction.NORMAL}
        />
        <Noise opacity={0.045} />
        <Vignette eskil={false} offset={0.18} darkness={0.92} />
      </EffectComposer>
    </Canvas>
  );
}

// ---------- StarField ----------

function StarField({ count, streaming }: { count: number; streaming: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const r = 6 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * (streaming ? 0.08 : 0.02);
    ref.current.rotation.x += dt * 0.005;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.022}
        color={"#e0e7ff"}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

// ---------- Holographic Floor ----------

function HoloFloor() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.15 + Math.sin(t * 1.2) * 0.04;
  });
  return (
    <>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]}>
        <ringGeometry args={[2.4, 3.8, 80, 1]} />
        <meshBasicMaterial
          color={"#7c3aed"}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]}>
        <ringGeometry args={[1.6, 2.4, 80, 1]} />
        <meshBasicMaterial
          color={"#22d3ee"}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}

// ---------- Orbit Ring ----------

function OrbitRing({
  radius,
  color,
  rotation,
  speed,
}: {
  radius: number;
  color: string;
  rotation: [number, number, number];
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.z += dt * speed;
  });
  return (
    <group rotation={rotation}>
      <mesh ref={ref}>
        <torusGeometry args={[radius, 0.015, 24, 220]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2.4}
          metalness={0.5}
          roughness={0.18}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ---------- Core ----------

function Core({ streaming }: { streaming: boolean }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    if (coreRef.current) {
      const target = streaming ? 1.16 : 1.0;
      const sCur = coreRef.current.scale.x;
      coreRef.current.scale.setScalar(
        sCur + (target + Math.sin(t * 2.4) * 0.04 - sCur) * 0.08,
      );
      coreRef.current.rotation.y += dt * 0.4;
      coreRef.current.rotation.x += dt * 0.18;
    }
    if (ring1Ref.current) ring1Ref.current.rotation.z += dt * 0.6;
    if (ring2Ref.current) ring2Ref.current.rotation.z -= dt * 0.4;
    if (haloRef.current)
      haloRef.current.scale.setScalar(
        1.7 + Math.sin(t * 1.6) * 0.18 + (streaming ? 0.18 : 0),
      );
  });

  return (
    <group>
      {/* 扭曲发光主体 */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.6, 4]} />
        <MeshDistortMaterial
          color={"#c4b5fd"}
          emissive={"#7c3aed"}
          emissiveIntensity={2.6}
          metalness={0.5}
          roughness={0.15}
          distort={streaming ? 0.5 : 0.32}
          speed={streaming ? 3.5 : 1.6}
          toneMapped={false}
        />
      </mesh>

      {/* 内部能量环 ×2 */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[0.78, 0.012, 12, 96]} />
        <meshStandardMaterial
          color={"#22d3ee"}
          emissive={"#22d3ee"}
          emissiveIntensity={3}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 2.5, 0, 0]}>
        <torusGeometry args={[0.92, 0.01, 12, 96]} />
        <meshStandardMaterial
          color={"#f0abfc"}
          emissive={"#f0abfc"}
          emissiveIntensity={3}
          toneMapped={false}
        />
      </mesh>

      {/* 外层 halo (透明) */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshBasicMaterial
          color={"#a78bfa"}
          transparent
          opacity={0.07}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

// ---------- Capability Node ----------

function CapabilityNode({
  node,
  radius,
  index,
  highlight,
  onPick,
}: {
  node: OrbitalNode;
  radius: number;
  index: number;
  highlight: boolean;
  onPick?: (n: OrbitalNode) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);

  const pos = useMemo(() => {
    const lon = (node.lon * Math.PI) / 180;
    const lat = (node.lat * Math.PI) / 180;
    return new THREE.Vector3(
      radius * Math.cos(lat) * Math.sin(lon),
      radius * Math.sin(lat),
      radius * Math.cos(lat) * Math.cos(lon),
    );
  }, [node.lon, node.lat, radius]);

  useFrame((s, dt) => {
    if (!groupRef.current || !innerRef.current || !wireRef.current) return;
    const t = s.clock.elapsedTime + index * 0.7;
    const target = highlight ? 1.18 + Math.sin(t * 3) * 0.08 : 1.0;
    const cur = innerRef.current.scale.x;
    innerRef.current.scale.setScalar(cur + (target - cur) * 0.1);
    wireRef.current.rotation.y += dt * 0.6;
    wireRef.current.rotation.x += dt * 0.4;
  });

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    onPick?.(node);
  }
  function handleOver() {
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
  }
  function handleOut() {
    if (typeof document !== "undefined") document.body.style.cursor = "default";
  }

  return (
    <Float floatIntensity={0.65} rotationIntensity={0.25} speed={1.5}>
      <group ref={groupRef} position={pos.toArray()}>
        {/* 内部发光实心 (扭曲) */}
        <mesh
          ref={innerRef}
          onClick={handleClick}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
        >
          <icosahedronGeometry args={[0.16, 1]} />
          <MeshDistortMaterial
            color={node.color[1]}
            emissive={node.color[0]}
            emissiveIntensity={highlight ? 3.4 : 2}
            metalness={0.55}
            roughness={0.22}
            distort={0.28}
            speed={2}
            toneMapped={false}
          />
        </mesh>

        {/* 外部线框骨架 (高科技感) */}
        <mesh ref={wireRef} scale={1.35}>
          <icosahedronGeometry args={[0.16, 1]} />
          <meshBasicMaterial
            color={node.color[0]}
            wireframe
            transparent
            opacity={highlight ? 0.85 : 0.45}
            toneMapped={false}
          />
        </mesh>

        {/* halo */}
        <mesh scale={2.2}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshBasicMaterial
            color={node.color[0]}
            transparent
            opacity={highlight ? 0.14 : 0.06}
            depthWrite={false}
          />
        </mesh>

        {/* 真 3D 文字标签 (固定大小、永远朝相机) */}
        <Billboard position={[0, -0.4, 0]}>
          <Text
            fontSize={0.13}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.008}
            outlineColor={node.color[0]}
            outlineOpacity={0.9}
          >
            {node.label}
          </Text>
        </Billboard>
      </group>
    </Float>
  );
}

// ---------- Energy Beam (核心 → 节点) ----------

function EnergyBeam({
  node,
  radius,
  active,
}: {
  node: OrbitalNode;
  radius: number;
  active: boolean;
}) {
  const ref = useRef<THREE.Points>(null);

  // 粒子沿核心→节点的连线，t ∈ [0,1] 均匀分布
  const COUNT = 16;
  const data = useMemo(() => {
    const lon = (node.lon * Math.PI) / 180;
    const lat = (node.lat * Math.PI) / 180;
    const target = new THREE.Vector3(
      radius * Math.cos(lat) * Math.sin(lon),
      radius * Math.sin(lat),
      radius * Math.cos(lat) * Math.cos(lon),
    );
    const positions = new Float32Array(COUNT * 3);
    return { target, positions };
  }, [node.lon, node.lat, radius]);

  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime * (active ? 1.6 : 0.6);
    const arr = data.positions;
    for (let i = 0; i < COUNT; i += 1) {
      const u = ((i / COUNT + t * 0.18) % 1);
      arr[i * 3 + 0] = data.target.x * u;
      arr[i * 3 + 1] = data.target.y * u;
      arr[i * 3 + 2] = data.target.z * u;
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[data.positions, 3]}
          count={COUNT}
          array={data.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color={node.color[0]}
        sizeAttenuation
        transparent
        opacity={active ? 0.9 : 0.45}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
