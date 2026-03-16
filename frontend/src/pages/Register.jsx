import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Register() {
    const { register } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ username: '', email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

    const handleSubmit = async e => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await register(form.username, form.email, form.password)
            navigate('/dashboard')
        } catch (err) {
            setError(err.response?.data?.email?.[0] || 'Registration failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Create Account</h2>
                <p className="auth-sub">Start predicting stocks today</p>
                {error && <div className="error-msg">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <input name="username" placeholder="Username" value={form.username} onChange={handleChange} required />
                    <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
                    <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />
                    <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Register'}</button>
                </form>
                <p className="auth-link">Already have an account? <Link to="/login">Login</Link></p>
            </div>
        </div>
    )
}