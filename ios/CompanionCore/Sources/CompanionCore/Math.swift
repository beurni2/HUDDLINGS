// The runtime's math: the twin of runtime-web/src/math.ts, written to
// characters/format/README.md. Powers are products and loops run a fixed
// number of times, so both languages compute the same doubles; the test
// vectors in characters/format/vectors/ hold them to it.
import Foundation

public enum Easing: Equatable, Sendable {
    case linear, step, easeIn, easeOut, easeInOut
    case easeOutBack(Double)
    case bezier(Double, Double, Double, Double)

    public static let backOvershoot = 1.70158
}

/// The eased progress of a segment, u in 0...1.
public func ease(_ easing: Easing?, _ u: Double) -> Double {
    switch easing ?? .linear {
    case .linear:
        return u
    case .step:
        return u >= 1 ? 1 : 0
    case .easeIn:
        return u * u * u
    case .easeOut:
        let v = 1 - u
        return 1 - v * v * v
    case .easeInOut:
        if u < 0.5 { return 4 * u * u * u }
        let w = -2 * u + 2
        return 1 - (w * w * w) / 2
    case .easeOutBack(let s):
        let v = u - 1
        return 1 + (s + 1) * v * v * v + s * v * v
    case .bezier(let x1, let y1, let x2, let y2):
        return cubicBezier(x1, y1, x2, y2, u)
    }
}

/// CSS's cubic-bezier(x1, y1, x2, y2) at progress x, solved as WebKit's UnitBezier does.
public func cubicBezier(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ x: Double) -> Double {
    let cx = 3 * x1
    let bx = 3 * (x2 - x1) - cx
    let ax = 1 - cx - bx
    let cy = 3 * y1
    let by = 3 * (y2 - y1) - cy
    let ay = 1 - cy - by
    func sampleX(_ t: Double) -> Double { ((ax * t + bx) * t + cx) * t }
    func sampleY(_ t: Double) -> Double { ((ay * t + by) * t + cy) * t }
    func sampleDX(_ t: Double) -> Double { (3 * ax * t + 2 * bx) * t + cx }
    let epsilon = 1e-7

    var t = x
    for _ in 0..<8 {
        let error = sampleX(t) - x
        if abs(error) < epsilon { return sampleY(t) }
        let d = sampleDX(t)
        if abs(d) < 1e-6 { break }
        t = t - error / d
    }
    var lo = 0.0
    var hi = 1.0
    t = x
    for _ in 0..<64 {
        let value = sampleX(t)
        if abs(value - x) < epsilon { break }
        if x > value { lo = t } else { hi = t }
        t = (hi - lo) / 2 + lo
    }
    return sampleY(t)
}

/// mulberry32: the seeded random source of deterministic mode. Returns numbers in [0, 1).
public struct Mulberry32: Sendable {
    private var a: UInt32

    public init(seed: UInt32) { a = seed }

    public mutating func next() -> Double {
        a = a &+ 0x6D2B_79F5
        var t = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }
}

public let degrees = Double.pi / 180

/// A 2D affine transform: (x, y) maps to (a·x + c·y + tx, b·x + d·y + ty). y grows downward.
public struct Affine: Equatable, Sendable {
    public var a, b, c, d, tx, ty: Double

    public init(a: Double, b: Double, c: Double, d: Double, tx: Double, ty: Double) {
        self.a = a; self.b = b; self.c = c; self.d = d; self.tx = tx; self.ty = ty
    }

    public static let identity = Affine(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)

    /// self × translate(x, y) × rotate(angle) × scale(sx, sy). A positive angle turns +x toward +y.
    public func composed(x: Double, y: Double, angle: Double, sx: Double, sy: Double) -> Affine {
        let r = angle * degrees
        let cosine = cos(r)
        let sine = sin(r)
        let la = cosine * sx
        let lb = sine * sx
        let lc = -sine * sy
        let ld = cosine * sy
        return Affine(
            a: a * la + c * lb,
            b: b * la + d * lb,
            c: a * lc + c * ld,
            d: b * lc + d * ld,
            tx: a * x + c * y + tx,
            ty: b * x + d * y + ty
        )
    }

    public func apply(_ x: Double, _ y: Double) -> (Double, Double) {
        (a * x + c * y + tx, b * x + d * y + ty)
    }
}

/// Catmull–Rom interpolation through p1 and p2 at t in 0...1, with p0 and p3 as neighbours.
public func catmullRom(_ p0: Double, _ p1: Double, _ p2: Double, _ p3: Double, _ t: Double) -> Double {
    let t2 = t * t
    let t3 = t2 * t
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
