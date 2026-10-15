// Evaluating a pose: bone world transforms from channel values, springs and
// views, and the draw list both renderers draw. The twin of
// runtime-web/src/rig.ts (characters/format/README.md, Rig; Bending parts).
import Foundation

/// A bone's channel values; a channel left out is at rest.
public struct Channels: Codable, Equatable, Sendable {
    public var rot: Double?
    public var x: Double?
    public var y: Double?
    public var squash: Double?
    public var scale: Double?
    public var yaw: Double?
    public var pitch: Double?

    public init(rot: Double? = nil, x: Double? = nil, y: Double? = nil, squash: Double? = nil,
                scale: Double? = nil, yaw: Double? = nil, pitch: Double? = nil) {
        self.rot = rot; self.x = x; self.y = y; self.squash = squash; self.scale = scale; self.yaw = yaw; self.pitch = pitch
    }

    public subscript(channel: Channel) -> Double? {
        get {
            switch channel {
            case .rot: return rot
            case .x: return x
            case .y: return y
            case .squash: return squash
            case .scale: return scale
            case .yaw: return yaw
            case .pitch: return pitch
            }
        }
        set {
            switch channel {
            case .rot: rot = newValue
            case .x: x = newValue
            case .y: y = newValue
            case .squash: squash = newValue
            case .scale: scale = newValue
            case .yaw: yaw = newValue
            case .pitch: pitch = newValue
            }
        }
    }
}

/// The body's view and the head's, which can differ (README, Rig: the head bone).
public struct Views: Codable, Equatable, Sendable {
    public var body: String
    public var head: String

    public init(body: String, head: String) { self.body = body; self.head = head }
}

public struct PoseInput: Sendable {
    /// The clip's channel values per bone; missing channels are at rest.
    public var channels: [String: Channels]
    /// Spring angles θ per bone, in degrees, before the soft limit.
    public var springs: [String: Double]?
    public var views: Views

    public init(channels: [String: Channels], springs: [String: Double]? = nil, views: Views) {
        self.channels = channels; self.springs = springs; self.views = views
    }
}

public struct Pose: Sendable {
    /// Each bone's frame in world points: rotation and translation, and the root's
    /// uniform scale. A bone's own squash and scale never reach its children's frames.
    public var world: [Affine]
    /// Each bone's own x and y scale, from squash and scale: it scales the bone's parts and its children's pivot offsets.
    public var scale: [(x: Double, y: Double)]
    /// Each bone's world angle: the sum of the rotations along its chain, in degrees.
    public var angle: [Double]
}

public struct CompiledRig: Sendable {
    public let rig: Rig
    public let index: [String: Int]
    public let parent: [Int]
    /// True for the head bone and its descendants: they take the head's view.
    public let inHead: [Bool]
    public let parts: [String: Part]
}

/// Indexes a rig's bones and parts for posing.
public func compile(_ rig: Rig) -> CompiledRig {
    var index: [String: Int] = [:]
    var parent: [Int] = []
    var inHead: [Bool] = []
    let headBone = rig.headBone ?? "head"
    for (i, bone) in rig.bones.enumerated() {
        index[bone.name] = i
        let p = bone.parent.map { index[$0]! } ?? -1
        parent.append(p)
        inHead.append(bone.name == headBone || (p >= 0 && inHead[p]))
    }
    let parts = Dictionary(rig.parts.map { ($0.name, $0) }, uniquingKeysWith: { _, last in last })
    return CompiledRig(rig: rig, index: index, parent: parent, inHead: inHead, parts: parts)
}

/// A bone's rest placement in a view: the view's override, or the bone's own (README, Rig: per-view placement).
public func restOf(_ bone: Bone, _ view: String) -> (x: Double, y: Double, rest: Double) {
    let o = bone.views?[view]
    return (x: o?.x ?? bone.x ?? 0, y: o?.y ?? bone.y ?? 0, rest: o?.rest ?? bone.rest ?? 0)
}

/// Supplies a spring's θ while a pose is built, bone by bone, parents first: the
/// player integrates there, given the bone's index, the pivot's world position,
/// the parent's world angle, and the bone's rest angle and clip rotation.
public typealias SpringSource = (_ bone: Int, _ pivot: (x: Double, y: Double), _ parentAngle: Double, _ rest: Double, _ clipRot: Double) -> Double

/// Every bone's frame, own scale and world angle (README, Rig: transforms). Springs
/// come from `springSource` when given, else from the input's angles.
public func evaluatePose(_ c: CompiledRig, _ input: PoseInput, springSource: SpringSource? = nil) -> Pose {
    let n = c.rig.bones.count
    var world = [Affine](repeating: .identity, count: n)
    var scale = [(x: Double, y: Double)](repeating: (x: 1, y: 1), count: n)
    var angle = [Double](repeating: 0, count: n)
    for i in 0..<n {
        let bone = c.rig.bones[i]
        let ch = input.channels[bone.name] ?? Channels()
        let rest = restOf(bone, c.inHead[i] ? input.views.head : input.views.body)
        let x = rest.x + (ch.x ?? 0)
        let y = rest.y + (ch.y ?? 0)
        let clipRot = ch.rot ?? 0
        let p = c.parent[i]
        if p < 0 {
            // The root: its uniform scale is the whole companion's (perspective), so its frame carries it.
            let s = ch.scale ?? 1
            world[i] = Affine.identity.composed(x: x, y: y, angle: 0, sx: s, sy: s)
            scale[i] = (x: 1, y: 1)
            angle[i] = 0
            continue
        }
        let (psx, psy) = scale[p]
        var rot = rest.rest + clipRot
        if bone.spring != nil, let limit = bone.rot {
            let theta: Double
            if let springSource {
                theta = springSource(i, world[p].apply(psx * x, psy * y), angle[p], rest.rest, clipRot)
            } else {
                theta = input.springs?[bone.name] ?? 0
            }
            rot += springAngle(theta, clipRot, limit)
        }
        let squash = ch.squash ?? 1
        let s = ch.scale ?? 1
        world[i] = world[p].composed(x: psx * x, y: psy * y, angle: rot, sx: 1, sy: 1)
        scale[i] = (x: s / squash, y: s * squash)
        angle[i] = angle[p] + rot
    }
    return Pose(world: world, scale: scale, angle: angle)
}

/// The spring's share of a bone's rotation: θ through the soft limit, in the room the
/// clip's rotation leaves inside the bone's rot limit [lo, hi] (README, Springs).
public func springAngle(_ theta: Double, _ clipRot: Double, _ limit: [Double]) -> Double {
    softLimit(theta, limit[0] - clipRot, limit[1] - clipRot)
}

/// The transform a bone's parts are drawn with: its frame and its own scale.
public func partMatrix(_ pose: Pose, _ bone: Int) -> Affine {
    let m = pose.world[bone]
    let (sx, sy) = pose.scale[bone]
    return Affine(a: m.a * sx, b: m.b * sx, c: m.c * sy, d: m.d * sy, tx: m.tx, ty: m.ty)
}

/// One part as the renderers draw it (README, Rendering).
public struct DrawItem: Equatable, Sendable {
    public var part: String
    public var region: String
    public var page: Int
    /// Mesh vertices in world points, row-major, (columns + 1) × (rows + 1).
    public var positions: [Double]
    /// Matching texture coordinates in 0...1 of the page.
    public var uvs: [Double]
    public var columns: Int
    public var rows: Int
    /// The index in the draw list of the part this one is clipped to.
    public var clipTo: Int?
}

/// Sub-rows per control row when a bending part's grid is expanded (README, Bending parts).
public let warpSubdivisions = 4

/// The region a part draws for a view and a state, or nil when it draws nothing (README,
/// Rig: parts): of "view:state" (the default state when no clip gives one), "view" and
/// "view:defaultState", the first key present decides, and a null draws nothing.
public func regionFor(_ part: Part, _ view: String, _ state: String?) -> String? {
    let fallback = part.defaultState ?? "open"
    for key in ["\(view):\(state ?? fallback)", view, "\(view):\(fallback)"] {
        // A key present holds String?: nil is the file's null.
        if let region = part.regions[key] { return region }
    }
    return nil
}

/// The parts in drawing order for the current views and draw-order variant: the head's
/// order stands where "@head" is, and a variant of another view is ignored (README, Rig).
public func orderFor(_ rig: Rig, _ views: Views, _ variant: String?) -> [String] {
    let own = variant.flatMap { $0.hasPrefix("\(views.body):") ? rig.drawOrderVariants?[$0] : nil }
    let body = own ?? rig.drawOrder[views.body] ?? []
    let head = rig.drawOrder["head.\(views.head)"] ?? []
    return body.flatMap { $0 == "@head" ? head : [$0] }
}

/// What a frame shows besides the pose.
public struct FrameState: Sendable {
    public var views: Views
    /// Discrete part states, such as an eye's "closed".
    public var states: [String: String]
    /// The body's draw-order variant ("front:sniff"), when the clip's order track names one this view has.
    public var variant: String?
    /// The channels of the fake turn's bone (yaw, pitch), when the rig has one.
    public var turn: Channels?

    public init(views: Views, states: [String: String] = [:], variant: String? = nil, turn: Channels? = nil) {
        self.views = views; self.states = states; self.variant = variant; self.turn = turn
    }
}

public struct TurnEffect: Sendable {
    /// How far each part slides, in points, in the fake turn bone's space.
    public var shift: [String: (x: Double, y: Double)] = [:]
    /// The far eye's x scale about its centre.
    public var narrow: [String: Double] = [:]
}

private func clamp1(_ v: Double) -> Double { min(max(v, -1), 1) }

/// The fake turn (section 5b; README, Rig: the fake turn): at full yaw the face slides
/// toward the turn by faceShift of the head's width, markings by markingShift, the ears
/// the other way by earShift, and the far eye narrows by farEyeNarrow; full pitch slides
/// the face by nodShift of the head's height. Positive yaw slides toward +x, positive
/// pitch toward +y (down). Beyond full yaw or pitch the shifts hold. Nothing moves in a
/// view the turn does not list.
public func fakeTurn(_ rig: Rig, _ headView: String, _ turn: Channels?) -> TurnEffect {
    var effect = TurnEffect()
    guard let ft = rig.fakeTurn, let view = ft.views[headView], let turn else { return effect }
    let u = clamp1((turn.yaw ?? 0) / ft.yawDeg)
    let v = clamp1((turn.pitch ?? 0) / ft.pitchDeg)
    let w = view.size[0]
    let h = view.size[1]
    for (part, role) in ft.roles {
        switch role {
        case .face: effect.shift[part] = (x: ft.faceShift * w * u, y: ft.nodShift * h * v)
        case .marking: effect.shift[part] = (x: ft.markingShift * w * u, y: 0)
        case .ear: effect.shift[part] = (x: -ft.earShift * w * u, y: 0)
        }
    }
    if u > 0 { effect.narrow[ft.farEye.positive] = 1 - ft.farEyeNarrow * u }
    if u < 0 { effect.narrow[ft.farEye.negative] = 1 + ft.farEyeNarrow * u }
    return effect
}

/// The parts to draw, in order, as meshes in world points with their atlas coordinates
/// (README, Rig: parts, clipTo and the fake turn; Bending parts; Rendering).
public func drawList(_ c: CompiledRig, _ pose: Pose, _ atlas: AtlasSet, _ frame: FrameState) -> [DrawItem] {
    var items: [DrawItem] = []
    var indexOfPart: [String: Int] = [:]
    let turn = fakeTurn(c.rig, frame.views.head, frame.turn)
    let turnFrame = c.rig.fakeTurn.map { partMatrix(pose, c.index[$0.bone]!) } ?? .identity
    for name in orderFor(c.rig, frame.views, frame.variant) {
        let part = c.parts[name]!
        let view = part.group == .head ? frame.views.head : frame.views.body
        guard let regionName = regionFor(part, view, frame.states[name]) else { continue }
        // A clipped part shows only inside its mask: no mask drawn, nothing shown.
        let mask = part.clipTo.flatMap { indexOfPart[$0] }
        if part.clipTo != nil && mask == nil { continue }
        let region = atlas.regions[regionName]!
        let page = atlas.pages[region.page]
        let s = page.scale
        // The region's rectangle in the part's bone space: its anchor sits on the pivot.
        let left = -region.anchorX / s
        let top = -region.anchorY / s
        let width = region.w / s
        let height = region.h / s
        let u0 = region.x / page.width
        let v0 = region.y / page.height
        let u1 = (region.x + region.w) / page.width
        let v1 = (region.y + region.h) / page.height
        var item = DrawItem(part: name, region: regionName, page: region.page, positions: [], uvs: [], columns: 1, rows: 1)
        if let warp = part.warp {
            warpMesh(c, pose, warp, frame.views, left, top, width, height, &item)
            for r in 0...item.rows {
                let v = v0 + (v1 - v0) * (Double(r) / Double(item.rows))
                item.uvs.append(contentsOf: [u0, v, u1, v])
            }
        } else {
            let m = partMatrix(pose, c.index[part.bone]!)
            let n = turn.narrow[name] ?? 1
            let cx = left + width / 2
            for (x, y) in [(left, top), (left + width, top), (left, top + height), (left + width, top + height)] {
                let (px, py) = m.apply(cx + (x - cx) * n, y)
                item.positions.append(contentsOf: [px, py])
            }
            item.uvs.append(contentsOf: [u0, v0, u1, v0, u0, v1, u1, v1])
        }
        if let shift = turn.shift[name] {
            // The slide is in the turn bone's space, its frame and own scale: carry it into the world and move every vertex.
            let dx = turnFrame.a * shift.x + turnFrame.c * shift.y
            let dy = turnFrame.b * shift.x + turnFrame.d * shift.y
            for k in stride(from: 0, to: item.positions.count, by: 2) {
                item.positions[k] += dx
                item.positions[k + 1] += dy
            }
        }
        item.clipTo = mask
        indexOfPart[name] = items.count
        items.append(item)
    }
    return items
}

/// A bending part (README, Bending parts). Each row of its control grid, from the top of
/// the region (row 0) to the bottom, belongs to the chain bone that owns its place along
/// the chain at rest: the row is carried into that bone's space by the inverse of the
/// bone's rest transform, then moved by the bone's part transform. The grid is then
/// expanded by Catmull–Rom along each column into the dense mesh both runtimes draw as it is.
private func warpMesh(
    _ c: CompiledRig, _ pose: Pose, _ warp: Warp, _ views: Views,
    _ left: Double, _ top: Double, _ width: Double, _ height: Double, _ item: inout DrawItem
) {
    let chain = warp.chain.map { c.index[$0]! }
    // Each chain bone's rest transform relative to the chain's first bone, the part's own bone.
    var restRel: [Affine] = [.identity]
    for k in 1..<chain.count {
        let i = chain[k]
        let r = restOf(c.rig.bones[i], c.inHead[i] ? views.head : views.body)
        restRel.append(restRel[k - 1].composed(x: r.x, y: r.y, angle: r.rest, sx: 1, sy: 1))
    }
    // A place along the chain is a projection on the line from its first pivot to its
    // last; it needs no unit length, since only its order matters. A row exactly at a
    // joint belongs to the child bone.
    let last = restRel[restRel.count - 1]
    func along(_ x: Double, _ y: Double) -> Double { x * last.tx + y * last.ty }
    let inverses = restRel.map { $0.inverted() }
    let centre = left + width / 2

    let rows = warp.rows
    var control: [[(x: Double, y: Double)]] = []
    for r in 0...rows {
        let y = top + height * (Double(r) / Double(rows))
        let d = along(centre, y)
        var k = 0
        for j in 1..<chain.count where along(restRel[j].tx, restRel[j].ty) <= d { k = j }
        let m = partMatrix(pose, chain[k])
        let inv = inverses[k]
        var row: [(x: Double, y: Double)] = []
        for x in [left, left + width] {
            let (lx, ly) = inv.apply(x, y)
            row.append(m.apply(lx, ly))
        }
        control.append(row)
    }

    let dense = rows * warpSubdivisions
    item.rows = dense
    item.columns = 1
    // Beyond the ends the grid continues in a straight line, so evenly spaced rows at
    // rest stay evenly spaced (repeating the end rows would squeeze the texture there).
    func p(_ k: Int, _ col: Int) -> (x: Double, y: Double) {
        if k < 0 {
            let a = control[0][col], b = control[1][col]
            return (x: 2 * a.x - b.x, y: 2 * a.y - b.y)
        }
        if k > rows {
            let a = control[rows][col], b = control[rows - 1][col]
            return (x: 2 * a.x - b.x, y: 2 * a.y - b.y)
        }
        return control[k][col]
    }
    for i in 0...dense {
        let r = min(rows - 1, i / warpSubdivisions)
        let f = Double(i) / Double(warpSubdivisions) - Double(r)
        for col in 0..<2 {
            item.positions.append(catmullRom(p(r - 1, col).x, p(r, col).x, p(r + 1, col).x, p(r + 2, col).x, f))
            item.positions.append(catmullRom(p(r - 1, col).y, p(r, col).y, p(r + 1, col).y, p(r + 2, col).y, f))
        }
    }
}
