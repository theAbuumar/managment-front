import client from './client'

// «О системе» (13.D4, 13.F4): the API version on this stand, its build and the
// support contact set by the stand's owner (`SUPPORT_CONTACT`).
export interface AboutInfo {
  version: string
  commit: string | null
  started_at: string
  support: string | null
}

export const getAbout = () => client.get<unknown, AboutInfo>('/about/')
