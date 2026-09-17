const DEVICE_ID_KEY = 'abv.deviceId'
const DEVICE_LABEL_KEY = 'abv.deviceLabel'

/** Stable per-browser-profile id. Used to scope folder setup to this device. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent
  if (ua.includes('Macintosh')) return 'Mac'
  if (ua.includes('Windows')) return 'Windows PC'
  if (ua.includes('Linux')) return 'Linux'
  return 'This device'
}

export function getDeviceLabel(): string {
  return localStorage.getItem(DEVICE_LABEL_KEY) ?? guessDeviceLabel()
}

export function setDeviceLabel(label: string): void {
  localStorage.setItem(DEVICE_LABEL_KEY, label)
}
