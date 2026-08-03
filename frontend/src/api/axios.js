import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const axiosInstance = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
})

axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token')
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`
        }
        return config
    },
    (error) => Promise.reject(error)
)

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true
            const refresh = localStorage.getItem('refresh_token')
            if (refresh) {
                try {
                    const res = await axios.post(`${baseURL}/users/token/refresh/`, { refresh })
                    localStorage.setItem('access_token', res.data.access)
                    originalRequest.headers['Authorization'] = `Bearer ${res.data.access}`
                    return axiosInstance(originalRequest)
                } catch {
                    localStorage.clear()
                    window.location.href = '/login'
                }
            }
        }
        return Promise.reject(error)
    }
)

export default axiosInstance