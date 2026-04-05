import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SIGNAL_COLOR = { BUY: '#1D9E75', HOLD: '#EF9F27', SELL: '#E24B4A' }

export default function HistoryPage() {
    const [history, setHistory] = useState([])
    const [stats,   setStats]   = useState(null)
    const [filter,  setFilter]  = useState('')
    const [loading, setLoading] = useState(true)
    const [error,   setError]   = useState('')

    const getHeaders = () => ({
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
    })

    useEffect(() => {
        const url = filter
            ? `${API}/api/stocks/history/?ticker=${filter.toUpperCase()}`
            : `${API}/api/stocks/history/`

        Promise.all([
            fetch(url, { headers: getHeaders() }).then(r => r.json()),
            fetch(`${API}/api/stocks/history/stats/`, { headers: getHeaders() }).then(r => r.json()),
        ])
        .then(([hist, st]) => {
            setHistory(Array.isArray(hist) ? hist : [])
            setStats(st)
            setLoading(false)
        })
        .catch(e => {
            setError('Failed to load history')
            setLoading(false)
        })
    }, [filter])

    if (loading) return (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'60vh', color:'#888', fontSize:'1.1rem' }}>
            Loading history…
        </div>
    )

    if (error) return (
        <div style={{ textAlign:'center', color:'#e24b4a', padding:'3rem' }}>{error}</div>
    )

    return (
        <div style={{ padding:'2rem', maxWidth:'1200px', margin:'0 auto' }}>

            <h2 style={{ color:'#fff', marginBottom:'1.5rem', fontSize:'1.5rem' }}>Prediction History</h2>

            {/* Stats strip */}
            {stats && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'12px', marginBottom:'1.5rem' }}>
                    {[
                        { val: stats.total_predictions,                              lbl: 'Total',     color: '#fff' },
                        { val: stats.accuracy_pct != null ? `${stats.accuracy_pct}%` : '—', lbl: 'Accuracy', color: '#1D9E75' },
                        { val: stats.buy_signals,                                    lbl: 'BUY',       color: '#1D9E75' },
                        { val: stats.sell_signals,                                   lbl: 'SELL',      color: '#E24B4A' },
                        { val: stats.hold_signals,                                   lbl: 'HOLD',      color: '#EF9F27' },
                    ].map(s => (
                        <div key={s.lbl} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'10px', padding:'1rem', textAlign:'center' }}>
                            <div style={{ fontSize:'1.6rem', fontWeight:700, fontFamily:'Courier New, monospace', color: s.color }}>{s.val}</div>
                            <div style={{ fontSize:'11px', color:'#888', marginTop:'4px', textTransform:'uppercase', letterSpacing:'0.4px' }}>{s.lbl}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter bar */}
            <div style={{ display:'flex', gap:'10px', marginBottom:'1.2rem', alignItems:'center' }}>
                <input
                    placeholder="Filter by ticker…"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{ padding:'0.6rem 1rem', background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff', fontSize:'0.9rem', outline:'none', width:'220px' }}
                />
                {filter && (
                    <button
                        onClick={() => setFilter('')}
                        style={{ padding:'0.6rem 1rem', background:'transparent', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#aaa', cursor:'pointer', fontSize:'0.85rem' }}
                    >Clear</button>
                )}
            </div>

            {/* Empty state */}
            {history.length === 0 ? (
                <div style={{ textAlign:'center', color:'#555', padding:'3rem', fontSize:'1rem' }}>
                    No predictions yet. Go predict a stock!
                </div>
            ) : (
                <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', overflow:'hidden' }}>
                    {/* Table header */}
                    <div style={{ display:'grid', gridTemplateColumns:'80px 100px 110px 120px 130px 80px 130px 80px', padding:'0.75rem 1rem', gap:'8px', background:'#0f1117', borderBottom:'1px solid #2a2d3e', fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                        <span>Ticker</span>
                        <span>Date</span>
                        <span>Price then</span>
                        <span>7d target</span>
                        <span>Exp. return</span>
                        <span>Signal</span>
                        <span>Actual (7d)</span>
                        <span>Correct?</span>
                    </div>

                    {/* Rows */}
                    {history.map((p, i) => (
                        <div
                            key={p.id}
                            style={{ display:'grid', gridTemplateColumns:'80px 100px 110px 120px 130px 80px 130px 80px', padding:'0.75rem 1rem', gap:'8px', alignItems:'center', fontSize:'0.82rem', fontFamily:'Courier New, monospace', color:'#ccc', borderBottom: i < history.length - 1 ? '1px solid #1e2132' : 'none' }}
                        >
                            <span style={{ color:'#4f8ef7', fontWeight:700, fontSize:'0.9rem' }}>{p.ticker}</span>
                            <span style={{ color:'#888', fontFamily:'Segoe UI, sans-serif', fontSize:'0.8rem' }}>
                                {new Date(p.predicted_at).toLocaleDateString()}
                            </span>
                            <span>${p.price_at_prediction.toFixed(2)}</span>
                            <span>${p.predicted_prices[p.predicted_prices.length - 1].toFixed(2)}</span>
                            <span style={{ color: p.expected_return >= 0 ? '#1D9E75' : '#E24B4A' }}>
                                {p.expected_return >= 0 ? '+' : ''}{p.expected_return}%
                            </span>
                            <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:700, fontFamily:'Segoe UI, sans-serif', textAlign:'center', background: SIGNAL_COLOR[p.signal] + '22', color: SIGNAL_COLOR[p.signal] }}>
                                {p.signal}
                            </span>
                            <span>
                                {p.actual_price_after_7d != null
                                    ? `$${p.actual_price_after_7d.toFixed(2)}`
                                    : <span style={{ color:'#555' }}>Pending…</span>}
                            </span>
                            <span>
                                {p.was_correct === true  && <span style={{ color:'#1D9E75' }}>✓ Yes</span>}
                                {p.was_correct === false && <span style={{ color:'#E24B4A' }}>✗ No</span>}
                                {p.was_correct === null  && <span style={{ color:'#555' }}>—</span>}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
