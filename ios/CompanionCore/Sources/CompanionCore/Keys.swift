// Clip keys and their sampling: the twin of runtime-web/src/clip.ts
// (characters/format/README.md, Clips).
import Foundation

extension Easing: Codable {
    /// "easeIn", ["easeOutBack", s] or ["bezier", x1, y1, x2, y2], as in the clip files.
    public init(from decoder: Decoder) throws {
        if let name = try? decoder.singleValueContainer().decode(String.self) {
            switch name {
            case "linear": self = .linear
            case "step": self = .step
            case "easeIn": self = .easeIn
            case "easeOut": self = .easeOut
            case "easeInOut": self = .easeInOut
            case "easeOutBack": self = .easeOutBack(Easing.backOvershoot)
            default:
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "unknown easing \(name)"))
            }
            return
        }
        var list = try decoder.unkeyedContainer()
        let name = try list.decode(String.self)
        switch name {
        case "easeOutBack":
            self = .easeOutBack(try list.decode(Double.self))
        case "bezier":
            self = .bezier(try list.decode(Double.self), try list.decode(Double.self), try list.decode(Double.self), try list.decode(Double.self))
        default:
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "unknown easing \(name)"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .linear: var c = encoder.singleValueContainer(); try c.encode("linear")
        case .step: var c = encoder.singleValueContainer(); try c.encode("step")
        case .easeIn: var c = encoder.singleValueContainer(); try c.encode("easeIn")
        case .easeOut: var c = encoder.singleValueContainer(); try c.encode("easeOut")
        case .easeInOut: var c = encoder.singleValueContainer(); try c.encode("easeInOut")
        case .easeOutBack(let s):
            var c = encoder.unkeyedContainer(); try c.encode("easeOutBack"); try c.encode(s)
        case .bezier(let x1, let y1, let x2, let y2):
            var c = encoder.unkeyedContainer(); try c.encode("bezier")
            try c.encode(x1); try c.encode(y1); try c.encode(x2); try c.encode(y2)
        }
    }
}

/// A key: [time in ms, value] or [time, value, easing].
public struct Key: Codable, Equatable, Sendable {
    public var time: Double
    public var value: Double
    public var easing: Easing?

    public init(_ time: Double, _ value: Double, _ easing: Easing? = nil) {
        self.time = time; self.value = value; self.easing = easing
    }

    public init(from decoder: Decoder) throws {
        var list = try decoder.unkeyedContainer()
        time = try list.decode(Double.self)
        value = try list.decode(Double.self)
        easing = list.isAtEnd ? nil : try list.decode(Easing.self)
    }

    public func encode(to encoder: Encoder) throws {
        var list = encoder.unkeyedContainer()
        try list.encode(time); try list.encode(value)
        if let easing { try list.encode(easing) }
    }
}

/// A discrete key: [time in ms, value].
public struct DiscreteKey: Codable, Equatable, Sendable {
    public var time: Double
    public var value: String

    public init(_ time: Double, _ value: String) { self.time = time; self.value = value }

    public init(from decoder: Decoder) throws {
        var list = try decoder.unkeyedContainer()
        time = try list.decode(Double.self)
        value = try list.decode(String.self)
    }

    public func encode(to encoder: Encoder) throws {
        var list = encoder.unkeyedContainer()
        try list.encode(time); try list.encode(value)
    }
}

/// A channel's value at time t (ms). A key's easing shapes the segment that ends
/// at it; before the first key and after the last, the channel holds.
public func sampleKeys(_ keys: [Key], _ t: Double) -> Double {
    guard let first = keys.first else { preconditionFailure("a channel needs at least one key") }
    if t <= first.time { return first.value }
    for i in 1..<keys.count {
        let to = keys[i]
        if t < to.time {
            let from = keys[i - 1]
            let span = to.time - from.time
            let u = span > 0 ? (t - from.time) / span : 1
            return from.value + (to.value - from.value) * ease(to.easing, u)
        }
    }
    return keys[keys.count - 1].value
}

/// A discrete track's value at time t: each value holds from its key until the next.
public func sampleDiscrete(_ keys: [DiscreteKey], _ t: Double) -> String {
    guard var value = keys.first?.value else { preconditionFailure("a discrete track needs at least one key") }
    for key in keys {
        if key.time <= t { value = key.value } else { break }
    }
    return value
}
