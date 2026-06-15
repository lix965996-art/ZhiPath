"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

/* ── ZhiPath 3D 猫头鹰导师 ──────────────────────────────────
   纯几何体组成，零外部模型依赖，自适应深浅色主题。
   用法: <ZhiPathOwl size={180} />
*/

interface Props {
  size?: number;
  className?: string;
}

export function ZhiPathOwl({ size = 180, className }: Props) {
  return (
    <div
      className={className}
      style={{ width: size, height: size }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 40 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} color="#fffbe6" />
        <pointLight position={[-2, -1, 3]} intensity={0.4} color="#c4b5fd" />
        <Float speed={2} rotationIntensity={0.3} floatIntensity={0.6}>
          <OwlGroup />
        </Float>
      </Canvas>
    </div>
  );
}

function OwlGroup() {
  const group = useRef<THREE.Group>(null);

  // 微微摇摆
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.z = Math.sin(Date.now() * 0.001) * 0.05;
    group.current.rotation.x = Math.sin(Date.now() * 0.0007) * 0.03;
  });

  return (
    <group ref={group} scale={1.1}>
      {/* 身体 */}
      <mesh position={[0, -0.35, 0]}>
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color="#7c3aed"
          distort={0.15}
          speed={1.5}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* 肚子（浅色） */}
      <mesh position={[0, -0.5, 0.75]} scale={[0.7, 0.65, 0.3]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial color="#e0d4fc" roughness={0.6} />
      </mesh>

      {/* 左耳 */}
      <mesh position={[-0.55, 0.95, 0]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.25, 0.5, 8]} />
        <meshStandardMaterial color="#6d28d9" roughness={0.5} />
      </mesh>
      {/* 右耳 */}
      <mesh position={[0.55, 0.95, 0]} rotation={[0, 0, 0.3]}>
        <coneGeometry args={[0.25, 0.5, 8]} />
        <meshStandardMaterial color="#6d28d9" roughness={0.5} />
      </mesh>

      {/* 左眼白 */}
      <mesh position={[-0.32, 0.2, 0.85]}>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      {/* 右眼白 */}
      <mesh position={[0.32, 0.2, 0.85]}>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>

      {/* 左瞳孔 */}
      <Pupil position={[-0.32, 0.2, 1.1]} />
      {/* 右瞳孔 */}
      <Pupil position={[0.32, 0.2, 1.1]} />

      {/* 眼睛高光 */}
      <mesh position={[-0.24, 0.3, 1.17]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh position={[0.4, 0.3, 1.17]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* 嘴巴 */}
      <mesh position={[0, -0.08, 1.05]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.12, 0.2, 8]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.5} />
      </mesh>

      {/* 学士帽 - 顶部 */}
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.06, 32]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* 学士帽 - 帽顶 */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.22, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* 帽穗 */}
      <Tassel />

      {/* 左翅膀 */}
      <Wing position={[-1.0, -0.2, 0]} rotation={[0, 0.3, 0.2]} side="left" />
      {/* 右翅膀 */}
      <Wing position={[1.0, -0.2, 0]} rotation={[0, -0.3, -0.2]} side="right" />

      {/* 脚 */}
      <mesh position={[-0.25, -1.35, 0.15]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} />
      </mesh>
      <mesh position={[0.25, -1.35, 0.15]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ── 瞳孔（跟踪鼠标） ── */
function Pupil({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ pointer }) => {
    if (!ref.current) return;
    const x = THREE.MathUtils.lerp(ref.current.position.x, position[0] + pointer.x * 0.06, 0.1);
    const y = THREE.MathUtils.lerp(ref.current.position.y, position[1] + pointer.y * 0.06, 0.1);
    ref.current.position.x = x;
    ref.current.position.y = y;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.16, 16, 16]} />
      <meshStandardMaterial color="#1e1b4b" roughness={0.2} />
    </mesh>
  );
}

/* ── 翅膀 ── */
function Wing({ position, rotation, side }: { position: [number, number, number]; rotation: [number, number, number]; side: "left" | "right" }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!ref.current) return;
    const flap = Math.sin(Date.now() * 0.002) * 0.08;
    ref.current.rotation.z = rotation[2] + (side === "left" ? -flap : flap);
  });

  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color="#7c3aed" roughness={0.5} />
      {/* 内部形状 - 缩放成翅膀 */}
      <mesh scale={[0.6, 1.2, 0.3]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshStandardMaterial color="#8b5cf6" roughness={0.5} />
      </mesh>
    </mesh>
  );
}

/* ── 帽穗（带摆动） ── */
function Tassel() {
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(Date.now() * 0.0015) * 0.2 - 0.3;
  });

  return (
    <group ref={ref} position={[0.3, 1.1, 0.2]}>
      {/* 穗绳 */}
      <mesh position={[0.15, -0.2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.3} />
      </mesh>
      {/* 穗头 */}
      <mesh position={[0.15, -0.42, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.3} />
      </mesh>
    </group>
  );
}
