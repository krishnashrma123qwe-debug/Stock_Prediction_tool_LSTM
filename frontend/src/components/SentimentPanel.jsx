// SentimentPanel.jsx
// Drop this anywhere inside Dashboard.jsx after the indicator pills
// Props: sentiment = data.sentiment from the API response

const COLORS = {
    BULLISH: { bg: '#0a2e1a', color: '#1D9E75', border: '#1D9E75', emoji: '📈' },
    BEARISH: { bg: '#2e0a0a', color: '#E24B4A', border: '#E24B4A', emoji: '📉' },
    NEUTRAL: { bg: '#2e2100', color: '#EF9F27', border: '#EF9F27', emoji: '➡️' },
}

export default function SentimentPanel({ sentiment }) {
    if (!sentiment) return null

    // If news API errored but returned gracefully
    const hasError    = !!sentiment.error
    const label       = sentiment.label   || 'NEUTRAL'
    const score       = sentiment.score   || 0
    const headlines   = sentiment.headlines || []
    const style       = COLORS[label] || COLORS['NEUTRAL']
    const total       = sentiment.total_articles || 0
    const pos         = sentiment.positive_count || 0
    const neg         = sentiment.negative_count || 0
    const neu         = sentiment.neutral_count  || 0

    // Score bar width: map -1..+1 → 0..100%
    const barPct    = Math.round((score + 1) / 2 * 100)
    const barColor  = score >= 0.15 ? '#1D9E75' : score <= -0.15 ? '#E24B4A' : '#EF9F27'

    return (
        <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <span style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    News Sentiment — Last 7 Days
                </span>
                <span style={{ fontSize:'12px', fontWeight:700, padding:'4px 14px', borderRadius:'20px',
                    background: style.bg, border:`1px solid ${style.border}`, color: style.color }}>
                    {style.emoji} {label}
                </span>
            </div>

            {hasError ? (
                <div style={{ color:'#555', fontSize:'13px', textAlign:'center', padding:'1rem 0' }}>
                    {sentiment.error}
                </div>
            ) : (<>

                {/* Sentiment score bar */}
                <div style={{ marginBottom:'1rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#666', marginBottom:'4px' }}>
                        <span>Bearish</span>
                        <span style={{ color: barColor, fontWeight:600 }}>Score: {score > 0 ? '+' : ''}{score}</span>
                        <span>Bullish</span>
                    </div>
                    <div style={{ height:'8px', background:'#0f1117', borderRadius:'4px', overflow:'hidden', position:'relative' }}>
                        {/* Center line */}
                        <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:'1px', background:'#2a2d3e' }}/>
                        {/* Score fill */}
                        <div style={{
                            position:'absolute',
                            height:'100%',
                            background: barColor,
                            borderRadius:'4px',
                            left:  score >= 0 ? '50%' : `${barPct}%`,
                            width: `${Math.abs(score) * 50}%`,
                        }}/>
                    </div>
                </div>

                {/* Article breakdown pills */}
                <div style={{ display:'flex', gap:'8px', marginBottom:'1rem', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', background:'#0a2e1a', color:'#1D9E75', fontWeight:600 }}>
                        📈 {pos} Bullish
                    </span>
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', background:'#2e0a0a', color:'#E24B4A', fontWeight:600 }}>
                        📉 {neg} Bearish
                    </span>
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', background:'#2e2100', color:'#EF9F27', fontWeight:600 }}>
                        ➡️ {neu} Neutral
                    </span>
                    <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', background:'#1a1d27', color:'#555', border:'1px solid #2a2d3e' }}>
                        {total} articles analysed
                    </span>
                </div>

                {/* Headlines */}
                {headlines.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {headlines.map((h, i) => {
                            const hStyle = COLORS[h.label] || COLORS['NEUTRAL']
                            return (
                                <a
                                    key={i}
                                    href={h.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ textDecoration:'none' }}
                                >
                                    <div style={{
                                        display:'flex', justifyContent:'space-between', alignItems:'center',
                                        padding:'8px 12px', background:'#0f1117', borderRadius:'6px',
                                        border:`1px solid #1e2132`,
                                        transition:'border-color .15s', cursor:'pointer',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2d3e'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#1e2132'}
                                    >
                                        <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontSize:'12px', color:'#ccc', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                                {h.title}
                                            </div>
                                            <div style={{ fontSize:'11px', color:'#555', marginTop:'2px' }}>
                                                {h.source} · {h.published}
                                            </div>
                                        </div>
                                        <span style={{
                                            marginLeft:'10px', flexShrink:0,
                                            fontSize:'10px', fontWeight:700,
                                            padding:'2px 8px', borderRadius:'12px',
                                            background: hStyle.bg, color: hStyle.color,
                                        }}>
                                            {h.label}
                                        </span>
                                    </div>
                                </a>
                            )
                        })}
                    </div>
                )}
            </>)}
        </div>
    )
}
