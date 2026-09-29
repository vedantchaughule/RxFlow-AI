interface RxFlowLogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  className?: string;
}

export function RxFlowLogo({ size = 'medium', showText = true, className = '' }: RxFlowLogoProps) {
  const iconSize = size === 'small' ? 24 : size === 'large' ? 40 : 32;
  const textSize = size === 'small' ? '1.1rem' : size === 'large' ? '1.75rem' : '1.35rem';

  return (
    <div className={`rxflow-logo-container ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="rxflow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="rxflow-accent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        {/* Background Card */}
        <rect width="48" height="48" rx="12" fill="url(#rxflow-grad)" />
        {/* Rx & Flow Pulse Path */}
        <path
          d="M 12 26 H 18 L 22 16 L 27 33 L 31 22 L 35 26 H 37"
          stroke="url(#rxflow-accent)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Rx Top Cross Dot */}
        <circle cx="15" cy="17" r="2.5" fill="#ffffff" />
      </svg>

      {showText && (
        <span style={{ fontSize: textSize, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-heading, #111827)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          RxFlow
          <span style={{ fontSize: '0.65em', fontWeight: 600, background: 'var(--color-primary-bg, #ccfbf1)', color: 'var(--color-primary, #0f766e)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI</span>
        </span>
      )}
    </div>
  );
}
