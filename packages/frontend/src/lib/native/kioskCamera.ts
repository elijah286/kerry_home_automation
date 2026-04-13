import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
  type Photo,
} from '@capacitor/camera';

/** Front camera capture for kiosk flows (permissions must be granted in Info.plist / AndroidManifest). */
export async function takeFrontCameraPhoto(): Promise<Photo> {
  return Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
    direction: CameraDirection.Front,
    quality: 90,
  });
}

export { CameraSource, CameraDirection, CameraResultType };
