import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import HistoryPage from './pages/HistoryPage'
import './App.css'
import BacktestPage from './pages/BacktestPage'

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/"          element={<Navigate to="/login" />} />
                    <Route path="/login"     element={<Login />} />
                    <Route path="/register"  element={<Register />} />
                    <Route path="/dashboard" element={
                        <PrivateRoute><Dashboard /></PrivateRoute>
                    } />
                    <Route path="/history"   element={
                        <PrivateRoute><HistoryPage /></PrivateRoute>
                    } />
                    <Route path="/backtest" element={
                        <PrivateRoute><BacktestPage /></PrivateRoute>
                        } />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
