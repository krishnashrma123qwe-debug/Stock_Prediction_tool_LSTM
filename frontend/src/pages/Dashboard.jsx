import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ComposedChart, LineChart, Line, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ReferenceLine, ResponsiveContainer, Bar
} from 'recharts'
import Watchlist from '../components/Watchlist'
import SentimentPanel from '../components/SentimentPanel'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SIG = {
    'STRONG BUY':  { bg:'#0a2e1a', color:'#1D9E75', border:'#1D9E75' },
    'BUY':         { bg:'#0a2e1a', color:'#1D9E75', border:'#1D9E75' },
    'HOLD':        { bg:'#2e2100', color:'#EF9F27', border:'#EF9F27' },
    'SELL':        { bg:'#2e0a0a', color:'#E24B4A', border:'#E24B4A' },
    'STRONG SELL': { bg:'#2e0a0a', color:'#E24B4A', border:'#E24B4A' },
}

const tt = { contentStyle:{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff' } }

export default function Dashboard() {
    const [ticker,  setTicker]  = useState('')
    const [data,    setData]    = useState(null)
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState('')
    const navigate = useNavigate()

    const token = localStorage.getItem('access_token')
    const user  = localStorage.getItem('username') || 'User'

    const logout = () => { localStorage.clear(); navigate('/login') }

    // ── FIX: when watchlist ticker clicked → set ticker AND auto-predict ──
    const handleWatchlistSelect = (t) => {
        setTicker(t)
        runPredict(t)
    }

    const runPredict = async (tickerOverride) => {
        const t = (tickerOverride || ticker).trim().toUpperCase()
        if (!t) return
        setLoading(true)
        setError('')
        setData(null)
        try {
            const res  = await fetch(`${API}/api/stocks/predict/?ticker=${t}`,
                { headers: { Authorization: `Bearer ${token}` } })
            const json = await res.json()
            if (!res.ok) { setError(json.error || 'Prediction failed'); return }
            setData(json)
        } catch {
            setError('Network error — is Django running?')
        } finally {
            setLoading(false)
        }
    }

    // ── Chart data builders ───────────────────────────────────────────────
    const mainChart = () => {
        if (!data) return []
        const hist = data.historical_prices.map((p, i) => ({
            name:`H${i+1}`, historical:p, predicted:null, upper:null, lower:null
        }))
        const pred = data.predicted_prices.map((p, i) => ({
            name:`F${i+1}`, historical:null, predicted:p,
            upper: data.confidence_upper?.[i] ?? null,
            lower: data.confidence_lower?.[i] ?? null,
        }))
        return [...hist, ...pred]
    }

    const rsiChart = () => {
        if (!data?.indicators?.rsi?.values) return []
        return data.indicators.rsi.values.map((v, i) => ({ name:`${i+1}`, rsi:v }))
    }

    const macdChart = () => {
        if (!data?.indicators?.macd?.macd_line) return []
        return data.indicators.macd.macd_line.map((v, i) => ({
            name:`${i+1}`,
            macd:    v,
            signal:  data.indicators.macd.signal_line[i],
            histogram: data.indicators.macd.histogram[i],
        }))
    }

    const ind  = data?.indicators
    const sig  = data?.combined_signal || data?.signal || 'HOLD'
    const sigStyle = SIG[sig] || SIG['HOLD']

    return (
        <div style={{ minHeight:'100vh', background:'#0f1117' }}>

            {/* Navbar */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem 2rem', background:'#1a1d27', borderBottom:'1px solid #2a2d3e' }}>
                <span style={{ fontSize:'1.2rem', fontWeight:700, color:'#4f8ef7' }}>StockPredict</span>
                <div style={{ display:'flex', gap:'1.5rem', alignItems:'center' }}>
                    <span onClick={() => navigate('/history')} style={{ color:'#4f8ef7', cursor:'pointer', fontSize:'0.9rem' }}>
                        History
                    </span>
                    <span onClick={() => navigate('/backtest')} style={{ color:'#4f8ef7', cursor:'pointer', fontSize:'0.9rem' }}>
                        Backtest
                    </span>
                    <span style={{ color:'#aaa', fontSize:'0.9rem' }}>Hello, {user}</span>
                    <button onClick={logout} style={{ padding:'0.4rem 1rem', background:'transparent', border:'1px solid #e24b4a', color:'#e24b4a', borderRadius:'6px', cursor:'pointer', fontSize:'0.9rem' }}>
                        Logout
                    </button>
                    
                </div>
            </div>

            <div style={{ display:'flex', gap:'1.5rem', padding:'2rem', alignItems:'flex-start' }}>

                {/* Watchlist sidebar */}
                <div style={{ width:'210px', flexShrink:0 }}>
                    <Watchlist onSelectTicker={handleWatchlistSelect} />
                </div>

                {/* Main area */}
                <div style={{ flex:1, minWidth:0 }}>
                    <h1 style={{ fontSize:'2rem', color:'#fff', textAlign:'center', marginBottom:'0.4rem' }}>
                        Stock Prediction Portal
                    </h1>
                    <p style={{ color:'#888', textAlign:'center', marginBottom:'1.5rem', fontSize:'0.9rem' }}>
                        Powered by LSTM Neural Network
                    </p>

                    {/* Search bar */}
                    <div style={{ display:'flex', gap:'1rem', justifyContent:'center', marginBottom:'1.5rem' }}>
                        <input
                            value={ticker}
                            onChange={e => setTicker(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && runPredict()}
                            placeholder="AAPL, TSLA, NVDA, INFY…"
                            style={{ padding:'0.75rem 1.25rem', background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff', fontSize:'1rem', width:'280px', outline:'none' }}
                        />
                        <button
                            onClick={() => runPredict()}
                            disabled={loading || !ticker.trim()}
                            style={{ padding:'0.75rem 1.5rem', background:'#4f8ef7', color:'#fff', border:'none', borderRadius:'8px', fontSize:'1rem', fontWeight:600, cursor:'pointer', opacity: loading || !ticker.trim() ? 0.5 : 1 }}
                        >
                            {loading ? 'Predicting…' : 'Predict'}
                        </button>
                    </div>

                    {error && (
                        <div style={{ background:'#2d1a1a', border:'1px solid #e24b4a', color:'#e24b4a', padding:'0.75rem', borderRadius:'8px', marginBottom:'1rem', textAlign:'center' }}>
                            {error}
                        </div>
                    )}

                    {data && (<>

                        {/* Metric cards */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'12px', marginBottom:'1.2rem' }}>
                            {[
                                { label:'Ticker',         value: data.ticker },
                                { label:'Current Price',  value: `$${data.current_price}` },
                                { label:'7-Day Forecast', value: `$${data.predicted_prices[6]}` },
                                { label:'Expected Return',value: `${data.expected_return>0?'+':''}${data.expected_return}%`, color: data.expected_return>=0?'#1D9E75':'#E24B4A' },
                                { label:'Signal',         value: sig, color: sigStyle.color },
                            ].map(m => (
                                <div key={m.label} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'10px', padding:'1rem', textAlign:'center' }}>
                                    <div style={{ fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>{m.label}</div>
                                    <div style={{ fontSize:'1.3rem', fontWeight:700, color:m.color||'#fff', fontFamily:'Courier New, monospace' }}>{m.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Indicator pills — only if indicators returned */}
                        {ind && (
                            <div style={{ display:'flex', gap:'8px', marginBottom:'1.2rem', flexWrap:'wrap' }}>
                                {[
                                    { label:`RSI ${ind.rsi.current}`, sub:ind.rsi.signal,
                                      color: ind.rsi.signal==='OVERSOLD'?'#1D9E75':ind.rsi.signal==='OVERBOUGHT'?'#E24B4A':'#EF9F27' },
                                    { label:'MACD', sub:ind.macd.signal,
                                      color: ind.macd.signal==='BULLISH'?'#1D9E75':'#E24B4A' },
                                    { label:'Bollinger', sub:ind.bollinger.signal,
                                      color: ind.bollinger.signal==='OVERSOLD'?'#1D9E75':ind.bollinger.signal==='OVERBOUGHT'?'#E24B4A':'#EF9F27' },
                                ].map(p => (
                                    <div key={p.label} style={{ padding:'5px 14px', borderRadius:'20px', background:p.color+'22', border:`1px solid ${p.color}`, color:p.color, fontSize:'12px', fontWeight:600 }}>
                                        {p.label} — {p.sub}
                                    </div>
                                ))}
                                <div style={{ padding:'5px 14px', borderRadius:'20px', background:sigStyle.bg, border:`1px solid ${sigStyle.border}`, color:sigStyle.color, fontSize:'12px', fontWeight:700 }}>
                                    Combined: {sig}
                                </div>
                            </div>
                        )}

                        {/* Main price chart + confidence band */}
                        <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>
                            <div style={{ fontSize:'12px', color:'#666', marginBottom:'1rem', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                                Price History + 7-Day Forecast + Confidence Band
                            </div>
                            <ResponsiveContainer width="100%" height={280}>
                                <ComposedChart data={mainChart()}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2132" />
                                    <XAxis dataKey="name" tick={{ fill:'#555', fontSize:10 }} />
                                    <YAxis tick={{ fill:'#555', fontSize:10 }} tickFormatter={v=>`$${v}`} domain={['auto','auto']} />
                                    <Tooltip {...tt} formatter={(v,n) => v!=null?[`$${Number(v).toFixed(2)}`,n]:[null,n]} />
                                    <Legend wrapperStyle={{ color:'#888', fontSize:'12px' }} />
                                    <Area dataKey="upper" fill="#1D9E75" fillOpacity={0.12} stroke="none" legendType="none" />
                                    <Area dataKey="lower" fill="#0f1117"  fillOpacity={1}    stroke="none" legendType="none" />
                                    <Line dataKey="historical" stroke="#378ADD" strokeWidth={2}   dot={false} name="Historical"  connectNulls={false} />
                                    <Line dataKey="predicted"  stroke="#1D9E75" strokeWidth={2.5} dot={{ r:3, fill:'#1D9E75' }} name="Predicted" connectNulls={false} />
                                    <Line dataKey="upper" stroke="#1D9E75" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Upper bound" />
                                    <Line dataKey="lower" stroke="#1D9E75" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Lower bound" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* RSI chart */}
                        {ind && rsiChart().length > 0 && (
                            <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                                    <span style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'0.5px' }}>RSI (14) — Relative Strength Index</span>
                                    <span style={{ fontSize:'12px', fontWeight:700, padding:'3px 12px', borderRadius:'20px',
                                        background: ind.rsi.signal==='OVERSOLD'?'#0a2e1a':ind.rsi.signal==='OVERBOUGHT'?'#2e0a0a':'#2e2100',
                                        color:      ind.rsi.signal==='OVERSOLD'?'#1D9E75':ind.rsi.signal==='OVERBOUGHT'?'#E24B4A':'#EF9F27',
                                    }}>
                                        {ind.rsi.current} — {ind.rsi.signal}
                                    </span>
                                </div>
                                <ResponsiveContainer width="100%" height={140}>
                                    <LineChart data={rsiChart()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2132" />
                                        <XAxis dataKey="name" tick={{ fill:'#555', fontSize:10 }} />
                                        <YAxis domain={[0,100]} tick={{ fill:'#555', fontSize:10 }} />
                                        <Tooltip {...tt} />
                                        <ReferenceLine y={70} stroke="#E24B4A" strokeDasharray="4 2" label={{ value:'Overbought 70', fill:'#E24B4A', fontSize:10, position:'insideTopLeft' }} />
                                        <ReferenceLine y={30} stroke="#1D9E75" strokeDasharray="4 2" label={{ value:'Oversold 30',   fill:'#1D9E75', fontSize:10, position:'insideBottomLeft' }} />
                                        <Line dataKey="rsi" stroke="#EF9F27" strokeWidth={2} dot={false} name="RSI" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* MACD chart */}
                        {ind && macdChart().length > 0 && (
                            <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                                    <span style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'0.5px' }}>MACD (12, 26, 9)</span>
                                    <span style={{ fontSize:'12px', fontWeight:700, padding:'3px 12px', borderRadius:'20px',
                                        background: ind.macd.signal==='BULLISH'?'#0a2e1a':'#2e0a0a',
                                        color:      ind.macd.signal==='BULLISH'?'#1D9E75':'#E24B4A',
                                    }}>
                                        {ind.macd.signal}
                                    </span>
                                </div>
                                <ResponsiveContainer width="100%" height={160}>
                                    <ComposedChart data={macdChart()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2132" />
                                        <XAxis dataKey="name" tick={{ fill:'#555', fontSize:10 }} />
                                        <YAxis tick={{ fill:'#555', fontSize:10 }} />
                                        <Tooltip {...tt} />
                                        <ReferenceLine y={0} stroke="#444" />
                                        <Bar dataKey="histogram" name="Histogram"
                                            fill="#888"
                                            isAnimationActive={false}
                                        />
                                        <Line dataKey="macd"   stroke="#378ADD" strokeWidth={2}   dot={false} name="MACD" />
                                        <Line dataKey="signal" stroke="#EF9F27" strokeWidth={1.5} dot={false} name="Signal" strokeDasharray="4 2" />
                                        <Legend wrapperStyle={{ color:'#888', fontSize:'12px' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* News Sentiment */}
                        <SentimentPanel sentiment={data.sentiment} />
                        
                        {/* 7-day forecast table */}
                        <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem' }}>
                            <div style={{ fontSize:'12px', color:'#666', marginBottom:'1rem', textTransform:'uppercase', letterSpacing:'0.5px' }}>7-Day Forecast</div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                                {data.predicted_prices.map((price, i) => {
                                    const chg   = ((price - data.current_price) / data.current_price * 100).toFixed(2)
                                    const upper = data.confidence_upper?.[i]
                                    const lower = data.confidence_lower?.[i]
                                    return (
                                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#0f1117', borderRadius:'6px', fontFamily:'Courier New, monospace', fontSize:'0.88rem' }}>
                                            <span style={{ color:'#666', minWidth:'50px' }}>Day {i+1}</span>
                                            <span style={{ color:'#fff' }}>${price.toFixed(2)}</span>
                                            {upper && lower && (
                                                <span style={{ color:'#444', fontSize:'0.78rem' }}>
                                                    ${lower.toFixed(2)} – ${upper.toFixed(2)}
                                                </span>
                                            )}
                                            <span style={{ color: chg>=0?'#1D9E75':'#E24B4A', minWidth:'60px', textAlign:'right' }}>
                                                {chg>=0?'+':''}{chg}%
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                    </>)}
                </div>
            </div>
        </div>
    )
}
