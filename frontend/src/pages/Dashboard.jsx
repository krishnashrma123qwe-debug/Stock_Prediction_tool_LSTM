import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ComposedChart, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ReferenceLine, ResponsiveContainer, Bar
} from 'recharts'
import { motion } from 'framer-motion'
import Watchlist from '../components/watchlist'
import SentimentPanel from '../components/SentimentPanel'
import LightweightChart from '../components/LightweightChart'

const API = import.meta.env.VITE_API_URL || ''

const SIG = {
    'STRONG BUY':  { bg:'#0a2e1a', color:'#1D9E75', border:'#1D9E75' },
    'BUY':         { bg:'#0a2e1a', color:'#1D9E75', border:'#1D9E75' },
    'HOLD':        { bg:'#2e2100', color:'#EF9F27', border:'#EF9F27' },
    'SELL':        { bg:'#2e0a0a', color:'#E24B4A', border:'#E24B4A' },
    'STRONG SELL': { bg:'#2e0a0a', color:'#E24B4A', border:'#E24B4A' },
}

const tt = { contentStyle:{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff' } }

// Framer Motion variants
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}
const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
}

export default function Dashboard() {
    const [ticker,  setTicker]  = useState('')
    const [data,    setData]    = useState(null)
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState('')
    const navigate = useNavigate()

    const token = localStorage.getItem('access_token')
    const user  = localStorage.getItem('username') || 'User'

    const logout = () => { localStorage.clear(); navigate('/login') }

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
            const res = await fetch(`${API}/api/stocks/predict/?ticker=${t}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const json = await res.json()
            if (!res.ok) { setError(json.error || 'Prediction failed'); setLoading(false); return }
            
            // Start polling for the task result
            pollStatus(json.task_id)
        } catch {
            setError('Network error — is Django running?')
            setLoading(false)
        }
    }

    const pollStatus = async (taskId) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API}/api/stocks/task-status/${taskId}/`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                const json = await res.json()
                
                if (json.status === 'SUCCESS') {
                    clearInterval(interval)
                    setData(json.result)
                    setLoading(false)
                } else if (json.status === 'FAILURE') {
                    clearInterval(interval)
                    setError(json.error || 'Prediction task failed.')
                    setLoading(false)
                }
                // If PENDING or STARTED, do nothing and wait for next interval
            } catch (err) {
                clearInterval(interval)
                setError('Error polling status.')
                setLoading(false)
            }
        }, 2000)
    }

    // Chart data builders
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

    // Advance dates for prediction line
    const buildPredictedLine = () => {
        if (!data?.historical_ohlc || data.historical_ohlc.length === 0 || !data?.predicted_prices) return []
        
        const hist = data.historical_ohlc
        const lastDateStr = hist[hist.length - 1].time
        let lastDate = new Date(lastDateStr)

        // Connect the prediction line to the last historical close
        const line = [{
            time: lastDateStr,
            value: hist[hist.length - 1].close
        }]

        data.predicted_prices.forEach((price) => {
            // Rough approximation of next day, skip basic weekends
            do {
                lastDate.setDate(lastDate.getDate() + 1)
            } while (lastDate.getDay() === 0 || lastDate.getDay() === 6)
            
            line.push({
                time: lastDate.toISOString().split('T')[0],
                value: price
            })
        })
        return line
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
                    <span onClick={() => navigate('/history')} style={{ color:'#4f8ef7', cursor:'pointer', fontSize:'0.9rem' }}>History</span>
                    <span onClick={() => navigate('/backtest')} style={{ color:'#4f8ef7', cursor:'pointer', fontSize:'0.9rem' }}>Backtest</span>
                    <span style={{ color:'#aaa', fontSize:'0.9rem' }}>Hello, {user}</span>
                    <button onClick={logout} style={{ padding:'0.4rem 1rem', background:'transparent', border:'1px solid #e24b4a', color:'#e24b4a', borderRadius:'6px', cursor:'pointer', fontSize:'0.9rem' }}>Logout</button>
                </div>
            </div>

            <div style={{ display:'flex', gap:'1.5rem', padding:'2rem', alignItems:'flex-start' }}>
                {/* Watchlist sidebar */}
                <div style={{ width:'210px', flexShrink:0 }}>
                    <Watchlist onSelectTicker={handleWatchlistSelect} />
                </div>

                {/* Main area */}
                <div style={{ flex:1, minWidth:0 }}>
                    <motion.h1 
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                        style={{ fontSize:'2rem', color:'#fff', textAlign:'center', marginBottom:'0.4rem' }}>
                        Stock Prediction Portal
                    </motion.h1>
                    <motion.p 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ color:'#888', textAlign:'center', marginBottom:'1.5rem', fontSize:'0.9rem' }}>
                        Powered by LSTM Neural Network
                    </motion.p>

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
                            Predict
                        </button>
                    </div>

                    {error && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background:'#2d1a1a', border:'1px solid #e24b4a', color:'#e24b4a', padding:'0.75rem', borderRadius:'8px', marginBottom:'1rem', textAlign:'center' }}>
                            {error}
                        </motion.div>
                    )}

                    {loading && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems:'center' }}>
                            <div style={{ color:'#4f8ef7', fontWeight:600, marginBottom:'10px', fontSize:'1.1rem' }}>
                                AI is analyzing {ticker || 'stock'}... This may take 10-15 seconds.
                            </div>
                            <div style={{ width: '100%', height: '100px', background: 'linear-gradient(90deg, #1a1d27 25%, #2a2d3e 50%, #1a1d27 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '10px' }} />
                            <div style={{ width: '100%', height: '350px', background: 'linear-gradient(90deg, #1a1d27 25%, #2a2d3e 50%, #1a1d27 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '12px' }} />
                            <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
                        </motion.div>
                    )}

                    {data && !loading && (
                        <motion.div variants={containerVariants} initial="hidden" animate="show">
                            {/* Metric cards */}
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'12px', marginBottom:'1.2rem' }}>
                                {[
                                    { label:'Ticker',         value: data.ticker },
                                    { label:'Current Price',  value: `$${Number(data.current_price).toFixed(2)}` },
                                    { label:'7-Day Forecast', value: `$${Number(data.predicted_prices[6]).toFixed(2)}` },
                                    { label:'Expected Return',value: `${data.expected_return>0?'+':''}${data.expected_return}%`, color: data.expected_return>=0?'#1D9E75':'#E24B4A' },
                                    { label:'Combined Signal', value: sig, color: sigStyle.color },
                                ].map((m, idx) => (
                                    <motion.div variants={itemVariants} key={m.label} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'10px', padding:'1rem', textAlign:'center' }}>
                                        <div style={{ fontSize:'11px', color:'#888', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>{m.label}</div>
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.2 + (idx * 0.1), type: 'spring' }}
                                            style={{ fontSize:'1.3rem', fontWeight:700, color:m.color||'#fff', fontFamily:'Courier New, monospace' }}>
                                            {m.value}
                                        </motion.div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Indicator pills */}
                            {ind && (
                                <motion.div variants={itemVariants} style={{ display:'flex', gap:'8px', marginBottom:'1.2rem', flexWrap:'wrap' }}>
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
                                </motion.div>
                            )}

                            {/* Main price chart + confidence band */}
                            <motion.div variants={itemVariants} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem', overflow:'hidden' }}>
                                <div style={{ fontSize:'12px', color:'#666', marginBottom:'1rem', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                                    OHLC Price History (60D) + AI Forecast (7D)
                                </div>
                                {data.historical_ohlc && (
                                    <LightweightChart 
                                        ohlcData={data.historical_ohlc} 
                                        predictedLine={buildPredictedLine()}
                                        height={320}
                                    />
                                )}
                            </motion.div>

                            {/* RSI chart */}
                            {ind && rsiChart().length > 0 && (
                                <motion.div variants={itemVariants} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>
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
                                            <ReferenceLine y={70} stroke="#E24B4A" strokeDasharray="4 2" />
                                            <ReferenceLine y={30} stroke="#1D9E75" strokeDasharray="4 2" />
                                            <Line dataKey="rsi" stroke="#EF9F27" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}

                            {/* MACD chart */}
                            {ind && macdChart().length > 0 && (
                                <motion.div variants={itemVariants} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>
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
                                            <Bar dataKey="histogram" fill="#888" isAnimationActive={false} />
                                            <Line dataKey="macd" stroke="#378ADD" strokeWidth={2} dot={false} />
                                            <Line dataKey="signal" stroke="#EF9F27" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}

                            {/* News Sentiment */}
                            <motion.div variants={itemVariants}>
                                <SentimentPanel sentiment={data.sentiment} />
                            </motion.div>
                            
                            {/* Forecast list */}
                            <motion.div variants={itemVariants} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem' }}>
                                <div style={{ fontSize:'12px', color:'#666', marginBottom:'1rem', textTransform:'uppercase', letterSpacing:'0.5px' }}>7-Day Forecast Matrix</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                                    {data.predicted_prices.map((price, i) => {
                                        const chg = ((price - data.current_price) / data.current_price * 100).toFixed(2)
                                        return (
                                            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#0f1117', borderRadius:'6px', fontFamily:'Courier New, monospace', fontSize:'0.88rem' }}>
                                                <span style={{ color:'#666', minWidth:'50px' }}>Day {i+1}</span>
                                                <span style={{ color:'#fff' }}>${price.toFixed(2)}</span>
                                                <span style={{ color: chg>=0?'#1D9E75':'#E24B4A', minWidth:'60px', textAlign:'right' }}>
                                                    {chg>=0?'+':''}{chg}%
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    )
}
