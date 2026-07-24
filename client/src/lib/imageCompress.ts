// Client-side image downscale + JPEG compression, returning a data: URL.
// Works offline (no network, no Supabase). Mirrors the copy inside
// pages/InspectionWizard.tsx so photo capture behaves identically across the
// door and ceiling wizards.
export async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  try {
    const img: HTMLImageElement = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const s = maxDim / Math.max(width, height);
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl; // fall back to the original if canvas processing fails
  }
}
