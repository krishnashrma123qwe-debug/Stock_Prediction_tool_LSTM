import { createContext, useContext, useState, useEffect } from 'react'
import axiosInstance from '../api/axios'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const token = localStorage.getItem('access_token')
        if (token) {
            axiosInstance.get('/users/me/')
                .then(res => setUser(res.data))
                .catch(() => localStorage.clear())
                .finally(() => setLoading(false))
        } else {
            setLoading(false)
        }
    }, [])

    const login = async (email, password) => {
        const res = await axiosInstance.post('/users/login/', { email, password })
        localStorage.setItem('access_token', res.data.access)
        localStorage.setItem('refresh_token', res.data.refresh)
        const me = await axiosInstance.get('/users/me/')
        setUser(me.data)
    }

    const register = async (username, email, password) => {
        await axiosInstance.post('/users/register/', { username, email, password })
        await login(email, password)
    }

    const logout = () => {
        localStorage.clear()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)