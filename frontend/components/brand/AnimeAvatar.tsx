"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Float, Environment } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D 动漫角色展示组件。
 * 加载 /models/hilda.glb，自带浮动动画和环境光照。
 *
 * 用法: <AnimeAvatar size={240} />
 */
interface Props {
  size?: number;
  className?: string;
}

const MODEL_URL = "/models/hilda.glb";

export function AnimeAvatar({ size = 240, className }: Props) {
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 1.2, 3.5], fov: 30 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.0} />
        <directionalLight position={[-2, 3, -2]} intensity={0.3} color="#c4b5fd" />
        <Environment preset="studio" environmentIntensity={0.3} />
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.4}>
          <Model />
        </Float>
      </Canvas>
    </div>
  );
}

function Model() {
  const { scene } = useGLTF(MODEL_URL);
  const ref = useRef<THREE.Group>(null);

  // 缓慢旋转 + 微摇
  useFrame(() => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.003;
  });

  return (
    <group ref={ref} scale={1.2} position={[0, -1.5, 0]}>
      <primitive object={scene} />
    </group>
  );
}

// 预加载模型
useGLTF.preload(MODEL_URL);
