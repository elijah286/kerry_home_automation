'use client';

import { Suspense, useMemo, type ErrorInfo, type ReactNode, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { Center, OrbitControls, useGLTF } from '@react-three/drei';

function LoadedModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return (
    <Center>
      <primitive object={scene} dispose={null} />
    </Center>
  );
}

export class GlbViewerErrorBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GLB viewer:', error, info);
    this.props.onError(error.message || 'Failed to load model');
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

export function GlbOrbitViewer({
  url,
  onLoadError,
}: {
  url: string;
  onLoadError: (message: string) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.35, 5.2], fov: 45 }}
      gl={{ alpha: false, antialias: true }}
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%', display: 'block', background: '#030308' }}
    >
      <color attach="background" args={['#030308']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 8, 4]} intensity={1.1} />
      <directionalLight position={[-4, -2, -6]} intensity={0.35} />
      <GlbViewerErrorBoundary onError={onLoadError}>
        <Suspense fallback={null}>
          <LoadedModel url={url} />
        </Suspense>
      </GlbViewerErrorBoundary>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.35}
        minDistance={0.8}
        maxDistance={80}
      />
    </Canvas>
  );
}
