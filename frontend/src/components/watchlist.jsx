import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Watchlist({ onSelectTicker }) {
    const [items, setItems] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const getHeaders = () => ({
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        'Content-Type': 'application/json',
    })

    const fetchWatchlist = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/stocks/watchlist/`, { headers: getHeaders() })
            const data = await res.json()
            setItems(Array.isArray(data) ? data : [])
        } catch {
            setError('Failed to load watchlist')
        }
    }, [])

    useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

    const addTicker = async () => {
        const ticker = input.trim().toUpperCase()
        if (!ticker) return
        setLoading(true)
        setError('')
        try {
            const res = await fetch(`${API}/api/stocks/watchlist/`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ ticker }),
            })
            if (!res.ok) {
                const d = await res.json()
                setError(d?.ticker?.[0] || 'Could not add ticker')
            } else {
                setInput('')
                fetchWatchlist()
            }
        } catch {
            setError('Network error')
        } finally {
            setLoading(false)
        }
    }

    const removeTicker = async (id) => {
        await fetch(`${API}/api/stocks/watchlist/${id}/`, {
            method: 'DELETE',
            headers: getHeaders(),
        })
        setItems(prev => prev.filter(i => i.id !== id))
    }

    return (
        <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.2rem', minWidth:'200px' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <span style={{ fontWeight:600, fontSize:'0.85rem', color:'#aaa', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    Watchlist
                </span>
                <span style={{ background:'#2a2d3e', color:'#4f8ef7', fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'20px' }}>
                    {items.length}
                </span>
            </div>

            {/* Add input */}
            <div style={{ display:'flex', gap:'6px', marginBottom:'0.75rem' }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && addTicker()}
                    placeholder="Add ticker…"
                    maxLength={10}
                    style={{ flex:1, padding:'0.5rem 0.75rem', background:'#0f1117', border:'1px solid #2a2d3e', borderRadius:'6px', color:'#fff', fontSize:'0.85rem', outline:'none' }}
                />
                <button
                    onClick={addTicker}
                    disabled={loading || !input.trim()}
                    style={{ padding:'0.5rem 0.85rem', background:'#4f8ef7', color:'#fff', border:'none', borderRadius:'6px', fontSize:'1.1rem', cursor:'pointer', fontWeight:700, opacity: loading || !input.trim() ? 0.4 : 1 }}
                >+</button>
            </div>

            {error && <div style={{ color:'#e24b4a', fontSize:'12px', marginBottom:'0.5rem' }}>{error}</div>}

            {/* List */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {items.length === 0 && (
                    <div style={{ color:'#555', fontSize:'12px', textAlign:'center', padding:'1rem 0' }}>
                        Add AAPL, TSLA, NVDA…
                    </div>
                )}
                {items.map(item => (
                    <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <button
                            onClick={() => onSelectTicker && onSelectTicker(item.ticker)}
                            style={{ flex:1, textAlign:'left', padding:'0.45rem 0.75rem', background:'#0f1117', border:'1px solid #2a2d3e', borderRadius:'6px', color:'#4f8ef7', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', fontFamily:'Courier New, monospace' }}
                        >
                            {item.ticker}
                        </button>
                        <button
                            onClick={() => removeTicker(item.id)}
                            style={{ marginLeft:'6px', padding:'0.3rem 0.6rem', background:'transparent', border:'1px solid #2a2d3e', borderRadius:'6px', color:'#e24b4a', cursor:'pointer', fontSize:'1rem' }}
                        >×</button>
                    </div>
                ))}
            </div>
        </div>
    )
}
