import { invoke } from "@tauri-apps/api/core"

export interface DpiConfig {
  enabled: boolean
  split_pos: number
  delay_ms: number
  port: number
  running: boolean
}

/** Обход DPI-блокировок: локальный прокси с фрагментацией TLS ClientHello. */
export const net = {
  dpiStatus: () => invoke<DpiConfig>("dpi_status"),
  dpiSet: (enabled: boolean, splitPos?: number, delayMs?: number) =>
    invoke<DpiConfig>("dpi_set", { enabled, splitPos, delayMs }),
}
