/** Landing page type: Archivo (variable width — condensed for signage-style headlines) + IBM Plex Mono (ticket/receipt labels). */
import { Archivo, IBM_Plex_Mono } from 'next/font/google'

export const lpSans = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-lp-sans', display: 'swap' })
export const lpMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-lp-mono', display: 'swap' })
