import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, LineSeries } from 'lightweight-charts'

export default function LightweightChart({ ohlcData, predictedLine, confidenceUpper, confidenceLower, height = 300 }) {
    const chartContainerRef = useRef()

    useEffect(() => {
        if (!ohlcData || ohlcData.length === 0) return

        const handleResize = () => {
            if (chartContainerRef.current && chart) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth })
            }
        }

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: height,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#aaa',
            },
            grid: {
                vertLines: { color: '#1e2132', style: 1 },
                horzLines: { color: '#1e2132', style: 1 },
            },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#2a2d3e' },
            timeScale: { 
                borderColor: '#2a2d3e',
                timeVisible: true,
                fixLeftEdge: true,
                fixRightEdge: true,
                rightOffset: Math.min(predictedLine?.length || 0, 10) 
            },
        })

        // Historical Candlesticks
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#1D9E75',
            downColor: '#E24B4A',
            borderVisible: false,
            wickUpColor: '#1D9E75',
            wickDownColor: '#E24B4A',
        })
        candlestickSeries.setData(ohlcData)

        // Predicted Line
        if (predictedLine && predictedLine.length > 0) {
            const predSeries = chart.addSeries(LineSeries, {
                color: '#4f8ef7',
                lineWidth: 2,
                crosshairMarkerVisible: true,
                lineStyle: 0,
            })
            // predictedLine should be [{time, value}, {time, value}]
            predSeries.setData(predictedLine)
        }

        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            chart.remove()
        }
    }, [ohlcData, predictedLine, confidenceUpper, confidenceLower, height])

    return (
        <div ref={chartContainerRef} style={{ width: '100%', height: `${height}px` }} />
    )
}
