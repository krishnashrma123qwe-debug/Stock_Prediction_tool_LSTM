import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Login() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

    const handleSubmit = async e => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await login(form.email, form.password)
            navigate('/dashboard')
        } catch {
            setError('Invalid email or password')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Welcome Back</h2>
                <p className="auth-sub">Login to your stock portal</p>
                {error && <div className="error-msg">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
                    <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
                    <button type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
                </form>
                <p className="auth-link">No account? <Link to="/register">Register</Link></p>
            </div>
        </div>
    )
}