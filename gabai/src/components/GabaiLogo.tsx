import React from 'react'

interface GabaiLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number
  className?: string
  transparent?: boolean
  withText?: boolean
  subtitle?: string
  glow?: boolean
  animated?: boolean
}

export default function GabaiLogo({
  size = 'md',
  className = '',
  transparent = true,
  withText = false,
  subtitle,
  glow = false,
  animated = false,
}: GabaiLogoProps) {
  const sizeMap: Record<string, { container: string; img: string; text: string; sub: string }> = {
    xs: { container: 'w-6 h-6', img: 'w-6 h-6', text: 'text-xs', sub: 'text-[9px]' },
    sm: { container: 'w-8 h-8', img: 'w-8 h-8', text: 'text-sm', sub: 'text-[10px]' },
    md: { container: 'w-10 h-10', img: 'w-10 h-10', text: 'text-base', sub: 'text-xs' },
    lg: { container: 'w-12 h-12', img: 'w-12 h-12', text: 'text-lg', sub: 'text-xs' },
    xl: { container: 'w-16 h-16', img: 'w-16 h-16', text: 'text-2xl', sub: 'text-sm' },
    '2xl': { container: 'w-24 h-24', img: 'w-24 h-24', text: 'text-3xl', sub: 'text-base' },
  }

  const isPreset = typeof size === 'string' && size in sizeMap
  const preset = isPreset ? sizeMap[size as string] : sizeMap.md

  const customStyle = typeof size === 'number' ? { width: `${size}px`, height: `${size}px` } : undefined

  const logoSrc = transparent ? '/gabai-logo-transparent.png' : '/gabai-logo.png'

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div
        className={`relative shrink-0 flex items-center justify-center ${
          isPreset ? preset.container : ''
        } ${animated ? 'transition-transform duration-300 hover:scale-105 active:scale-95' : ''}`}
        style={customStyle}
      >
        {glow && (
          <div className="absolute inset-0 rounded-full bg-cyan-500/25 blur-lg animate-pulse pointer-events-none" />
        )}
        <img
          src={logoSrc}
          alt="GABAI Logo"
          className={`w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(6,182,212,0.25)] ${
            animated ? 'hover:rotate-3 transition-transform duration-300' : ''
          }`}
          loading="eager"
        />
      </div>

      {withText && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-tight text-slate-900 dark:text-white ${
                isPreset ? preset.text : 'text-base'
              }`}
            >
              GABAI
            </span>
          </div>
          {subtitle && (
            <span
              className={`font-medium text-slate-500 dark:text-slate-400 ${
                isPreset ? preset.sub : 'text-xs'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
