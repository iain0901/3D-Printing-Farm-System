// Media URLs are short-lived, reservation-scoped gateway URLs, never printer IPs.
export function cameraSession(value, reservationId, now = Date.now(), origin = location.origin) {
  const camera = value?.camera
  if (!camera || camera.state !== 'ready') return null
  const expires = Date.parse(camera.expiresAt)
  const path = `/api/customer/workspace/free-print/reservations/${encodeURIComponent(reservationId)}/camera/`
  const url = new URL(camera.mediaUrl, origin)
  if (
    !['mjpeg', 'snapshot', 'video'].includes(camera.kind) ||
    typeof camera.mediaUrl !== 'string' ||
    !camera.mediaUrl.startsWith(path) ||
    url.origin !== origin ||
    !url.pathname.startsWith(path) ||
    !Number.isFinite(expires) ||
    expires <= now ||
    expires > now + 120000
  )
    throw new Error('攝影機連線資料無效，請重新連線。')
  return { ...camera, expires, mediaUrl: url.pathname + url.search }
}
