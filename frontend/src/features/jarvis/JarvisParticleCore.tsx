import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, MathUtils, type Group, type Mesh, type ShaderMaterial } from 'three';
import { useReducedMotion } from 'motion/react';
import type { JarvisVisualState } from './jarvis.types';

const vertexShader = /* glsl */`
  attribute float aSeed;
  attribute float aSize;
  attribute float aLayer;

  uniform float uTime;
  uniform float uState;
  uniform float uAmplitude;
  uniform float uPixelRatio;
  uniform float uReducedMotion;

  varying float vAlpha;
  varying float vMix;

  float stateWeight(float target) {
    return 1.0 - clamp(abs(uState - target), 0.0, 1.0);
  }

  void main() {
    vec3 base = position;
    vec3 normal = normalize(base + vec3(0.0001));
    vec3 tangent = normalize(cross(normal, vec3(0.17, 1.0, 0.09)) + vec3(0.0001));

    float idle = stateWeight(0.0);
    float listening = stateWeight(1.0);
    float thinking = max(stateWeight(2.0), stateWeight(2.5));
    float speaking = stateWeight(3.0);
    float confirmation = stateWeight(4.0);
    float success = stateWeight(5.0);
    float warning = stateWeight(6.0);
    float errorState = stateWeight(7.0);

    float motionScale = mix(1.0, 0.18, uReducedMotion);
    float layerFreedom = mix(0.38, 1.0, aLayer / 2.0);
    float slowWave = sin(uTime * 0.34 + aSeed * 18.0 + base.y * 2.7);
    float crossWave = cos(uTime * 0.23 + aSeed * 11.0 + base.x * 3.1);
    float breath = 1.0 + motionScale * (0.007 + idle * 0.006) * slowWave;

    float audioPulse = uAmplitude * (
      listening * (0.025 + 0.024 * sin(uTime * 2.0 + aSeed * 12.0)) +
      speaking * (0.050 + 0.038 * sin(uTime * 3.1 + aSeed * 15.0))
    );

    float inward = thinking * (-0.028 + 0.012 * slowWave);
    float confirmHold = confirmation * -0.008;
    float successPulse = success * 0.025 * exp(-mod(uTime, 1.8) * 2.4);
    float warningPulse = warning * 0.012 * sin(uTime * 1.4 + aSeed * 3.0);
    float errorNoise = errorState * layerFreedom * 0.018 * sin(uTime * 1.8 + aSeed * 31.0);

    vec3 displaced = base * (breath + audioPulse + inward + confirmHold + successPulse + warningPulse + errorNoise);

    float flow = motionScale * layerFreedom * (
      idle * 0.006 +
      listening * (0.008 + uAmplitude * 0.026) +
      thinking * 0.020 +
      speaking * (0.012 + uAmplitude * 0.034) +
      warning * 0.008 +
      errorState * 0.014
    );
    displaced += tangent * flow * (slowWave * 0.72 + crossWave * 0.28);

    // Thinking remains structured: a bounded spiral rather than random travel.
    float angle = thinking * motionScale * (0.10 * sin(uTime * 0.55 + base.y * 3.0 + aSeed * 2.0));
    float c = cos(angle);
    float s = sin(angle);
    displaced.xz = mat2(c, -s, s, c) * displaced.xz;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float perspective = clamp(2.8 / max(1.4, -mvPosition.z), 0.45, 1.55);
    gl_PointSize = max(1.0, aSize * uPixelRatio * perspective * (1.0 + uAmplitude * (listening * 0.22 + speaking * 0.34)));

    vAlpha = mix(0.42, 0.90, clamp((displaced.z + 1.4) / 2.8, 0.0, 1.0));
    vAlpha *= mix(1.0, 0.58, step(1.5, aLayer));
    vMix = clamp(0.25 + aLayer * 0.24 + uAmplitude * 0.18, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;
  varying float vMix;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(center);
    if (distanceToCenter > 0.5) discard;
    float core = smoothstep(0.50, 0.05, distanceToCenter);
    float halo = smoothstep(0.50, 0.22, distanceToCenter) * 0.35;
    vec3 color = mix(uColorA, uColorB, vMix);
    gl_FragColor = vec4(color, (core + halo) * vAlpha);
  }
`;

type CoreProps = { state: JarvisVisualState; amplitude: number; compact: boolean; reducedMotion: boolean };

type ParticleData = {
  positions: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
  layers: Float32Array;
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function createParticleData(count: number): ParticleData {
  const random = seededRandom(0x5f3759df);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const layers = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const ratio = index / count;
    const layer = ratio < 0.15 ? 0 : ratio < 0.90 ? 1 : 2;
    const u = random();
    const v = random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const radius = layer === 0
      ? 0.16 + Math.cbrt(random()) * 0.48
      : layer === 1
        ? 0.62 + Math.pow(random(), 0.72) * 0.38
        : 1.04 + random() * 0.22;
    const sinPhi = Math.sin(phi);
    positions[index * 3] = radius * sinPhi * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * sinPhi * Math.sin(theta);
    seeds[index] = random();
    sizes[index] = layer === 0 ? 2.0 + random() * 1.7 : layer === 1 ? 1.35 + random() * 1.45 : 0.9 + random() * 1.1;
    layers[index] = layer;
  }
  return { positions, seeds, sizes, layers };
}

function stateValue(state: JarvisVisualState): number {
  if (state === 'listening') return 1;
  if (state === 'thinking') return 2;
  if (state === 'tool_running' || state === 'transcribing') return 2.5;
  if (state === 'speaking') return 3;
  if (state === 'needs_confirmation') return 4;
  if (state === 'success') return 5;
  if (state === 'warning') return 6;
  if (state === 'error' || state === 'disconnected') return 7;
  return 0;
}

function paletteFor(state: JarvisVisualState): [Color, Color] {
  if (state === 'listening') return [new Color('#45fff0'), new Color('#12b8ff')];
  if (state === 'thinking' || state === 'tool_running' || state === 'transcribing') return [new Color('#4fc7ff'), new Color('#385cff')];
  if (state === 'speaking') return [new Color('#8d78ff'), new Color('#35e6ff')];
  if (state === 'needs_confirmation' || state === 'warning') return [new Color('#ffcf6b'), new Color('#42d8c8')];
  if (state === 'error' || state === 'disconnected') return [new Color('#ff7c8e'), new Color('#57727a')];
  if (state === 'success') return [new Color('#69f5c3'), new Color('#20c9e9')];
  return [new Color('#45e7db'), new Color('#2487ff')];
}

function ParticleCloud({ state, amplitude, compact, reducedMotion }: CoreProps) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const count = compact ? 7000 : 22000;
  const particles = useMemo(() => createParticleData(count), [count]);
  const uniforms = useMemo(() => {
    const [colorA, colorB] = paletteFor(state);
    return {
      uTime: { value: 0 },
      uState: { value: stateValue(state) },
      uAmplitude: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.65) * 2.2 },
      uReducedMotion: { value: reducedMotion ? 1 : 0 },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
    };
  }, [compact, reducedMotion]);

  useFrame(({ clock }, delta) => {
    if (!material.current || !group.current) return;
    const targetState = stateValue(state);
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uState.value = MathUtils.damp(material.current.uniforms.uState.value, targetState, 4.2, delta);
    material.current.uniforms.uAmplitude.value = MathUtils.damp(material.current.uniforms.uAmplitude.value, Math.min(1, Math.max(0, amplitude)), 7.5, delta);
    material.current.uniforms.uReducedMotion.value = reducedMotion ? 1 : 0;
    const [targetA, targetB] = paletteFor(state);
    material.current.uniforms.uColorA.value.lerp(targetA, Math.min(1, delta * 2.4));
    material.current.uniforms.uColorB.value.lerp(targetB, Math.min(1, delta * 2.4));
    const rotationSpeed = reducedMotion ? 0 : state === 'thinking' || state === 'tool_running' ? 0.055 : state === 'speaking' ? 0.045 : 0.018;
    group.current.rotation.y += delta * rotationSpeed;
    group.current.rotation.x = Math.sin(clock.elapsedTime * 0.16) * (reducedMotion ? 0.008 : 0.025);
  });

  return <group ref={group} scale={compact ? 0.92 : 1.06}>
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[particles.positions, 3]}/>
        <bufferAttribute attach="attributes-aSeed" args={[particles.seeds, 1]}/>
        <bufferAttribute attach="attributes-aSize" args={[particles.sizes, 1]}/>
        <bufferAttribute attach="attributes-aLayer" args={[particles.layers, 1]}/>
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  </group>;
}

function EnergyCore({ state, amplitude, compact }: Pick<CoreProps, 'state' | 'amplitude' | 'compact'>) {
  const mesh = useRef<Mesh>(null);
  useFrame(({ clock }, delta) => {
    if (!mesh.current) return;
    const base = compact ? 0.13 : 0.15;
    const pulse = state === 'listening' || state === 'speaking' ? amplitude * 0.018 : Math.sin(clock.elapsedTime * 0.72) * 0.004;
    const target = base + pulse;
    mesh.current.scale.x = MathUtils.damp(mesh.current.scale.x, target, 5, delta);
    mesh.current.scale.y = MathUtils.damp(mesh.current.scale.y, target, 5, delta);
    mesh.current.scale.z = MathUtils.damp(mesh.current.scale.z, target, 5, delta);
  });
  const [color] = paletteFor(state);
  return <mesh ref={mesh} scale={compact ? 0.13 : 0.15}>
    <sphereGeometry args={[1, 32, 32]}/>
    <meshBasicMaterial color={color} transparent opacity={0.66} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/>
  </mesh>;
}

export function JarvisParticleCore({ state, amplitude, compact = false }: { state: JarvisVisualState; amplitude: number; compact?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  return <div className={`jarvis-particle-stage jarvis-particle-stage-${state}`} aria-hidden="true">
    <Canvas
      className="jarvis-particle-canvas"
      camera={{ position: [0, 0, compact ? 3.35 : 3.85], fov: compact ? 42 : 38, near: 0.1, far: 30 }}
      dpr={[1, compact ? 1.25 : 1.6]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      resize={{ scroll: false, debounce: { scroll: 50, resize: 80 } }}
    >
      <ParticleCloud state={state} amplitude={amplitude} compact={compact} reducedMotion={reducedMotion}/>
      <EnergyCore state={state} amplitude={amplitude} compact={compact}/>
    </Canvas>
  </div>;
}
