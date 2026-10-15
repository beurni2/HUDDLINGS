// Playing clips on a rig: the clock, blending, springs at a fixed 120 Hz, discrete
// tracks and events. The twin of runtime-web/src/player.ts
// (characters/format/README.md, Playing, blending and the clock; Springs). The host
// gives absolute times; the player never reads a wall clock.
import Foundation

/// The springs' fixed rate: step n runs at exactly n / stepHz seconds.
public let stepHz = 120.0
private let stepSeconds = 1 / stepHz
/// The one slack (seconds): a frame time within it of a step's time runs that step.
/// Every comparison against a clip's own time (keys, tracks, events, cuts) is exact,
/// so a jump, its cut and its event always land on the same step.
private let slack = 1e-9
/// How long a switch blends when neither the call nor the clip says.
public let defaultBlendMs = 200.0

public enum PlayerError: Error, Equatable {
    case unknownClip(String)
    case timeWentBackwards(Double, after: Double)
}

private final class Mixer {
    let clip: Clip
    /// When the clip started, in seconds.
    let start: Double
    /// The clip it blends from, until the blend ends.
    var from: Mixer?
    let blendSeconds: Double
    /// Elapsed ms up to which this clip's events have fired.
    var firedTo: Double

    init(clip: Clip, start: Double, from: Mixer?, blendSeconds: Double, firedTo: Double) {
        self.clip = clip; self.start = start; self.from = from; self.blendSeconds = blendSeconds; self.firedTo = firedTo
    }
}

private final class SpringState {
    let bone: Int
    let spring: Spring
    let limit: [Double]
    /// θ and θ′ after the last step, and θ one step before (for drawing between steps).
    var theta = 0.0
    var velocity = 0.0
    var previousTheta = 0.0
    /// Over the last three steps, newest last: the pivot's world position, the parent's world angle, the bone's own rest + clip angle.
    var pivots: [(x: Double, y: Double)] = []
    var parentAngles: [Double] = []
    var ownAngles: [Double] = []

    init(bone: Int, spring: Spring, limit: [Double]) {
        self.bone = bone; self.spring = spring; self.limit = limit
    }
}

public struct Frame: Sendable {
    public var pose: Pose
    public var state: FrameState
    /// Events crossed since the last frame, in time order.
    public var events: [ClipEvent]
}

/// What the clips key at one time, blended: each bone's channels and each part's alpha.
private struct Sample {
    var bones: [String: Channels]
    var alpha: [String: Double]
}

public final class Player {
    public let rig: CompiledRig
    private let clips: [String: Clip]
    private var mixer: Mixer?
    private var steps = 0
    private var now = 0.0
    private let springs: [SpringState]
    private let springOf: [Int: SpringState]
    private var pending: [ClipEvent] = []
    private let defaultViews: Views
    private var lastStepViews: Views?
    /// Steps at which a jump first shows, which the springs must not feel: hard switches and the host's cuts.
    private var cuts: [Int] = []

    public init(rig: CompiledRig, clips: [Clip]) {
        self.rig = rig
        self.clips = Dictionary(clips.map { ($0.name, $0) }, uniquingKeysWith: { _, last in last })
        springs = rig.rig.bones.enumerated().compactMap { i, bone in
            guard let spring = bone.spring, let limit = bone.rot else { return nil }
            return SpringState(bone: i, spring: spring, limit: limit)
        }
        springOf = Dictionary(springs.map { ($0.bone, $0) }, uniquingKeysWith: { _, last in last })
        let first = rig.rig.views[0]
        defaultViews = Views(body: first, head: first)
    }

    /// Starts a clip at time t (seconds), blending from whatever plays over blendMs
    /// (the clip's blendInMs, else 200 ms). The old clip's events up to t still reach
    /// the next frame; after t only the new clip's fire.
    public func play(_ name: String, at t: Double, blendMs: Double? = nil) throws {
        guard let clip = clips[name] else { throw PlayerError.unknownClip(name) }
        try checkTime(t)
        let blend = (blendMs ?? clip.blendInMs ?? defaultBlendMs) / 1000
        if let mixer {
            pending.append(contentsOf: collectEvents(mixer, t))
            if blend <= 0 { cuts.append(firstStepShowing(t)) }
        }
        mixer = Mixer(clip: clip, start: t, from: mixer, blendSeconds: mixer != nil ? blend : 0, firedTo: -.infinity)
    }

    /// Tells the springs the companion jumped at time t (placed somewhere new): they keep swinging but feel no kick.
    public func cut(at t: Double) throws {
        try checkTime(t)
        cuts.append(firstStepShowing(t))
    }

    /// The first step that shows a change made at time t: at or after t, and not yet run.
    private func firstStepShowing(_ t: Double) -> Int {
        var n = Int((t * stepHz).rounded(.up))
        while Double(n) / stepHz < t { n += 1 }
        while n > 0 && Double(n - 1) / stepHz >= t { n -= 1 }
        return max(n, steps + 1)
    }

    /// Runs the springs up to time t (seconds) and returns the frame to draw at t.
    public func advance(to t: Double) throws -> Frame {
        try checkTime(t)
        while Double(steps + 1) / stepHz <= t + slack {
            steps += 1
            step(Double(steps) / stepHz, Double(steps - 1) / stepHz)
        }
        let alpha = min(max((t - Double(steps) / stepHz) * stepHz, 0), 1)
        var angles: [String: Double] = [:]
        for s in springs { angles[rig.rig.bones[s.bone].name] = s.previousTheta + (s.theta - s.previousTheta) * alpha }
        var state = stateAt(t)
        let clips = sample(t)
        let clipChannels = clips.bones
        let pose = evaluatePose(rig, PoseInput(channels: clipChannels, springs: angles, views: state.views))
        if let turnBone = rig.rig.fakeTurn?.bone { state.turn = clipChannels[turnBone] }
        state.alpha = clips.alpha
        var events = pending
        if let mixer { events.append(contentsOf: collectEvents(mixer, t)) }
        pending = []
        // Time only moves forward, so a blend that is over at this frame is over for good.
        var m = mixer
        while let current = m {
            if current.from != nil && weight(current, t) >= 1 { current.from = nil }
            m = current.from
        }
        return Frame(pose: pose, state: state, events: events)
    }

    /// The clip channels at time t, blended. It changes nothing, so a host may look ahead.
    public func channels(at t: Double) -> [String: Channels] {
        sample(t).bones
    }

    /// The clips' channels and part alphas at time t, blended.
    private func sample(_ t: Double) -> Sample {
        mixer.map { evaluate($0, t) } ?? Sample(bones: [:], alpha: [:])
    }

    private func checkTime(_ t: Double) throws {
        if !(t >= now - slack) { throw PlayerError.timeWentBackwards(t, after: now) }
        now = max(now, t)
    }

    private func evaluate(_ m: Mixer, _ t: Double) -> Sample {
        // Before its start a clip shows nothing of its own; the clip it replaces still plays.
        if let from = m.from, t < m.start { return evaluate(from, t) }
        let local = localTime(m.clip, (t - m.start) * 1000)
        var out: [String: Channels] = [:]
        for (bone, tracks) in m.clip.tracks ?? [:] {
            var ch = Channels()
            for name in Channel.allCases {
                if let keys = tracks[name.rawValue] { ch[name] = sampleKeys(keys, local) }
            }
            out[bone] = ch
        }
        var alpha: [String: Double] = [:]
        for (part, keys) in m.clip.alpha ?? [:] { alpha[part] = sampleKeys(keys, local) }
        guard let fromMixer = m.from else { return Sample(bones: out, alpha: alpha) }
        let w = weight(m, t)
        if w >= 1 { return Sample(bones: out, alpha: alpha) }
        let from = evaluate(fromMixer, t)
        var blended: [String: Channels] = [:]
        for bone in Set(from.bones.keys).union(out.keys) {
            let a = from.bones[bone] ?? Channels()
            let b = out[bone] ?? Channels()
            var ch = Channels()
            for name in Channel.allCases {
                if a[name] == nil && b[name] == nil { continue }
                let va = a[name] ?? restValue(name)
                let vb = b[name] ?? restValue(name)
                ch[name] = va + (vb - va) * w
            }
            blended[bone] = ch
        }
        // A part's alpha blends as a channel does, from or to its rest value, 1.
        var blendedAlpha: [String: Double] = [:]
        for part in Set(from.alpha.keys).union(alpha.keys) {
            let va = from.alpha[part] ?? 1
            let vb = alpha[part] ?? 1
            blendedAlpha[part] = va + (vb - va) * w
        }
        return Sample(bones: blended, alpha: blendedAlpha)
    }

    /// The blend weight of a clip over the one it replaces: easeInOut over its blend time.
    private func weight(_ m: Mixer, _ t: Double) -> Double {
        if m.blendSeconds <= 0 { return 1 }
        let u = min(max((t - m.start) / m.blendSeconds, 0), 1)
        return ease(.easeInOut, u)
    }

    /// The clip whose discrete tracks and draw order show at t: the newest once its weight reaches 0.5.
    private func discreteSource(_ t: Double) -> Mixer? {
        var m = mixer
        while let current = m, let from = current.from, t < current.start || weight(current, t) < 0.5 { m = from }
        return m
    }

    private func stateAt(_ t: Double) -> FrameState {
        var views = defaultViews
        var states: [String: String] = [:]
        var variant: String?
        if let m = discreteSource(t) {
            let local = localTime(m.clip, (t - m.start) * 1000)
            if let body = m.clip.views?.body { views.body = sampleDiscrete(body, local) }
            if let head = m.clip.views?.head { views.head = sampleDiscrete(head, local) }
            for (part, keys) in m.clip.states ?? [:] { states[part] = sampleDiscrete(keys, local) }
            let order = m.clip.order.flatMap { sampleOrder($0, local) }
            if let order, rig.rig.drawOrderVariants?["\(views.body):\(order)"] != nil { variant = "\(views.body):\(order)" }
        }
        return FrameState(views: views, states: states, variant: variant)
    }

    /// The clip's events with elapsed time in (firedTo, t], in time order (file order at equal times), counting each loop.
    private func collectEvents(_ m: Mixer, _ t: Double) -> [ClipEvent] {
        let events = m.clip.events ?? []
        let to = (t - m.start) * 1000
        if events.isEmpty || to <= m.firedTo { return [] }
        var fired: [(at: Double, index: Int)] = []
        forEachCrossing(m.clip, events.map(\.at), m.firedTo, to) { at, i in fired.append((at: at, index: i)) }
        m.firedTo = to
        return fired.sorted { $0.at != $1.at ? $0.at < $1.at : $0.index < $1.index }.map { events[$0.index] }
    }

    /// True when a channel jumps between two step times in a clip that shows at the later one:
    /// a key with `step` easing, or a second key at the same time, that changes the value.
    private func stepKeyCrossed(_ mixer: Mixer?, _ from: Double, _ to: Double) -> Bool {
        var m = mixer
        while let current = m {
            if let older = current.from, to < current.start {
                m = older
                continue
            }
            let a = (from - current.start) * 1000
            let b = (to - current.start) * 1000
            for tracks in (current.clip.tracks ?? [:]).values {
                for keys in tracks.values {
                    let jumps = keys.indices.filter { i in
                        i > 0 && keys[i].value != keys[i - 1].value && (keys[i].easing == .step || keys[i].time == keys[i - 1].time)
                    }.map { keys[$0].time }
                    var crossed = false
                    if !jumps.isEmpty { forEachCrossing(current.clip, jumps, a, b) { _, _ in crossed = true } }
                    if crossed { return true }
                }
            }
            // Older clips show only while this one is still blending in.
            if current.from == nil || weight(current, to) >= 1 { return false }
            m = current.from
        }
        return false
    }

    /// One spring step at time s: the springs feel their parents' motion in this step's pose.
    private func step(_ s: Double, _ previous: Double) {
        if springs.isEmpty { return }
        let views = stateAt(s).views
        let viewsChanged = lastStepViews.map { $0 != views } ?? false
        let cut = cuts.contains(steps) || viewsChanged || stepKeyCrossed(mixer, previous, s)
        cuts = cuts.filter { $0 > steps }
        lastStepViews = views
        // Bones come parents first, so a spring feels its parent's spring from this same step.
        _ = evaluatePose(rig, PoseInput(channels: channels(at: s), views: views)) { bone, pivot, parentAngle, rest, clipRot in
            let sp = self.springOf[bone]!
            integrate(sp, cut, pivot, parentAngle, rest, clipRot)
            return sp.theta
        }
    }
}

/// Calls back for each time in `times` (ms within the clip) whose elapsed position
/// lies in (from, to], counting a looping clip's every pass. Every comparison is exact.
private func forEachCrossing(_ clip: Clip, _ times: [Double], _ from: Double, _ to: Double, _ hit: (Double, Int) -> Void) {
    let length = clip.lengthMs
    let loops = clip.loop == true && length > 0
    let first = loops ? max(0, (from / length).rounded(.down)) : 0
    let last = loops ? (to / length).rounded(.down) : 0
    var k = first
    while k <= last {
        for (i, time) in times.enumerated() {
            let at = k * length + time
            if at > from && at <= to { hit(at, i) }
        }
        k += 1
    }
}

private func push<T>(_ history: inout [T], _ value: T, _ cut: Bool) {
    if cut { history.removeAll() }
    history.append(value)
    if history.count > 3 { history.removeFirst() }
}

/// Second difference over the last three steps, per second squared; zero until there are three.
private func accel(_ h: [Double]) -> Double {
    h.count == 3 ? (h[2] - 2 * h[1] + h[0]) / (stepSeconds * stepSeconds) : 0
}

/// Semi-implicit Euler for one spring (README, Springs).
private func integrate(_ sp: SpringState, _ cut: Bool, _ pivot: (x: Double, y: Double), _ parentAngle: Double, _ rest: Double, _ clipRot: Double) {
    push(&sp.pivots, pivot, cut)
    push(&sp.parentAngles, parentAngle, cut)
    push(&sp.ownAngles, rest + clipRot, cut)
    let ax = accel(sp.pivots.map(\.x))
    let ay = accel(sp.pivots.map(\.y))
    let spring = sp.spring
    // The centre of mass in world space, turned by the bone's drawn world angle before this step.
    let turn = (parentAngle + rest + clipRot + springAngle(sp.theta, clipRot, sp.limit)) * degrees
    let cosine = cos(turn), sine = sin(turn)
    let rx = cosine * spring.com[0] - sine * spring.com[1]
    let ry = sine * spring.com[0] + cosine * spring.com[1]
    let swing = (-(rx * ay - ry * ax) / (rx * rx + ry * ry)) / degrees
    let omega = 2 * Double.pi * spring.hz
    // θ″ = −ω²θ − 2ζωθ′ − follow·φ″ − selfFollow·ψ″ + inertia·α, summed left to right as the reference does.
    let stiffness = -omega * omega * sp.theta
    let damping = 2 * spring.damping * omega * sp.velocity
    let follow = (spring.follow ?? 1) * accel(sp.parentAngles)
    let selfFollow = (spring.selfFollow ?? 0) * accel(sp.ownAngles)
    let inertia = (spring.inertia ?? 1) * swing
    let thetaAccel = stiffness - damping - follow - selfFollow + inertia
    sp.previousTheta = sp.theta
    sp.velocity += stepSeconds * thetaAccel
    sp.theta += stepSeconds * sp.velocity
}
