export default function OverlayBox({ style, color, dashed, label, thick, pulse }) {
    if (!style) return null;
    
    return (
        <div
            className={`absolute pointer-events-none box-border ${pulse ? 'animate-pulse' : ''}`}
            style={{
                left: `${style.left}%`,
                top: `${style.top}%`,
                width: `${style.width}%`,
                height: `${style.height}%`,
                border: `${thick ? 3 : 2}px ${dashed ? 'dashed' : 'solid'} ${color}`,
                borderRadius: dashed ? 4 : 2,
                boxShadow: `0 0 8px ${color}66`,
            }}
        >
            {label && (
                <span
                    className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-bold rounded whitespace-nowrap"
                    style={{ backgroundColor: `${color}cc`, color: '#000' }}
                >
                    {label}
                </span>
            )}
        </div>
    );
}
