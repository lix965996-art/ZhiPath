"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Sparkles, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";

const MODEL_URL = "/models/hilda.glb";

interface Props {
  mouth: number;
  playing: boolean;
  captionText: string;
}

function TypingCaption({ text, active }: { text: string; active: boolean }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }

    setShown("");
    if (!active) {
      setShown(text);
      return;
    }

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      index += 1;
      setShown(text.slice(0, index));
      if (index < text.length) {
        timer = setTimeout(tick, 42);
      }
    };

    timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, [text, active]);

  return <span>{shown}</span>;
}

function PortraitCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0.58, 2.65);
    camera.lookAt(0, 0.18, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

export function DigitalHumanStage3D({ mouth, playing, captionText }: Props) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b1020]">
      <div
        className="relative flex-1"
        style={{
          aspectRatio: "16 / 11",
          minHeight: 360,
          background: "linear-gradient(180deg, #111827 0%, #0b1020 54%, #080b16 100%)",
        }}
      >
        <div className="absolute inset-0">
          <Canvas camera={{ position: [0, 0.58, 2.65], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
            <PortraitCamera />
            <color attach="background" args={["#080b16"]} />
            <fog attach="fog" args={["#070817", 4, 10]} />

            <ambientLight intensity={0.82} color="#fff7ed" />
            <directionalLight position={[1.8, 2.5, 3]} intensity={1.35} color="#fff3d0" />
            <pointLight position={[-1.6, 1.2, 1.8]} intensity={0.62} color="#93c5fd" />
            <pointLight position={[1.2, 0.4, 1.5]} intensity={0.28} color="#c084fc" />

            <HildaModel mouth={mouth} playing={playing} />
            <Sparkles count={8} scale={[2.2, 1.4, 1]} size={0.75} speed={0.12} color="#93c5fd" />

            <EffectComposer>
              <Bloom intensity={0.18} luminanceThreshold={0.34} luminanceSmoothing={0.8} mipmapBlur />
              <Vignette eskil={false} offset={0.18} darkness={0.42} />
            </EffectComposer>
          </Canvas>
        </div>

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              playing ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" : "bg-slate-500"
            }`}
          />
          <span className={`font-mono text-[10px] font-semibold ${playing ? "text-emerald-200" : "text-slate-300"}`}>
            {playing ? "TTS ON" : "IDLE"}
          </span>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/35 px-2.5 py-1 font-mono text-[9.5px] text-slate-200/70">
          3D 助教
        </div>
      </div>

      <AnimatePresence mode="wait">
        {captionText ? (
          <motion.div
            key={captionText}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 border-t border-white/10 bg-black/72 px-4 py-2.5"
          >
            <p className="flex items-start gap-2 text-[12.5px] leading-5 text-slate-50">
              <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-slate-300" />
              <TypingCaption text={captionText} active={playing} />
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function HildaModel({ mouth, playing }: { mouth: number; playing: boolean }) {
  const { scene } = useGLTF(MODEL_URL);
  const groupRef = useRef<THREE.Group>(null);
  const normalizedRef = useRef(false);

  if (!normalizedRef.current) {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.sub(center);
    normalizedRef.current = true;
  }

  useFrame(() => {
    if (!groupRef.current) return;

    const t = performance.now() / 1000;
    groupRef.current.rotation.y = Math.sin(t * 0.22) * 0.1;
    groupRef.current.position.y = -0.34 + Math.sin(t * 0.72) * 0.012;

    if (playing && mouth > 0.08) {
      groupRef.current.rotation.x = -0.014 * mouth;
      groupRef.current.position.y += mouth * 0.004;
    } else {
      groupRef.current.rotation.x = Math.sin(t * 0.36) * 0.012;
    }
  });

  return (
    <Float speed={0.75} rotationIntensity={0.03} floatIntensity={0.08}>
      <group ref={groupRef} scale={1.24} position={[0, -0.34, 0]}>
        <primitive object={scene} />
      </group>
    </Float>
  );
}

useGLTF.preload(MODEL_URL);
