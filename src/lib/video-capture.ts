import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

type VideoCaptureModule = {
  start(rate: number): Promise<void>;
  stop(): Promise<string>;
  setOverlay(vertices: number[], mood: string, color: number, delayMs: number, sampledAtPerfMs: number, sentAtWallMs: number): void;
  greet(): void;
  appendAudio(atFrame: number, pcm: Uint8Array): void;
  save(uri: string): Promise<void>;
};

const native = requireNativeModule<VideoCaptureModule>('SaviasoundVideo');
export const SaviasoundCamera: ComponentType<ViewProps> = requireNativeViewManager('SaviasoundVideo');

export const videoCapture = {
  start: (rate: number) => native.start(rate),
  stop: () => native.stop(),
  setOverlay: (vertices: number[], mood: string, color: number, delayMs: number, sampledAtPerfMs: number, sentAtWallMs: number) =>
    native.setOverlay(vertices, mood, color, delayMs, sampledAtPerfMs, sentAtWallMs),
  greet: () => native.greet(),
  appendAudio: (atFrame: number, pcm: Uint8Array) => native.appendAudio(atFrame, pcm),
  save: (uri: string) => native.save(uri),
};
