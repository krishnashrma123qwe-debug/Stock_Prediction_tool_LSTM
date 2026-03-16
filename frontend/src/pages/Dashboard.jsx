import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import axiosInstance from '../api/axios'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer
} from 'recharts'

export default function Dashboard() {
    const { user, logout } = useAuth()
    const [ticker, setTicker] = useState('AAPL')
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const fetchPrediction = async () => {
        setLoading(true)
        setError('')
        setData(null)
        try {
            const res = await axiosInstance.get(`/stocks/predict/?ticker=${ticker}`)
            setData(res.data)
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to fetch prediction')
        } finally {
            setLoading(false)
        }
    }

    const chartData = data ? [
        ...data.historical_prices.map((price, i) => ({
            day: `H${i + 1}`,
            Historical: price,
            Predicted: null
        })),
        ...data.predicted_prices.map((price, i) => ({
            day: `F${i + 1}`,
            Historical: null,
            Predicted: price
        }))
    ] : []

    const returnColor = data?.expected_return >= 0 ? '#1D9E75' : '#E24B4A'

    return (
        <div className="dashboard">
            <nav className="navbar">
                <span className="logo">📈 StockPredict</span>
                <div className="nav-right">
                    <span>Hello, {user?.username}</span>
                    <button onClick={logout}>Logout</button>
                </div>
            </nav>

            <div className="dashboard-body">
                <h1>Stock Prediction Portal</h1>
                <p style={{ color: '#888', marginBottom: '2rem' }}>
                    Powered by LSTM Neural Network
                </p>

                <div className="search-bar">
                    <input
                        value={ticker}
                        onChange={e => setTicker(e.target.value.toUpperCase())}
                        placeholder="Enter ticker (e.g. AAPL)"
                        onKeyDown={e => e.key === 'Enter' && fetchPrediction()}
                    />
                    <button onClick={fetchPrediction} disabled={loading}>
                        {loading ? 'Predicting...' : 'Predict'}
                    </button>
                </div>

                {error && <div className="error-msg" style={{ maxWidth: 600, margin: '0 auto 1rem' }}>{error}</div>}

                {data && (
                    <div className="results">
                        <div className="metrics">
                            <div className="metric">
                                <div className="mlabel">Ticker</div>
                                <div className="mval">{data.ticker}</div>
                            </div>
                            <div className="metric">
                                <div className="mlabel">Current Price</div>
                                <div className="mval">${data.current_price}</div>
                            </div>
                            <div className="metric">
                                <div className="mlabel">7-Day Forecast</div>
                                <div className="mval">${data.predicted_prices[6]}</div>
                            </div>
                            <div className="metric">
                                <div className="mlabel">Expected Return</div>
                                <div className="mval" style={{ color: returnColor }}>
                                    {data.expected_return >= 0 ? '+' : ''}{data.expected_return}%
                                </div>
                            </div>
                        </div>

                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
                                    <XAxis dataKey="day" stroke="#888" tick={{ fontSize: 11 }} />
                                    <YAxis stroke="#888" tick={{ fontSize: 11 }}
                                        domain={['auto', 'auto']}
                                        tickFormatter={v => `$${v}`} />
                                    <Tooltip
                                        contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}
                                        formatter={v => [`$${v}`, '']}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="Historical"
                                        stroke="#4f8ef7" strokeWidth={2}
                                        dot={false} connectNulls={false} />
                                    <Line type="monotone" dataKey="Predicted"
                                        stroke="#1D9E75" strokeWidth={2.5}
                                        strokeDasharray="5 3"
                                        dot={{ fill: '#1D9E75', r: 4 }}
                                        connectNulls={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="pred-table">
                            <h3>7-Day Forecast</h3>
                            <div className="pred-rows">
                                {data.predicted_prices.map((price, i) => {
                                    const prev = i === 0 ? data.current_price : data.predicted_prices[i-1]
                                    const chg = ((price - prev) / prev * 100).toFixed(2)
                                    return (
                                        <div key={i} className="pred-row">
                                            <span>Day {i + 1}</span>
                                            <span>${price}</span>
                                            <span style={{ color: chg >= 0 ? '#1D9E75' : '#E24B4A' }}>
                                                {chg >= 0 ? '+' : ''}{chg}%
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {!data && !loading && (
                    <div style={{ color: '#555', marginTop: '3rem' }}>
                        Enter a stock ticker above and click Predict to see the LSTM forecast
                    </div>
                )}
            </div>
        </div>
    )
}