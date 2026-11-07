/**
 * Menu photos without any third-party service or API key.
 *
 * The admin picks a photo → it's resized and compressed in the browser to a
 * small WebP (JPEG fallback) data URL → stored directly on the menu item in
 * Firestore. Works on the free Firebase plan (no Cloud Storage needed).
 *
 * Firestore documents max out at 1 MiB, so photos are kept ≤ ~150 KB.
 */

const MAX_EDGE = 640          // px — sharp on phones, small in the database
const TARGET_BYTES = 150_000  // keep each photo comfortably under the 1 MiB doc limit

export interface CompressedImage {
  dataUrl: string
  bytes: number
  width: number
  height: number
}

/** Approximate decoded size of a base64 data URL */
export function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  return Math.round(((dataUrl.length - comma - 1) * 3) / 4)
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode() // modern browsers apply EXIF orientation automatically
    return img
  } finally {
    // revoke after decode; the decoded bitmap stays usable for drawing
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export async function compressMenuPhoto(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG, WEBP or HEIC).')
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is over 25 MB — please choose a smaller one.')

  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    throw new Error('This photo format can’t be read by the browser. Try a JPG or PNG.')
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser can’t process images.')

  // Probe WebP support once (older Safari falls back to JPEG)
  const webp = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  const type = webp ? 'image/webp' : 'image/jpeg'

  let edge = MAX_EDGE
  let best: CompressedImage | null = null
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight))
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    ctx.fillStyle = '#ffffff' // flatten transparent PNGs onto white (JPEG has no alpha)
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.82, 0.72, 0.62]) {
      const dataUrl = canvas.toDataURL(type, quality)
      const bytes = dataUrlBytes(dataUrl)
      best = { dataUrl, bytes, width: canvas.width, height: canvas.height }
      if (bytes <= TARGET_BYTES) return best
    }
    edge = Math.round(edge * 0.8) // still too big → shrink and try again
  }
  if (best && best.bytes < 600_000) return best
  throw new Error('Couldn’t make this photo small enough. Try a different photo.')
}

/** Orders must never carry embedded photos (keeps order documents small). */
export function orderSafeImage(image: string | undefined | null) {
  return image && !image.startsWith('data:') ? image : ''
}
