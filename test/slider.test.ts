import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeSliderFill } from '../src/sliderFill.ts'

describe('Premium Slider Fill Geometry', () => {
  it('computes unipolar fill from 0% to current value percentage', () => {
    // 0 out of 100
    const at0 = computeSliderFill(0, 0, 100, false)
    assert.equal(at0.fillStart, '0%')
    assert.equal(at0.fillEnd, '0.00%')
    assert.equal(at0.pct, 0)

    // 50 out of 100
    const at50 = computeSliderFill(50, 0, 100, false)
    assert.equal(at50.fillStart, '0%')
    assert.equal(at50.fillEnd, '50.00%')
    assert.equal(at50.pct, 50)

    // 100 out of 100
    const at100 = computeSliderFill(100, 0, 100, false)
    assert.equal(at100.fillStart, '0%')
    assert.equal(at100.fillEnd, '100.00%')
    assert.equal(at100.pct, 100)

    // Clamps out-of-bound values
    const over = computeSliderFill(150, 0, 100, false)
    assert.equal(over.fillEnd, '100.00%')

    const under = computeSliderFill(-20, 0, 100, false)
    assert.equal(under.fillEnd, '0.00%')
  })

  it('computes bipolar fill outward from center 0', () => {
    // Exact zero: no outward bar
    const at0 = computeSliderFill(0, -100, 100, true)
    assert.equal(at0.fillStart, '50.00%')
    assert.equal(at0.fillEnd, '50.00%')
    assert.equal(at0.pct, 50)

    // Positive value (+40): fills from 50% to 70%
    const at40 = computeSliderFill(40, -100, 100, true)
    assert.equal(at40.fillStart, '50.00%')
    assert.equal(at40.fillEnd, '70.00%')
    assert.equal(at40.pct, 70)

    // Negative value (-60): fills from 20% to 50%
    const atMinus60 = computeSliderFill(-60, -100, 100, true)
    assert.equal(atMinus60.fillStart, '20.00%')
    assert.equal(atMinus60.fillEnd, '50.00%')
    assert.equal(atMinus60.pct, 20)

    // Extreme positive (+100): fills from 50% to 100%
    const atMax = computeSliderFill(100, -100, 100, true)
    assert.equal(atMax.fillStart, '50.00%')
    assert.equal(atMax.fillEnd, '100.00%')

    // Extreme negative (-100): fills from 0% to 50%
    const atMin = computeSliderFill(-100, -100, 100, true)
    assert.equal(atMin.fillStart, '0.00%')
    assert.equal(atMin.fillEnd, '50.00%')
  })

  it('automatically detects bipolar nature when min < 0 and max > 0', () => {
    const res = computeSliderFill(20, -50, 50)
    assert.equal(res.fillStart, '50.00%')
    assert.equal(res.fillEnd, '70.00%')
  })
})
