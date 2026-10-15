// The character package format, version 1: the twin of the types in
// runtime-web/src/format.ts (characters/format/README.md). The web side's
// validator refuses a broken package at build time, so these types only read
// what it accepted. Pairs such as limits ([lo, hi]), a centre of mass ([x, y])
// and a size ([w, h]) are two-element arrays, as in the files.
import Foundation

/// The package format these types read (README, Files).
public let formatVersion = 1

/// A spring on a bone (README, Springs).
public struct Spring: Codable, Equatable, Sendable {
    public var hz: Double
    public var damping: Double
    /// The part's centre of mass in the bone's own space, [x, y] in points; at least 2 pt from the pivot.
    public var com: [Double]
    /// How much the part lags its parent's turns; 1 by default.
    public var follow: Double?
    /// How much the part lags its own clip rotation (an ear turning to a new state); 0 by default.
    public var selfFollow: Double?
    /// How much the pivot's acceleration swings the part; 1 by default.
    public var inertia: Double?
}

/// A bone's rest placement in one view, where the drawing moves the pivot. Values left out keep the bone's own.
public struct BoneView: Codable, Equatable, Sendable {
    public var x: Double?
    public var y: Double?
    public var rest: Double?
}

/// A bone (README, Rig: bones, per-view placement, transforms and scale channels).
public struct Bone: Codable, Equatable, Sendable {
    public var name: String
    public var parent: String?
    public var x: Double?
    public var y: Double?
    public var rest: Double?
    /// Rotation limits [lo, hi] in degrees, around the rest angle: for the clip's rotation and, with a spring, for the total.
    public var rot: [Double]?
    /// Volume-keeping squash limits: y scale s, x scale 1/s. Never on the root.
    public var squash: [Double]?
    /// Uniform scale limits. On the root it scales the whole companion (perspective); elsewhere only the bone's own parts.
    public var scale: [Double]?
    /// Limits of the fake turn's channels, on the fake turn's bone.
    public var yaw: [Double]?
    public var pitch: [Double]?
    public var spring: Spring?
    /// Rest placement in other views (a tail roots at the side in front view, at the back in side view).
    public var views: [String: BoneView]?
}

/// A bending part's control grid and the chain of bones that drives it (README, Bending parts).
public struct Warp: Codable, Equatable, Sendable {
    public var chain: [String]
    /// Always 1 in version 1.
    public var columns: Int
    public var rows: Int
}

/// The view a part follows: the body's or the head's (README, Rig: parts).
public enum PartGroup: String, Codable, Sendable {
    case body, head
}

/// A part hanging from a bone, drawing a region per view or per view and state (README, Rig: parts).
public struct Part: Codable, Equatable, Sendable {
    public var name: String
    public var bone: String
    public var group: PartGroup
    /// Region name per view, or per view and state ("front" or "front:closed"); a JSON null
    /// (nil here) draws nothing there, and a key left out is no key at all (`regionFor`).
    public var regions: [String: String?]
    public var clipTo: String?
    public var warp: Warp?
    /// The state drawn when no clip sets one (for parts whose regions are all "view:state").
    public var defaultState: String?
    /// Its rest alpha, 0 to 1, 1 by default: its alpha where no clip keys it (README, Rig: parts).
    public var alpha: Double?
}

/// How a part moves in the fake turn.
public enum TurnRole: String, Codable, Sendable {
    case face, marking, ear
}

/// The fake turn (section 5b, The rig; Appendix F's fakeTurn; README, Rig: the fake turn).
public struct FakeTurn: Codable, Equatable, Sendable {
    /// The head's width and height in one head view, [w, h] in points.
    public struct HeadView: Codable, Equatable, Sendable {
        public var size: [Double]
    }

    /// The eye that narrows when yaw is positive, and when it is negative.
    public struct FarEye: Codable, Equatable, Sendable {
        public var positive: String
        public var negative: String
    }

    /// The bone whose yaw and pitch channels drive it.
    public var bone: String
    /// The yaw and pitch at which the front drawing's shifts are full.
    public var yawDeg: Double
    public var pitchDeg: Double
    /// Shares of the head's width (face, marking, ear) and height (nod) a part slides at full yaw or pitch.
    public var faceShift: Double
    public var markingShift: Double
    public var earShift: Double
    public var nodShift: Double
    /// How much the far eye narrows at full yaw, as a share of its width.
    public var farEyeNarrow: Double
    /// The head views the fake turn acts in.
    public var views: [String: HeadView]
    public var roles: [String: TurnRole]
    public var farEye: FarEye
}

/// A character's rig.json (README, Rig).
public struct Rig: Codable, Equatable, Sendable {
    public var format: Int
    public var species: String
    /// The character's version, written into the package.
    public var version: String?
    public var height: Double
    /// Parent before child.
    public var bones: [Bone]
    public var views: [String]
    public var parts: [Part]
    /// Each body view's order ("front") and each head view's ("head.front").
    public var drawOrder: [String: [String]]
    /// Other body orders a clip's order track can choose, named "<view>:<variant>".
    public var drawOrderVariants: [String: [String]]?
    /// The bone whose subtree takes the head's view; "head" by default.
    public var headBone: String?
    public var fakeTurn: FakeTurn?
}

/// A channel a clip can key (README, Clips). The cases are in the reference's order.
public enum Channel: String, Codable, CaseIterable, Sendable {
    case rot, x, y, squash, scale, yaw, pitch
}

/// A key of a clip's order track: [time in ms, variant], where a JSON null is the view's own order.
public struct OrderKey: Codable, Equatable, Sendable {
    public var time: Double
    public var variant: String?

    public init(_ time: Double, _ variant: String?) { self.time = time; self.variant = variant }

    public init(from decoder: Decoder) throws {
        var list = try decoder.unkeyedContainer()
        time = try list.decode(Double.self)
        variant = try list.decodeNil() ? nil : try list.decode(String.self)
    }

    public func encode(to encoder: Encoder) throws {
        var list = encoder.unkeyedContainer()
        try list.encode(time)
        if let variant { try list.encode(variant) } else { try list.encodeNil() }
    }
}

/// An event a clip fires when its time crosses `at` (README, Clips: events).
public struct ClipEvent: Codable, Equatable, Sendable {
    public var at: Double
    /// keyPose, sound, haptic, effect, plant, lift or footstep.
    public var type: String
    public var name: String?
}

/// One clip, clips/<name>.json (README, Clips).
public struct Clip: Codable, Equatable, Sendable {
    /// The body's and the head's view tracks.
    public struct ViewTracks: Codable, Equatable, Sendable {
        public var body: [DiscreteKey]?
        public var head: [DiscreteKey]?
    }

    public var name: String
    public var lengthMs: Double
    public var loop: Bool?
    /// How long switching to this clip blends, 150 to 300 ms; 200 by default.
    public var blendInMs: Double?
    public var interruptAt: [Double]?
    /// Keys per bone, then per channel name ("rot", "squash").
    public var tracks: [String: [String: [Key]]]?
    /// Each part's opacity over time, 0 to 1; where no clip keys it, its rest alpha, 1 unless the rig gives one (README, Clips: alpha).
    public var alpha: [String: [Key]]?
    public var states: [String: [DiscreteKey]]?
    public var views: ViewTracks?
    /// The body's draw-order variant over time; null is the view's own order.
    public var order: [OrderKey]?
    public var events: [ClipEvent]?
}

/// A part's drawing for one view and state on an atlas page, in pixels (README, Atlas).
public struct Region: Codable, Equatable, Sendable {
    public var page: Int
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    /// The region pixel that sits on the part's pivot, from the region's top-left corner.
    public var anchorX: Double
    public var anchorY: Double
}

/// One atlas page.
public struct AtlasPage: Codable, Equatable, Sendable {
    public var file: String
    public var scale: Double
    public var width: Double
    public var height: Double
}

/// The regions at one scale: 2x, 3x, 5x or the small page.
public struct AtlasSet: Codable, Equatable, Sendable {
    public var name: String
    public var scale: Double
    public var pages: [AtlasPage]
    public var regions: [String: Region]
}

/// atlas.json: one set of pages and regions per scale.
public struct Atlas: Codable, Equatable, Sendable {
    public var sets: [AtlasSet]
}
