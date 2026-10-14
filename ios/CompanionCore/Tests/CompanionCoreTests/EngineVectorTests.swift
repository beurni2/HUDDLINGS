// The engine must draw the web runtime's frames: whole poses, draw lists and a
// player run of the test character (characters/test/src), every number within
// 1e-9 of characters/format/vectors/ and every name, state and event equal
// (characters/format/README.md, Test vectors).
import Foundation
import XCTest
@testable import CompanionCore

private let tolerance = 1e-9

private let repository: URL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()  // CompanionCoreTests
    .deletingLastPathComponent()  // Tests
    .deletingLastPathComponent()  // CompanionCore
    .deletingLastPathComponent()  // ios
    .deletingLastPathComponent()  // repository

/// Reads a JSON file by its path in the repository, as the vectors name them.
private func loadVector<T: Decodable>(_ path: String, as type: T.Type) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(contentsOf: repository.appendingPathComponent(path)))
}

/// Every clip in a folder of the repository.
private func loadClips(_ folder: String) throws -> [Clip] {
    let files = try FileManager.default.contentsOfDirectory(at: repository.appendingPathComponent(folder), includingPropertiesForKeys: nil)
    return try files.filter { $0.pathExtension == "json" }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
        .map { try JSONDecoder().decode(Clip.self, from: Data(contentsOf: $0)) }
}

private func flat(_ m: Affine) -> [Double] { [m.a, m.b, m.c, m.d, m.tx, m.ty] }

/// Compares numbers within the tolerance and remembers the largest difference it saw.
private final class Comparison {
    private(set) var largest = 0.0
    private(set) var count = 0

    func close(_ a: Double, _ b: Double, _ message: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
        let difference = abs(a - b)
        largest = max(largest, difference)
        count += 1
        XCTAssert(difference <= tolerance, "\(message()): \(a) vs \(b)", file: file, line: line)
    }

    func close(_ a: [Double], _ b: [Double], _ message: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(a.count, b.count, "\(message()): length", file: file, line: line)
        for (i, (x, y)) in zip(a, b).enumerated() { close(x, y, "\(message()) [\(i)]", file: file, line: line) }
    }
}

final class EngineVectorTests: XCTestCase {
    func testPoses() throws {
        struct Case: Decodable {
            let channels: [String: Channels]
            let springs: [String: Double]
            let views: Views
            let world: [[Double]]
            let scale: [[Double]]
            let angle: [Double]
        }
        struct File: Decodable { let rig: String; let cases: [Case] }
        let file = try loadVector("characters/format/vectors/poses.json", as: File.self)
        let c = compile(try loadVector(file.rig, as: Rig.self))
        XCTAssertFalse(file.cases.isEmpty)
        let compare = Comparison()
        for (n, x) in file.cases.enumerated() {
            let pose = evaluatePose(c, PoseInput(channels: x.channels, springs: x.springs, views: x.views))
            XCTAssertEqual(pose.world.count, x.world.count, "case \(n): bones")
            for i in 0..<min(pose.world.count, x.world.count) {
                let bone = c.rig.bones[i].name
                compare.close(flat(pose.world[i]), x.world[i], "case \(n) \(bone) world")
                compare.close([pose.scale[i].x, pose.scale[i].y], x.scale[i], "case \(n) \(bone) scale")
                compare.close(pose.angle[i], x.angle[i], "case \(n) \(bone) angle")
            }
        }
        print("poses: \(file.cases.count) cases, \(compare.count) numbers, largest difference \(compare.largest)")
    }

    func testDrawLists() throws {
        struct State: Decodable {
            let views: Views
            let states: [String: String]
            let variant: String?
            let turn: Channels?
        }
        struct Item: Decodable {
            let part: String
            let region: String
            let page: Int
            let positions: [Double]
            let uvs: [Double]
            let columns: Int
            let rows: Int
            let clipTo: Int?
        }
        struct Case: Decodable {
            let channels: [String: Channels]
            let springs: [String: Double]
            let views: Views
            let state: State
            let items: [Item]
        }
        struct File: Decodable { let rig: String; let atlas: AtlasSet; let cases: [Case] }
        let file = try loadVector("characters/format/vectors/drawlists.json", as: File.self)
        let c = compile(try loadVector(file.rig, as: Rig.self))
        XCTAssertFalse(file.cases.isEmpty)
        let compare = Comparison()
        for (n, x) in file.cases.enumerated() {
            let pose = evaluatePose(c, PoseInput(channels: x.channels, springs: x.springs, views: x.views))
            let frame = FrameState(views: x.state.views, states: x.state.states, variant: x.state.variant, turn: x.state.turn)
            let items = drawList(c, pose, file.atlas, frame)
            XCTAssertEqual(items.map(\.part), x.items.map(\.part), "case \(n): parts in order")
            for (item, expected) in zip(items, x.items) {
                let at = "case \(n) \(item.part)"
                XCTAssertEqual(item.part, expected.part, at)
                XCTAssertEqual(item.region, expected.region, at)
                XCTAssertEqual(item.page, expected.page, at)
                XCTAssertEqual(item.columns, expected.columns, at)
                XCTAssertEqual(item.rows, expected.rows, at)
                XCTAssertEqual(item.clipTo, expected.clipTo, at)
                compare.close(item.positions, expected.positions, "\(at) positions")
                compare.close(item.uvs, expected.uvs, "\(at) uvs")
            }
        }
        print("draw lists: \(file.cases.count) cases, \(compare.count) numbers, largest difference \(compare.largest)")
    }

    func testPlayerRun() throws {
        struct File: Decodable { let rig: String; let clips: String; let script: [ScriptStep]; let frames: [PlayerFrame] }
        let file = try loadVector("characters/format/vectors/player.json", as: File.self)
        let c = compile(try loadVector(file.rig, as: Rig.self))
        try runPlayer("player", c, try loadClips(file.clips), file.script, file.frames, checkTurn: false)
    }

    /// Step-key cuts, events and the order track on a loop, a blend from a blend from a blend, and a cut the host asks for.
    func testPlayerCutsRun() throws {
        struct File: Decodable { let rig: String; let clips: [Clip]; let script: [ScriptStep]; let frames: [PlayerFrame] }
        let file = try loadVector("characters/format/vectors/player-cuts.json", as: File.self)
        let c = compile(try loadVector(file.rig, as: Rig.self))
        try runPlayer("player cuts", c, file.clips, file.script, file.frames, checkTurn: true)
    }
}

/// A player vector's script step: {play, t, blendMs?}, {frame: t} or {cut: t}.
private struct ScriptStep: Decodable {
    let play: String?
    let t: Double?
    let blendMs: Double?
    let frame: Double?
    let cut: Double?
}

/// What a player vector holds for one frame; `turn` is the fake turn bone's channels, or null.
private struct PlayerFrame: Decodable {
    let t: Double
    let angle: [Double]
    let world: [[Double]]
    let views: Views
    let states: [String: String]
    let variant: String?
    let turn: Channels?
    let events: [String]
}

/// Runs a player vector's script and compares every frame it draws.
private func runPlayer(_ name: String, _ c: CompiledRig, _ clips: [Clip], _ script: [ScriptStep], _ frames: [PlayerFrame], checkTurn: Bool) throws {
    let player = Player(rig: c, clips: clips)
    XCTAssertFalse(frames.isEmpty)
    let compare = Comparison()
    var index = 0
    var events = 0
    for step in script {
        if let clip = step.play {
            try player.play(clip, at: try XCTUnwrap(step.t), blendMs: step.blendMs)
            continue
        }
        if let t = step.cut {
            try player.cut(at: t)
            continue
        }
        let t = try XCTUnwrap(step.frame)
        let frame = try player.advance(to: t)
        guard index < frames.count else {
            XCTFail("\(name): the script has more frames than the vectors")
            break
        }
        let x = frames[index]
        index += 1
        let at = "\(name) frame \(index - 1) at \(t) s"
        XCTAssertEqual(x.t, t, at)
        XCTAssertEqual(frame.pose.angle.count, x.angle.count, "\(at): bones")
        for i in 0..<min(frame.pose.angle.count, x.angle.count) {
            let bone = c.rig.bones[i].name
            compare.close(frame.pose.angle[i], x.angle[i], "\(at) \(bone) angle")
            compare.close(flat(frame.pose.world[i]), x.world[i], "\(at) \(bone) world")
        }
        XCTAssertEqual(frame.state.views, x.views, at)
        XCTAssertEqual(frame.state.states, x.states, at)
        XCTAssertEqual(frame.state.variant, x.variant, at)
        if checkTurn {
            switch (frame.state.turn, x.turn) {
            case (nil, nil):
                break
            case let (turn?, expected?):
                for channel in Channel.allCases {
                    XCTAssertEqual(turn[channel] == nil, expected[channel] == nil, "\(at) turn \(channel) present")
                    if let a = turn[channel], let b = expected[channel] { compare.close(a, b, "\(at) turn \(channel)") }
                }
            default:
                XCTFail("\(at): turn \(String(describing: frame.state.turn)) vs \(String(describing: x.turn))")
            }
        }
        let names = frame.events.map { e in e.name.map { $0.isEmpty ? e.type : "\(e.type):\($0)" } ?? e.type }
        XCTAssertEqual(names, x.events, at)
        events += names.count
    }
    XCTAssertEqual(index, frames.count, "\(name): frames run")
    print("\(name): \(index) frames, \(events) events, \(compare.count) numbers, largest difference \(compare.largest)")
}

/// Rules of the README checked on their own, so a failure names the rule.
final class EngineRuleTests: XCTestCase {
    private func rig(_ json: String) throws -> Rig { try JSONDecoder().decode(Rig.self, from: Data(json.utf8)) }

    /// README, Rig: a bone's scale reaches its parts and its children's pivot positions, never its children's own size.
    func testBoneScaleMovesChildPivotsButNeverScalesChildren() throws {
        let c = compile(try rig("""
        { "format": 1, "species": "unit", "height": 164, "views": ["front"], "parts": [], "drawOrder": { "front": [] },
          "bones": [ { "name": "root" },
                     { "name": "body", "parent": "root", "y": -4, "squash": [0.5, 2] },
                     { "name": "head", "parent": "body", "x": 3, "y": -10 } ] }
        """))
        let squash = 1.25
        let pose = evaluatePose(c, PoseInput(channels: ["body": Channels(squash: squash)], views: Views(body: "front", head: "front")))
        let body = 1, head = 2
        XCTAssertEqual(pose.scale[body].x, 1 / squash, accuracy: tolerance)
        XCTAssertEqual(pose.scale[body].y, squash, accuracy: tolerance)
        // The head's pivot sits where the squashed body's drawing puts it ...
        XCTAssertEqual(pose.world[head].tx, 3 / squash, accuracy: tolerance)
        XCTAssertEqual(pose.world[head].ty, -4 + -10 * squash, accuracy: tolerance)
        // ... but the head itself is neither squashed nor scaled.
        XCTAssertEqual(Array(flat(pose.world[head]).prefix(4)), [1, 0, 0, 1])
        XCTAssertEqual(pose.scale[head].x, 1)
        XCTAssertEqual(pose.scale[head].y, 1)
    }

    /// README, Rig: a variant of another view is ignored, and the view's own order is drawn.
    func testOrderIgnoresAnotherViewsVariant() throws {
        let c = compile(try loadVector("characters/test/src/rig.json", as: Rig.self))
        let variants = try XCTUnwrap(c.rig.drawOrderVariants)
        for (name, _) in variants {
            let view = String(name.split(separator: ":")[0])
            for other in c.rig.views where other != view {
                let views = Views(body: other, head: other)
                XCTAssertEqual(orderFor(c.rig, views, name), orderFor(c.rig, views, nil), "\(name) in \(other)")
            }
            let own = orderFor(c.rig, Views(body: view, head: view), name)
            XCTAssertNotEqual(own, orderFor(c.rig, Views(body: view, head: view), nil), "\(name) in its own view")
        }
    }

    /// README, The clock: a time earlier than the last one given is an error, and so is an unknown clip.
    func testClockNeverRunsBackwards() throws {
        let c = compile(try loadVector("characters/test/src/rig.json", as: Rig.self))
        let player = Player(rig: c, clips: try loadClips("characters/test/src/clips"))
        try player.play("idle", at: 0)
        _ = try player.advance(to: 0.5)
        XCTAssertThrowsError(try player.advance(to: 0.4)) { error in
            XCTAssertEqual(error as? PlayerError, .timeWentBackwards(0.4, after: 0.5))
        }
        XCTAssertThrowsError(try player.play("idle", at: 0.3))
        XCTAssertThrowsError(try player.play("no_such_clip", at: 0.6)) { error in
            XCTAssertEqual(error as? PlayerError, .unknownClip("no_such_clip"))
        }
        // Within the step slack is not backwards.
        _ = try player.advance(to: 0.5 - 1e-10)
    }

    /// README, The clock: looking ahead at the channels changes nothing (runtime-web/test/player.test.ts).
    func testLookingAheadAtTheChannelsChangesNothing() throws {
        let c = compile(try loadVector("characters/test/src/rig.json", as: Rig.self))
        let clips = try JSONDecoder().decode([Clip].self, from: Data("""
        [ { "name": "hold", "lengthMs": 500, "tracks": { "body": { "rot": [[0, -10]], "x": [[0, 10]] } }, "states": { "eye.L": [[0, "closed"]] } },
          { "name": "lean", "lengthMs": 400, "tracks": { "body": { "rot": [[0, 0], [400, 20, "easeInOut"]] } } } ]
        """.utf8))
        let plain = Player(rig: c, clips: clips)
        let peeking = Player(rig: c, clips: clips)
        for p in [plain, peeking] {
            try p.play("hold", at: 0)
            try p.play("lean", at: 0.1, blendMs: 200)
        }
        _ = peeking.channels(at: 5) // long after the blend has ended
        for t in [0.15, 0.2, 0.25] {
            XCTAssertEqual(try peeking.advance(to: t).pose.angle, try plain.advance(to: t).pose.angle, "at \(t) s")
        }
    }
}
