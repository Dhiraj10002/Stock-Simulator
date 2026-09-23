package greeks

import (
	"math"
)

// Cumulative normal distribution approximation (Abramowitz & Stegun formula)
func cnd(x float64) float64 {
	if x < 0 {
		return 1.0 - cnd(-x)
	}
	b1 := 0.319381530
	b2 := -0.356563782
	b3 := 1.781477937
	b4 := -1.821255978
	b5 := 1.330274429
	p := 0.2316419
	c := 0.398942280401432677939946059934 // 1 / sqrt(2*pi)

	t := 1.0 / (1.0 + p*x)
	return 1.0 - c*math.Exp(-x*x/2.0)*t*(t*(t*(t*(b5*t+b4)+b3)+b2)+b1)
}

// Standard normal probability density function
func pdf(x float64) float64 {
	return (1.0 / math.Sqrt(2.0*math.Pi)) * math.Exp(-0.5*x*x)
}

type GreeksResult struct {
	Price float64 // Theoretical option price in rupees
	Delta float64 // Delta (sensitivity to underlying price change)
	Gamma float64 // Gamma (rate of change of delta)
	Theta float64 // Theta (time decay per calendar day in rupees)
	Vega  float64 // Vega (sensitivity to 1% change in volatility)
	IV    float64 // Implied volatility percentage (e.g. 15.5%)
}

// CalculateGreeks computes the Black-Scholes price and Greeks.
// spot: underlying spot price in rupees (e.g. 25000.0)
// strike: option strike price in rupees (e.g. 25000.0)
// timeYears: time to expiry in years (e.g. 7.0/365.0)
// rate: risk-free interest rate annualized (e.g. 0.065 for 6.5%)
// vol: volatility annualized (e.g. 0.15 for 15%)
// isCall: true for Call (CE), false for Put (PE)
func CalculateGreeks(spot, strike, timeYears, rate, vol float64, isCall bool) GreeksResult {
	if timeYears <= 0.0001 {
		timeYears = 0.0001 // minimum floor for numerical stability
	}
	if vol <= 0.01 {
		vol = 0.01
	}

	sqrtT := math.Sqrt(timeYears)
	d1 := (math.Log(spot/strike) + (rate+0.5*vol*vol)*timeYears) / (vol * sqrtT)
	d2 := d1 - vol*sqrtT

	pdfD1 := pdf(d1)
	cndD1 := cnd(d1)
	cndD2 := cnd(d2)

	discountFactor := math.Exp(-rate * timeYears)

	var price float64
	var delta float64
	var theta float64

	if isCall {
		price = spot*cndD1 - strike*discountFactor*cndD2
		delta = cndD1
		theta = (-(spot*pdfD1*vol)/(2.0*sqrtT) - rate*strike*discountFactor*cndD2) / 365.0
	} else {
		cndNegD1 := cnd(-d1)
		cndNegD2 := cnd(-d2)
		price = strike*discountFactor*cndNegD2 - spot*cndNegD1
		delta = cndD1 - 1.0
		theta = (-(spot*pdfD1*vol)/(2.0*sqrtT) + rate*strike*discountFactor*cndNegD2) / 365.0
	}

	if price < 0.05 {
		price = 0.05 // tick minimum floor
	}

	gamma := pdfD1 / (spot * vol * sqrtT)
	vega := (spot * sqrtT * pdfD1) / 100.0 // per 1% change in vol

	return GreeksResult{
		Price: math.Round(price*100) / 100,
		Delta: math.Round(delta*1000) / 1000,
		Gamma: math.Round(gamma*100000) / 100000,
		Theta: math.Round(theta*100) / 100,
		Vega:  math.Round(vega*100) / 100,
		IV:    math.Round(vol*100.0*10) / 10,
	}
}
