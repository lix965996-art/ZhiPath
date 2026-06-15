"use client";

import { Component, Suspense, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/models/the_orange_tree.glb";
useGLTF.preload(MODEL_URL);

/** 纯装饰的知识树 — 不承载数据，只做品牌门面（首页/工作台）。 */
export function BrandTree({ className }: { className?: string }) {
  return (
    <div className={className}>
      <WebGLBoundary>
        <Canvas
          dpr={[1, 1.8]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ position: [0, 1.1, 6.4], fov: 40 }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = 1.08;
          }}
        >
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 8, 5]} intensity={1.15} />
          <directionalLight position={[-4, 3, -3]} intensity={0.35} color="#cdb6ff" />
          <Environment resolution={192} frames={1}>
            <Lightformer intensity={2.0} position={[0, 5, -2]} scale={[10, 10, 1]} color="#ffffff" />
            <Lightformer intensity={1.1} position={[-5, 2, 3]} scale={[8, 8, 1]} color="#dbe4ff" />
            <Lightformer intensity={1.2} position={[5, 1.5, 3]} scale={[7, 7, 1]} color="#fff1d6" />
          </Environment>

          <Suspense fallback={null}>
            <Tree />
          </Suspense>

          <ContactShadows position={[0, -1.5, 0]} opacity={0.24} scale={8} blur={2.9} far={4} color="#4c3b7a" />

          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={false}
            autoRotate
            autoRotateSpeed={0.6}
            rotateSpeed={0.5}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2.05}
            target={[0, 0.1, 0]}
            enableDamping
            dampingFactor={0.08}
          />
        </Canvas>
      </WebGLBoundary>
    </div>
  );
}

function Tree() {
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
    const sf = size.y > 0 ? 3.6 / size.y : 1;
    return {
      cloned,
      sf,
      position: [-center.x * sf, -1.5 - box.min.y * sf, -center.z * sf] as [number, number, number],
    };
  }, [scene]);
  return (
    <group scale={fit.sf} position={fit.position} rotation={[0, -0.15, 0]}>
      <primitive object={fit.cloned} />
    </group>
  );
}

class WebGLBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    /* 装饰元素失败时静默降级为空 */
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}
