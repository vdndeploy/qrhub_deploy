import React from 'react';

/**
 * Tap-friendly action button for the mobile card stack layout used in
 * Vendors / Stores / Posts.
 *
 * - Touch target ≥ 44×44 (Apple HIG / Material guidelines)
 * - Icon-only, label sits below in a tiny pill so the user knows what it does
 * - `tint` colors the icon stroke (lime by default to follow the dark+lime theme)
 */
const MobileActionBtn = React.forwardRef(({
  icon: Icon,
  label,
  onClick,
  tint,
  active = false,
  disabled = false,
  ...rest
}, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-center justify-center gap-1
        rounded-xl border bg-white dark:bg-[#0f0f12]
        ${active
          ? 'border-emerald-500/70 ring-1 ring-emerald-400/30'
          : 'border-gray-200 dark:border-white/10'
        }
        min-h-[60px] py-2 px-1
        active:scale-95 transition-transform
        disabled:opacity-40 disabled:cursor-not-allowed
        touch-manipulation
      `}
      {...rest}
    >
      {Icon && (
        <Icon
          className="h-5 w-5"
          style={tint ? { color: tint } : undefined}
        />
      )}
      <span className="text-[10px] leading-tight font-medium text-gray-700 dark:text-[#a8a8b0]">
        {label}
      </span>
    </button>
  );
});

MobileActionBtn.displayName = 'MobileActionBtn';

export default MobileActionBtn;
