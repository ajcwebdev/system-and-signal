export function l(...args: Parameters<typeof console.log>) {
  console.log(...args)
}

export function err(...args: Parameters<typeof console.error>) {
  console.error(...args)
}
