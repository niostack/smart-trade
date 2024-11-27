const ccxt = require('ccxt');
const reset = "\x1b[0m"
const fgDarkRed = "\x1b[31;1m" // 加粗红色表示加速下降
const fgRed = "\x1b[31m"
const fgDarkGreen = "\x1b[32;1m" // 加粗绿色表示加速上升
const fgGreen = "\x1b[32m"
const fgYellow = "\x1b[33m"
const fgBlue = "\x1b[34m"
const proxy = 'http://127.0.0.1:7890'; // Note: Corrected the IP to be valid
const exchange = new ccxt.okx({
    enableRateLimit: true,
    httpsProxy: proxy,
});

async function getPriceHistory(timeframe) {
    try {
        const symbol = 'BTC/USDT:USDT';
        const now = new Date();
        // 60 * timeframe ago
        if (timeframe === '1h') {
            now.setHours(now.getHours() - 62);
        } else if (timeframe === '1d') {
            now.setDate(now.getDate() - 62);
        } else if (timeframe === '15m') {
            now.setMinutes(now.getMinutes() - 62 * 15);
        }
        const since = now.toISOString(); // Convert to ISO string for ccxt

        const limit = 62;

        let ohlcv = await exchange.fetchOHLCV(symbol, timeframe, exchange.parse8601(since), limit);

        const periods = [5, 20, 60];
        // Now we'll ensure SMAs are aligned properly, add trend and slope based on the first value of the period
        const SMAs = periods.map((period) => {
            const closes = ohlcv.map(candle => candle[4]);
            const smaData = calculateSMA(closes, period);
            const paddedSMA = new Array(ohlcv.length).fill(undefined);
            const trendSlopes = new Array(ohlcv.length).fill(undefined);

            smaData.forEach((value, i) => {
                const position = i + period - 1;
                paddedSMA[position] = value;
                const firstClose = closes[position - period];
                const currentClose = closes[position];
                const difference = parseFloat((currentClose - firstClose).toFixed(2)); // Calculate the difference between the first close and the current close, rounded to 2 decimal places.currentClose - firstClose;

                trendSlopes[position] = difference; // Positive if up, negative if down from the start
            });

            return {
                name: `MA${period}`,
                data: paddedSMA,
                trendSlopes: trendSlopes
            };
        });

        // Output data aligned with each OHLCV entry
        // ohlcv.forEach((candle, i) => {
        //     const [timestamp, open, high, low, close, volume] = candle;
        //     console.log(
        //         exchange.iso8601(timestamp),
        //         'NO:', i,
        //         'open:', open,
        //         'high:', high,
        //         'low:', low,
        //         'close:', close,
        //         'volume:', volume,
        //         ...SMAs.map(({ name, data, trendSlopes }) => [`${name}:`, data[i], `TrendSlope${name.slice(2)}:`, trendSlopes[i]]).flat()
        //     );
        // });
        // generate a report
        const currentPrice = ohlcv[ohlcv.length - 1][4];
        const currentMaxPrice = ohlcv[ohlcv.length - 1][2];
        const currentMinPrice = ohlcv[ohlcv.length - 1][3];
        const MA5Report = `SMA5: ${generateMAReport(SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1], SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 2])}`
        const MA20Report = `SMA20: ${generateMAReport(SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1], SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 2])}`
        const MA60Report = `SMA60: ${generateMAReport(SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1], SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 2])}`
        let summary = '';
        if (SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1] > 0
            && SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1] > 0
            && SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1] > 0) {
            // all are up
            summary = `${fgGreen}多头排列, 看涨${reset}`;
        } else if (SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1] < 0
            && SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1] < 0
            && SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1] < 0) {
            // all are down
            summary = `${fgRed}空头排列, 看跌${reset}`;
        } else if (SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1] < 0
            && SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1] > 0
            && SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1] > 0) {
            // MA5 down, MA20 up, MA60 up
            summary = `${fgYellow}上涨受阻, 注意风险${reset}`;
        } else if (SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1] > 0
            && SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1] < 0
            && SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1] < 0) {
            // MA5 up, MA20 down, MA60 down
            summary = `${fgGreen}下跌反弹, 注意机会${reset}`;
        } else if (SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1] > 0
            && SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1] > 0
            && SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1] < 0) {
            // MA5 up, MA20 up, MA60 down
            summary = `${fgGreen}下跌趋势即将反转位上涨趋势, 注意机会${reset}`;
        } else if (SMAs[0].trendSlopes[SMAs[0].trendSlopes.length - 1] < 0
            && SMAs[1].trendSlopes[SMAs[1].trendSlopes.length - 1] < 0
            && SMAs[2].trendSlopes[SMAs[2].trendSlopes.length - 1] > 0) {
            // MA5 down, MA20 down, MA60 up
            summary = `${fgRed}上涨趋势即将反转位下跌趋势, 注意风险${reset}`;
        }
        else {
            summary = `${fgYellow}震荡行情, 持续观望${reset}`;
        }
        const report = `${fgBlue}${timeframe}${reset} 级别:
        当前时间: ${fgBlue}${exchange.iso8601(ohlcv[ohlcv.length - 1][0])}${reset} 当前价格: ${fgBlue}${currentPrice}${reset} 最高价格: ${fgGreen}${currentMaxPrice}${reset} 最低价格: ${fgRed}${currentMinPrice}${reset}
        ${MA5Report}
        ${MA20Report}
        ${MA60Report}
        建议: ${summary}
        `
        console.log(report);

    } catch (e) {
        console.error('Error:', e.message);
    }
}


function generateMAReport(currentTrendSlope, previousTrendSlope) {
    let report = `当期均价涨跌(${currentTrendSlope}): ${currentTrendSlope > 0 ? `${fgGreen}上升${reset}` : `${fgRed}下降${reset}`} | 上期均价涨跌(${previousTrendSlope}): `;
    if (previousTrendSlope > 0) {
        if (currentTrendSlope > 0) {
            //持续上升
            if (currentTrendSlope > previousTrendSlope) {
                report += `${fgDarkGreen}加速上升${reset}`;
            } else {
                report += `${fgYellow}上升减弱${reset}`;
            }
        } else {
            //由升转降
            report += `${fgRed}由上升转降${reset}`;
        }
    } else if (previousTrendSlope < 0) {
        if (currentTrendSlope < 0) {
            //持续下降
            if (currentTrendSlope < previousTrendSlope) {
                report += `${fgDarkRed}加速下降${reset}`;
            } else {
                report += `${fgYellow}下降减弱${reset}`;
            }
        } else {
            //由下降转升
            report += `${fgGreen}由下降转升${reset}`;
        }
    } else {
        report += `${fgYellow}无变化${reset}`;
    }
    return report;
}

// Calculate SMA with alignment
function calculateSMA(closes, period) {
    let result = [];
    for (let i = period - 1; i < closes.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += closes[i - j];
        }
        // 计算平均值并四舍五入到两位小数
        result.push(parseFloat((sum / period).toFixed(2)));
    }
    return result;
}
async function start() {
    await exchange.loadMarkets();
    console.log(`OKX BTC/USDT永续合约趋势报告:`);
    await getPriceHistory('15m');
    await getPriceHistory('1h');
    await getPriceHistory('1d');

}
start();

