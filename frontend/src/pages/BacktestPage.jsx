import { useState } from 'react'
import {
    ComposedChart, Line, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ReferenceLine
} from 'recharts'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || ''
const tt  = { contentStyle:{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff' } }

export default function BacktestPage() {
    const [ticker,  setTicker]  = useState('AAPL')
    const [capital, setCapital] = useState('100000')
    const [period,  setPeriod]  = useState('1y')
    const [data,    setData]    = useState(null)
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState('')
    const navigate = useNavigate()

    const token = localStorage.getItem('access_token')

    const runBacktest = async () => {
        setLoading(true)
        setError('')
        setData(null)
        try {
            const res  = await fetch(
                `${API}/api/stocks/backtest/?ticker=${ticker.toUpperCase()}&capital=${capital}&period=${period}`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            const json = await res.json()
            if (!res.ok) { setError(json.error || 'Backtest failed'); return }
            setData(json)
        } catch {
            setError('Network error — is Django running?')
        } finally {
            setLoading(false)
        }
    }

    // Build buy-and-hold comparison data
    const buildChartData = () => {
        if (!data?.portfolio_values?.length) return []
        const startVal = data.initial_capital
        const startPrice = data.portfolio_values[0]?.price || 1

        return data.portfolio_values.map((p, i) => ({
            date:      p.date.slice(5),   // MM-DD
            strategy:  p.value,
            buyhold:   Math.round(startVal * (p.price / startPrice) * 100) / 100,
        }))
    }

    const chartData = buildChartData()

    const statCard = (label, value, color='#fff', sub='') => (
        <div key={label} style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'10px', padding:'1rem', textAlign:'center' }}>
            <div style={{ fontSize:'11px', color:'#666', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'6px' }}>{label}</div>
            <div style={{ fontSize:'1.3rem', fontWeight:700, color, fontFamily:'Courier New, monospace' }}>{value}</div>
            {sub && <div style={{ fontSize:'11px', color:'#555', marginTop:'3px' }}>{sub}</div>}
        </div>
    )

    return (
        <div style={{ minHeight:'100vh', background:'#0f1117' }}>

            {/* Navbar */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem 2rem', background:'#1a1d27', borderBottom:'1px solid #2a2d3e' }}>
                <span style={{ fontSize:'1.2rem', fontWeight:700, color:'#4f8ef7' }}>StockPredict</span>
                <div style={{ display:'flex', gap:'1.5rem', alignItems:'center' }}>
                    <span onClick={() => navigate('/dashboard')} style={{ color:'#4f8ef7', cursor:'pointer', fontSize:'0.9rem' }}>Dashboard</span>
                    <span onClick={() => navigate('/history')}   style={{ color:'#4f8ef7', cursor:'pointer', fontSize:'0.9rem' }}>History</span>
                    <span style={{ color:'#aaa', fontSize:'0.9rem' }}>Backtesting</span>
                </div>
            </div>

            <div style={{ padding:'2rem', maxWidth:'1100px', margin:'0 auto' }}>

                <h1 style={{ color:'#fff', fontSize:'1.8rem', marginBottom:'.3rem' }}>Backtesting Engine</h1>
                <p style={{ color:'#666', fontSize:'.9rem', marginBottom:'1.5rem' }}>
                    Simulate trading with your LSTM signals on historical data — did the strategy actually make money?
                </p>

                {/* Controls */}
                <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap', alignItems:'flex-end' }}>
                    <div>
                        <div style={{ fontSize:'12px', color:'#888', marginBottom:'4px' }}>Ticker</div>
                        <input
                            value={ticker}
                            onChange={e => setTicker(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && runBacktest()}
                            placeholder="AAPL"
                            style={{ padding:'.6rem 1rem', background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff', fontSize:'1rem', width:'120px', outline:'none' }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize:'12px', color:'#888', marginBottom:'4px' }}>Starting Capital (₹/$)</div>
                        <input
                            value={capital}
                            onChange={e => setCapital(e.target.value)}
                            placeholder="100000"
                            style={{ padding:'.6rem 1rem', background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff', fontSize:'1rem', width:'160px', outline:'none' }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize:'12px', color:'#888', marginBottom:'4px' }}>Period</div>
                        <select
                            value={period}
                            onChange={e => setPeriod(e.target.value)}
                            style={{ padding:'.6rem 1rem', background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'8px', color:'#fff', fontSize:'1rem', outline:'none' }}
                        >
                            <option value="6mo">6 Months</option>
                            <option value="1y">1 Year</option>
                            <option value="2y">2 Years</option>
                        </select>
                    </div>
                    <button
                        onClick={runBacktest}
                        disabled={loading}
                        style={{ padding:'.65rem 1.8rem', background:'#4f8ef7', color:'#fff', border:'none', borderRadius:'8px', fontSize:'1rem', fontWeight:600, cursor:'pointer', opacity: loading ? 0.5 : 1 }}
                    >
                        {loading ? 'Running…' : 'Run Backtest'}
                    </button>
                </div>

                {loading && (
                    <div style={{ textAlign:'center', color:'#888', padding:'2rem', fontSize:'.95rem' }}>
                        ⏳ Running backtest — simulating all trading days... (~30-60 seconds)
                    </div>
                )}

                {error && (
                    <div style={{ background:'#2d1a1a', border:'1px solid #e24b4a', color:'#e24b4a', padding:'.75rem', borderRadius:'8px', marginBottom:'1rem' }}>
                        {error}
                    </div>
                )}

                {data && (<>

                    {/* ── Verdict banner ── */}
                    <div style={{
                        padding:'1rem 1.5rem', borderRadius:'12px', marginBottom:'1.5rem',
                        background: data.outperformed ? '#0a2e1a' : '#2e0a0a',
                        border: `1px solid ${data.outperformed ? '#1D9E75' : '#E24B4A'}`,
                        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem'
                    }}>
                        <div>
                            <div style={{ fontSize:'1.1rem', fontWeight:700, color: data.outperformed ? '#1D9E75' : '#E24B4A' }}>
                                {data.outperformed ? '🏆 Strategy OUTPERFORMED Buy & Hold' : '📉 Strategy UNDERPERFORMED Buy & Hold'}
                            </div>
                            <div style={{ fontSize:'13px', color:'#aaa', marginTop:'4px' }}>
                                {data.ticker} · {data.period} period · Starting capital: {Number(data.initial_capital).toLocaleString()}
                            </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:'1.4rem', fontWeight:700, fontFamily:'Courier New', color: data.alpha >= 0 ? '#1D9E75' : '#E24B4A' }}>
                                {data.alpha >= 0 ? '+' : ''}{data.alpha}% alpha
                            </div>
                            <div style={{ fontSize:'12px', color:'#888' }}>vs Buy & Hold</div>
                        </div>
                    </div>

                    {/* ── Metric cards ── */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'1.5rem' }}>
                        {statCard('Final Value',    Number(data.final_capital).toLocaleString(undefined,{maximumFractionDigits:0}), '#fff')}
                        {statCard('Strategy Return', `${data.total_return >= 0 ? '+' : ''}${data.total_return}%`, data.total_return >= 0 ? '#1D9E75' : '#E24B4A', `Buy & Hold: ${data.bh_return >= 0?'+':''}${data.bh_return}%`)}
                        {statCard('Win Rate',        `${data.win_rate}%`, data.win_rate >= 50 ? '#1D9E75' : '#E24B4A', `${data.winning_trades}W / ${data.losing_trades}L`)}
                        {statCard('Total Trades',    data.total_trades, '#fff', `${data.signal_counts.buy} buy · ${data.signal_counts.sell} sell signals`)}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'1.5rem' }}>
                        {statCard('Max Drawdown',  `-${data.max_drawdown}%`, '#E24B4A', 'worst peak-to-trough')}
                        {statCard('Sharpe Ratio',  data.sharpe_ratio, data.sharpe_ratio >= 1 ? '#1D9E75' : data.sharpe_ratio >= 0 ? '#EF9F27' : '#E24B4A', '≥1 is good')}
                        {statCard('Best Trade',
                            data.best_trade
                                ? (data.best_trade.all_losses
                                    ? `${data.best_trade.pnl_pct}%`
                                    : `+${data.best_trade.pnl_pct}%`)
                                : '—',
                            data.best_trade?.all_losses ? '#E24B4A' : '#1D9E75',
                            data.best_trade?.all_losses ? 'all trades lost' : '')}
                    </div>

                    {/* ── P&L Chart vs Buy & Hold ── */}
                    <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem', marginBottom:'1rem' }}>
                        <div style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'1rem' }}>
                            Portfolio Value — Strategy vs Buy & Hold
                        </div>
                        <ResponsiveContainer width="100%" height={280}>
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e2132" />
                                <XAxis dataKey="date" tick={{ fill:'#555', fontSize:10 }} interval={Math.floor(chartData.length / 8)} />
                                <YAxis tick={{ fill:'#555', fontSize:10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} domain={['auto','auto']} />
                                <Tooltip {...tt} formatter={(v, n) => [`${Number(v).toLocaleString(undefined,{maximumFractionDigits:0})}`, n]} />
                                <Legend wrapperStyle={{ color:'#888', fontSize:'12px' }} />
                                <ReferenceLine y={data.initial_capital} stroke="#444" strokeDasharray="4 2" />
                                <Area dataKey="strategy" fill="#1D9E75" fillOpacity={0.1} stroke="none" legendType="none" />
                                <Line dataKey="strategy" stroke="#1D9E75" strokeWidth={2.5} dot={false} name="LSTM Strategy" />
                                <Line dataKey="buyhold"  stroke="#378ADD" strokeWidth={1.5} dot={false} name="Buy & Hold" strokeDasharray="5 3" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* ── Trade Log ── */}
                    <div style={{ background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'12px', padding:'1.5rem' }}>
                        <div style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'1rem' }}>
                            Recent Trade Log (last 20 trades)
                        </div>

                        {/* Header */}
                        <div style={{ display:'grid', gridTemplateColumns:'100px 70px 100px 100px 100px 100px', gap:'8px', padding:'.5rem .75rem', background:'#0f1117', borderRadius:'6px', fontSize:'11px', color:'#666', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:'.4rem' }}>
                            <span>Date</span>
                            <span>Action</span>
                            <span>Price</span>
                            <span>Value</span>
                            <span>P&L</span>
                            <span>P&L %</span>
                        </div>

                        {data.trade_log.map((t, i) => (
                            <div key={i} style={{ display:'grid', gridTemplateColumns:'100px 70px 100px 100px 100px 100px', gap:'8px', padding:'.5rem .75rem', background: i%2===0 ? '#0f1117' : 'transparent', borderRadius:'6px', fontSize:'12px', fontFamily:'Courier New, monospace', color:'#ccc', marginBottom:'2px', alignItems:'center' }}>
                                <span style={{ color:'#888', fontFamily:'Segoe UI, sans-serif', fontSize:'11px' }}>{t.date}</span>
                                <span style={{
                                    padding:'2px 8px', borderRadius:'12px', fontSize:'11px', fontWeight:700,
                                    fontFamily:'Segoe UI, sans-serif', textAlign:'center',
                                    background: t.action==='BUY'?'#0a2e1a':'#2e0a0a',
                                    color:      t.action==='BUY'?'#1D9E75':'#E24B4A',
                                }}>{t.action}</span>
                                <span>${t.price}</span>
                                <span>${Number(t.value).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
                                <span style={{ color: t.pnl === null ? '#555' : t.pnl >= 0 ? '#1D9E75' : '#E24B4A' }}>
                                    {t.pnl === null ? '—' : `${t.pnl >= 0 ? '+' : ''}$${t.pnl}`}
                                </span>
                                <span style={{ color: t.pnl_pct === null ? '#555' : t.pnl_pct >= 0 ? '#1D9E75' : '#E24B4A' }}>
                                    {t.pnl_pct === null ? '—' : `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct}%`}
                                </span>
                            </div>
                        ))}
                    </div>

                </>)}
            </div>
        </div>
    )
}
